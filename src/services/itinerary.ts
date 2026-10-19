import { useSyncExternalStore } from 'react'
import { estimatedLeg, type Schedule } from './routePlanner'
import type { SavedPlace, TravelMode } from './tripStore'
import type { LocationRequest } from '../types/api'

/** The trip from the Route Optimizer, organised into days, saved on this device. */
export interface Itinerary {
  cityId: string
  /** First day, as YYYY-MM-DD. */
  startDate: string
  travelers: number
  mode: TravelMode
  /**
   * Where re-estimated legs start, and the label shown for the start ("Madrid centre", "Your location"). A device
   * location is never stored: with a "current location" start this holds the city centre instead.
   */
  start: LocationRequest
  startName: string
  /** "google" when the legs came from Google street routes. */
  source: 'google' | 'estimate'
  savedAt: string
  days: ItineraryDay[]
}

export interface ItineraryDay {
  /** Minutes after midnight the day starts. */
  startMinutes: number
  /** When the traveler wants to be done, in minutes after midnight; replanning aims for it. */
  finishBy?: number
  stops: ItineraryStop[]
}

export interface ItineraryStop {
  place: SavedPlace
  visitMinutes: number
  /** A start time the traveler set; otherwise the stop starts on arrival. */
  fixedStart?: number
  /** The leg arriving here, and the stop it starts from ("start" for the day's starting point). */
  leg: { km: number; minutes: number; estimated: boolean; from: string }
  /** The traveler has been here; replanning only changes what comes after. */
  done?: boolean
}

export interface TimedStop extends ItineraryStop {
  arrive: number
  begin: number
  end: number
  /** The traveler asked for a start before they could get there. */
  tooEarly: boolean
}

const STORAGE_KEY = 'roam.itinerary.v1'
export const DEFAULT_DAY_START = 9 * 60

/** Today in the traveler's local calendar, as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

/** An itinerary from the optimizer's schedule; split schedules become two days. */
export function itineraryFromSchedule(args: {
  cityId: string
  schedule: Schedule
  mode: TravelMode
  start: LocationRequest
  startName: string
  source: 'google' | 'estimate'
  startDate?: string
  travelers?: number
}): Itinerary {
  const days: ItineraryDay[] = []
  for (const stop of args.schedule.stops) {
    const index = stop.day - 1
    days[index] ??= { startMinutes: index === 0 ? DEFAULT_DAY_START : 10 * 60, stops: [] }
    const previous = days[index].stops.at(-1)
    days[index].stops.push({
      place: stop.place,
      visitMinutes: stop.visitMinutes,
      leg: {
        km: stop.leg.km,
        minutes: stop.leg.minutes,
        estimated: stop.leg.estimated,
        from: previous ? previous.place.placeId : 'start',
      },
    })
  }
  return {
    cityId: args.cityId,
    startDate: args.startDate ?? todayIso(),
    travelers: args.travelers ?? 1,
    mode: args.mode,
    start: { latitude: args.start.latitude, longitude: args.start.longitude },
    startName: args.startName,
    source: args.source,
    savedAt: new Date().toISOString(),
    days: days.filter(Boolean),
  }
}

/**
 * Re-estimates any leg whose previous stop changed (after a removal or a move between days), so times stay honest.
 * Legs that still start from the same place keep their original, possibly Google, times.
 */
export function relinkDay(day: ItineraryDay, start: LocationRequest, mode: TravelMode): ItineraryDay {
  return {
    ...day,
    stops: day.stops.map((stop, i) => {
      const from = i === 0 ? 'start' : day.stops[i - 1]!.place.placeId
      if (stop.leg.from === from) return stop
      const origin = i === 0 ? start : day.stops[i - 1]!.place
      return { ...stop, leg: { ...estimatedLeg(origin, stop.place, mode), estimated: true, from } }
    }),
  }
}

