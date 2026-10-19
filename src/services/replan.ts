import { localRoute } from './routePlanner'
import { formatMinutes } from './tripStore'
import { relinkDay, timeDay, type Itinerary, type ItineraryDay, type ItineraryStop, type TimedStop } from './itinerary'

/** Finish time used when the traveler has not set one. */
export const DEFAULT_FINISH_BY = 21 * 60
/** How far behind the plan counts as running late. */
export const LATE_GRACE_MINUTES = 15
/** Visits are shortened by at most this share. */
const MAX_SHORTEN = 0.25
/** A reorder must save at least this much to be worth suggesting. */
const MIN_REORDER_SAVING = 10

export type ReplanKind = 'shift' | 'shorten' | 'skip' | 'move' | 'reorder'

export interface ReplanOption {
  kind: ReplanKind
  title: string
  detail: string
  /** When the day would end with this option. */
  end: number
  fits: boolean
  apply: (itinerary: Itinerary) => Itinerary
}

export interface Replan {
  /** Minutes behind the plan. */
  delay: number
  /** Index of the stop the delay applies to: the first not yet done. */
  currentIndex: number
  finishBy: number
  /** When the day ends if everything just shifts. */
  shiftedEnd: number
  options: ReplanOption[]
}

export function finishBy(day: ItineraryDay): number {
  return day.finishBy ?? DEFAULT_FINISH_BY
}

/**
 * How late the traveler is right now on a day that is happening today: the first stop not marked done should have
 * ended by now (plus a grace period). Null when on time or finished.
 */
export function lateness(day: ItineraryDay, nowMinutes: number): { delay: number; currentIndex: number } | null {
  const timed = timeDay(day)
  const currentIndex = timed.findIndex((stop) => !stop.done)
  if (currentIndex < 0) return null
  const delay = nowMinutes - timed[currentIndex]!.end
  return delay >= LATE_GRACE_MINUTES ? { delay, currentIndex } : null
}

function endOf(day: ItineraryDay): number {
  return timeDay(day).at(-1)?.end ?? day.startMinutes
}

/** The day with the current stop starting {@code delay} minutes later; everything after follows. */
function shifted(day: ItineraryDay, timed: TimedStop[], currentIndex: number, delay: number): ItineraryDay {
  return {
    ...day,
    stops: day.stops.map((stop, i) => (i === currentIndex ? { ...stop, fixedStart: timed[i]!.begin + delay } : stop)),
  }
}

function withDay(itinerary: Itinerary, dayIndex: number, day: ItineraryDay): Itinerary {
  return { ...itinerary, days: itinerary.days.map((d, i) => (i === dayIndex ? day : d)) }
}

function names(stops: readonly ItineraryStop[]): string {
  const list = stops.map((s) => s.place.name)
  return list.length <= 2 ? list.join(' and ') : `${list.slice(0, -1).join(', ')}, and ${list.at(-1)}`
}

/**
 * Ways to absorb a delay of {@code delay} minutes at the first stop not yet done, best first. Every option keeps the
 * stops already done, and legs whose previous stop changes are re-estimated.
 */
