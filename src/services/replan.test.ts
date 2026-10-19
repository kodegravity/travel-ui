import { describe, expect, it } from 'vitest'
import { timeDay, type Itinerary, type ItineraryStop } from './itinerary'
import { DEFAULT_FINISH_BY, lateness, replanDay } from './replan'
import { formatClock } from './routePlanner'
import type { SavedPlace } from './tripStore'

const SOL = { latitude: 40.4169, longitude: -3.7035 }

function place(id: string, latitude: number, longitude: number): SavedPlace {
  return { placeId: id, cityId: 'madrid', name: id, category: 'HISTORY', latitude, longitude }
}

function stop(p: SavedPlace, visit: number, legMinutes: number, from: string, done = false): ItineraryStop {
  return { place: p, visitMinutes: visit, leg: { km: 1, minutes: legMinutes, estimated: false, from }, ...(done ? { done } : {}) }
}

const PALACE = place('palace', 40.4179, -3.7143)
const MAYOR = place('mayor', 40.4155, -3.7074)
const PRADO = place('prado', 40.4138, -3.6921)
const RETIRO = place('retiro', 40.4153, -3.6844)
const TEMPLE = place('temple', 40.424, -3.7178)

/** 9:00 start: palace 9:10–11:10, mayor 11:20–13:20, prado 13:40–17:40, retiro 17:50–19:50, finish by 21:00. */
function itinerary(stops?: ItineraryStop[], finishBy = DEFAULT_FINISH_BY): Itinerary {
  return {
    cityId: 'madrid', startDate: '2026-11-14', travelers: 1, mode: 'walk', start: SOL, startName: 'Madrid centre',
    source: 'google', savedAt: '2026-10-19T00:00:00Z',
    days: [{
      startMinutes: 9 * 60, finishBy,
      stops: stops ?? [
        stop(PALACE, 120, 10, 'start', true),
        stop(MAYOR, 120, 10, 'palace'),
        stop(PRADO, 240, 20, 'mayor'),
        stop(RETIRO, 120, 10, 'prado'),
      ],
    }],
  }
}

describe('lateness', () => {
  it('measures how far past the current stop the traveler is, with a grace period', () => {
    const day = itinerary().days[0]!
    // Mayor (the first not done) should end at 13:20.
    expect(lateness(day, 13 * 60 + 30)).toBeNull()
    expect(lateness(day, 14 * 60)).toEqual({ delay: 40, currentIndex: 1 })
  })

  it('is never late once everything is done', () => {
    const done = itinerary().days[0]!
    expect(lateness({ ...done, stops: done.stops.map((s) => ({ ...s, done: true })) }, 23 * 60)).toBeNull()
  })
})

describe('replanDay', () => {
  it('just shifts the rest when the day still fits', () => {
    const plan = replanDay(itinerary(), 0, 30, formatClock)!

    expect(plan.shiftedEnd).toBe(19 * 60 + 50 + 30)
    expect(plan.options[0]).toMatchObject({ kind: 'shift', fits: true })
    const applied = plan.options[0]!.apply(itinerary())
    expect(timeDay(applied.days[0]!).map((s) => formatClock(s.begin))).toEqual(['9:10 AM', '11:50 AM', '2:10 PM', '6:20 PM'])
  })

  it('offers shorter visits, skipping, or moving a stop when the day would overrun', () => {
    const plan = replanDay(itinerary(), 0, 90, formatClock)!
    // Shifted: retiro ends 21:20, 20 min past 21:00.
    expect(plan.shiftedEnd).toBe(21 * 60 + 20)
    const kinds = plan.options.map((o) => o.kind)
    expect(kinds).toEqual(expect.arrayContaining(['shift', 'shorten', 'skip', 'move']))
    expect(plan.options.at(-1)).toMatchObject({ kind: 'shift', fits: false })

    const skip = plan.options.find((o) => o.kind === 'skip')!
    // Retiro (120 min) fits by itself and loses less than the Prado (240 min).
    expect(skip.title).toBe('Skip retiro')
    expect(skip.fits).toBe(true)

    const moved = plan.options.find((o) => o.kind === 'move')!.apply(itinerary())
    expect(moved.days[0]!.stops.map((s) => s.place.placeId)).toEqual(['palace', 'mayor', 'prado'])
    expect(moved.days[1]!.stops.map((s) => s.place.placeId)).toEqual(['retiro'])
    expect(moved.days[1]!.stops[0]!.leg).toMatchObject({ from: 'start', estimated: true })

    const shorter = plan.options.find((o) => o.kind === 'shorten')!
    expect(shorter.fits).toBe(true)
    const shortened = shorter.apply(itinerary()).days[0]!.stops
    expect(shortened[1]!.visitMinutes).toBe(120)
    expect(shortened[2]!.visitMinutes).toBeLessThan(240)
  })

  it('never touches stops already done, and suggests reordering when it saves time', () => {
    const zigzag = [
      stop(PALACE, 60, 10, 'start', true),
      stop(MAYOR, 60, 10, 'palace'),
      stop(RETIRO, 60, 40, 'mayor'),
      stop(TEMPLE, 60, 50, 'retiro'),
      stop(PRADO, 60, 45, 'temple'),
    ]
    const plan = replanDay(itinerary(zigzag), 0, 20, formatClock)!
    const reorder = plan.options.find((o) => o.kind === 'reorder')!

    const order = reorder.apply(itinerary(zigzag)).days[0]!.stops.map((s) => s.place.placeId)
    expect(order.slice(0, 2)).toEqual(['palace', 'mayor'])
    expect(order.slice(2)).not.toEqual(['retiro', 'temple', 'prado'])
    expect(reorder.end).toBeLessThan(plan.shiftedEnd)
  })

  it('has nothing to suggest when the day is finished', () => {
    const done = itinerary().days[0]!.stops.map((s) => ({ ...s, done: true }))
    expect(replanDay(itinerary(done), 0, 30, formatClock)).toBeNull()
  })
})