/** Arrival, start, and end of each stop. A stop never starts before the traveler can get there. */
export function timeDay(day: ItineraryDay): TimedStop[] {
  let clock = day.startMinutes
  return day.stops.map((stop) => {
    const arrive = clock + stop.leg.minutes
    const begin = stop.fixedStart != null ? Math.max(arrive, stop.fixedStart) : arrive
    const end = begin + stop.visitMinutes
    clock = end
    return { ...stop, arrive, begin, end, tooEarly: stop.fixedStart != null && stop.fixedStart < arrive }
  })
}

export function dayDate(itinerary: Itinerary, index: number): Date {
  const [y, m, d] = itinerary.startDate.split('-').map(Number)
  return new Date(y!, m! - 1, d! + index)
}

/** "Sat 14 Nov". */
export function formatDayDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Sat 14 – Mon 16 Nov 2026", or one date for a one-day trip. */
export function formatDateRange(itinerary: Itinerary): string {
  const first = dayDate(itinerary, 0)
  const last = dayDate(itinerary, itinerary.days.length - 1)
  const year = last.getFullYear()
  if (itinerary.days.length <= 1) return `${formatDayDate(first)} ${year}`
  return `${formatDayDate(first)} – ${formatDayDate(last)} ${year}`
}

// --- Export -----------------------------------------------------------------------------------------------------

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function icsDateTime(date: Date, minutes: number) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`
}

function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/**
 * A calendar file with one event per stop, in the city's own time zone, for Apple Calendar, Google Calendar, or
 * Outlook.
 */
export function toIcs(itinerary: Itinerary, cityName: string, timeZone: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ROAM AI//Itinerary//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsText(`${cityName} itinerary`)}`,
  ]
  itinerary.days.forEach((day, d) => {
    const date = dayDate(itinerary, d)
    for (const stop of timeDay(day)) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${icsText(`${itinerary.cityId}-${d}-${stop.place.placeId}`)}@roam-ai`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=${timeZone}:${icsDateTime(date, stop.begin)}`,
        `DTEND;TZID=${timeZone}:${icsDateTime(date, stop.end)}`,
        `SUMMARY:${icsText(stop.place.name)}`,
        `GEO:${stop.place.latitude.toFixed(6)};${stop.place.longitude.toFixed(6)}`,
        `LOCATION:${icsText(`${stop.place.name}, ${cityName}`)}`,
        ...(stop.place.mapsUrl ? [`URL:${stop.place.mapsUrl}`] : []),
        'END:VEVENT',
      )
    }
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** Plain text, for pasting into a message or notes. */
export function toPlainText(itinerary: Itinerary, cityName: string, clock: (m: number) => string): string {
  const out = [`My ${cityName} itinerary · ${formatDateRange(itinerary)}`]
  itinerary.days.forEach((day, d) => {
    out.push('', `Day ${d + 1} · ${formatDayDate(dayDate(itinerary, d))}`)
    for (const stop of timeDay(day)) out.push(`${clock(stop.begin)}–${clock(stop.end)}  ${stop.place.name}`)
    if (day.stops.length === 0) out.push('Nothing planned')
  })
  return out.join('\n')
}

// --- Store ------------------------------------------------------------------------------------------------------

type ItineraryState = Record<string, Itinerary>

function isItinerary(value: unknown): value is Itinerary {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<Itinerary>
  return (
    typeof v.cityId === 'string' &&
    typeof v.startDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.startDate) &&
    Array.isArray(v.days) &&
    v.days.every((day) => typeof day?.startMinutes === 'number' && Array.isArray(day.stops))
  )
}

function load(): ItineraryState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => isItinerary(v))) as ItineraryState
  } catch {
    return {}
  }
}

let state: ItineraryState = load()
const listeners = new Set<() => void>()

function commit(next: ItineraryState) {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: keep working in memory for this visit.
  }
  listeners.forEach((listener) => listener())
}

export function saveItinerary(itinerary: Itinerary) {
  commit({ ...state, [itinerary.cityId]: itinerary })
}

export function updateItinerary(cityId: string, change: (current: Itinerary) => Itinerary) {
  const current = state[cityId]
  if (current) commit({ ...state, [cityId]: change(current) })
}

export function useItineraries(): ItineraryState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
    () => ({}),
  )
}

/** Test helper. */
export function resetItineraries() {
  commit({})
}