export function replanDay(
  itinerary: Itinerary,
  dayIndex: number,
  delay: number,
  format: (minutes: number) => string,
): Replan | null {
  const day = itinerary.days[dayIndex]
  if (!day) return null
  const timed = timeDay(day)
  const currentIndex = timed.findIndex((stop) => !stop.done)
  if (currentIndex < 0 || delay <= 0) return null
  const target = finishBy(day)
  const relink = (d: ItineraryDay) => relinkDay(d, itinerary.start, itinerary.mode)
  const base = shifted(day, timed, currentIndex, delay)
  const shiftedEnd = endOf(base)
  const over = shiftedEnd - target
  const later = base.stops.slice(currentIndex + 1)
  const options: ReplanOption[] = []

  options.push({
    kind: 'shift',
    title: `Shift the rest by ${formatMinutes(delay)}`,
    detail:
      over > 0
        ? `Keep every stop and finish at ${format(shiftedEnd)}, ${formatMinutes(over)} after ${format(target)}.`
        : `Keep every stop and still finish by ${format(target)} (${format(shiftedEnd)}).`,
    end: shiftedEnd,
    fits: over <= 0,
    apply: (it) => withDay(it, dayIndex, base),
  })

  if (over > 0 && later.length > 0) {
    // Shorten the visits still ahead, by the same share, never more than a quarter, never under 15 minutes.
    const total = later.reduce((sum, s) => sum + s.visitMinutes, 0)
    const share = Math.min(MAX_SHORTEN, over / total)
    const shortened: ItineraryDay = {
      ...base,
      stops: base.stops.map((s, i) =>
        i > currentIndex ? { ...s, visitMinutes: Math.max(15, Math.round((s.visitMinutes * (1 - share)) / 5) * 5) } : s,
      ),
    }
    const end = endOf(shortened)
    if (end < shiftedEnd) {
      options.push({
        kind: 'shorten',
        title: 'Shorten the visits ahead',
        detail: `About ${Math.round(share * 100)}% less time at each of the next ${later.length} ${later.length === 1 ? 'stop' : 'stops'}; finish at ${format(end)}.`,
        end,
        fits: end <= target,
        apply: (it) => withDay(it, dayIndex, shortened),
      })
    }

    // Skip the stops whose removal fits the day while losing the least visit time.
    const dropped = cheapestToDrop(base, currentIndex, target, relink)
    if (dropped.length > 0) {
      const ids = new Set(dropped.map((s) => s.place.placeId))
      const without = relink({ ...base, stops: base.stops.filter((s) => !ids.has(s.place.placeId)) })
      const end = endOf(without)
      options.push({
        kind: 'skip',
        title: `Skip ${names(dropped)}`,
        detail: `Finish at ${format(end)}. Removed from this day, with Undo.`,
        end,
        fits: end <= target,
        apply: (it) => withDay(it, dayIndex, without),
      })
      const nextIndex = dayIndex + 1
      options.push({
        kind: 'move',
        title: `Move ${names(dropped)} to Day ${nextIndex + 1}`,
        detail: `Finish today at ${format(end)}; ${dropped.length === 1 ? 'it joins' : 'they join'} ${itinerary.days[nextIndex] ? 'the end of' : 'a new'} Day ${nextIndex + 1}.`,
        end,
        fits: end <= target,
        apply: (it) => {
          const days = it.days.map((d, i) => (i === dayIndex ? without : d))
          const moved = dropped.map((s) => ({ ...s, fixedStart: undefined, done: false }))
          const next = days[nextIndex] ?? { startMinutes: 9 * 60, stops: [] }
          days[nextIndex] = relink({ ...next, stops: [...next.stops, ...moved] })
          return { ...it, days }
        },
      })
    }
  }

  // Reorder what is left from the current stop, when that saves real time.
  if (later.length >= 2) {
    const current = base.stops[currentIndex]!.place
    const order = localRoute(later.map((s) => s.place), current, itinerary.mode).stops.map((p) => p.placeId)
    const byId = new Map(later.map((s) => [s.place.placeId, s]))
    const reordered = relink({
      ...base,
      stops: [...base.stops.slice(0, currentIndex + 1), ...order.map((id) => ({ ...byId.get(id)!, fixedStart: undefined }))],
    })
    const end = endOf(reordered)
    if (order.some((id, i) => id !== later[i]!.place.placeId) && shiftedEnd - end >= MIN_REORDER_SAVING) {
      options.push({
        kind: 'reorder',
        title: 'Reorder the rest from here',
        detail: `A shorter route from ${current.name} saves ${formatMinutes(shiftedEnd - end)}; finish at ${format(end)}.`,
        end,
        fits: end <= target,
        apply: (it) => withDay(it, dayIndex, reordered),
      })
    }
  }

  // Options that fit come first, then by earliest finish; keeping everything stays first when it already fits.
  options.sort((a, b) => Number(b.fits) - Number(a.fits) || (a.kind === 'shift' && a.fits ? -1 : b.kind === 'shift' && b.fits ? 1 : a.end - b.end))
  return { delay, currentIndex, finishBy: target, shiftedEnd, options }
}

/**
 * The stops after the current one to leave out so the day fits: the single stop that fits with the least visit time
 * lost, else the longest visits one by one until it fits (or none are left).
 */
function cheapestToDrop(
  day: ItineraryDay,
  currentIndex: number,
  target: number,
  relink: (d: ItineraryDay) => ItineraryDay,
): ItineraryStop[] {
  const later = day.stops.slice(currentIndex + 1)
  const without = (ids: Set<string>) => endOf(relink({ ...day, stops: day.stops.filter((s) => !ids.has(s.place.placeId)) }))
  const single = later
    .filter((s) => without(new Set([s.place.placeId])) <= target)
    .sort((a, b) => a.visitMinutes - b.visitMinutes)[0]
  if (single) return [single]
  const dropped: ItineraryStop[] = []
  for (const stop of [...later].sort((a, b) => b.visitMinutes - a.visitMinutes)) {
    dropped.push(stop)
    if (without(new Set(dropped.map((s) => s.place.placeId))) <= target) break
  }
  return dropped.length === later.length && without(new Set(dropped.map((s) => s.place.placeId))) > target ? [] : dropped
}
