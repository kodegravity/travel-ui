import { describe, expect, it } from 'vitest'
import {
  formatDateRange,
  itineraryFromSchedule,
  relinkDay,
  timeDay,
  toIcs,
  toPlainText,
  type Itinerary,
  type ItineraryDay,
} from './itinerary'
import { buildSchedule, formatClock } from './routePlanner'
import type { SavedPlace } from './tripStore'

const SOL = { latitude: 40.4169, longitude: -3.7035 }

function place(id: string, latitude: number, longitude: number, minutes: number): SavedPlace {
  return { placeId: id, cityId: 'madrid', name: id, category: 'HISTORY', latitude, longitude, estimatedDurationMinutes: minutes }
}

const PALACE = place('palace', 40.4179, -3.7143, 90)
const PRADO = place('prado', 40.4138, -3.6921, 120)
const RETIRO = place('retiro', 40.4153, -3.6844, 60)

const ROUTE = {
  stops: [PALACE, PRADO, RETIRO],
  legs: [
    { km: 1, minutes: 15 },
    { km: 2, minutes: 25 },
    { km: 0.7, minutes: 9 },
  ],
  source: 'google' as const,
}

function fromRoute(split = false, startDate = '2026-11-14'): Itinerary {
  return itineraryFromSchedule({
    cityId: 'madrid',
    schedule: buildSchedule(ROUTE, SOL, 'walk', split),
    mode: 'walk',
    start: SOL,
    startName: 'Madrid centre',
    source: 'google',
    startDate,
  })
}

describe('itinerary', () => {
  it('keeps the optimizer schedule as one day, legs and all', () => {
    const itinerary = fromRoute()

    expect(itinerary.days).toHaveLength(1)
    const timed = timeDay(itinerary.days[0]!)
    expect(timed.map((s) => formatClock(s.begin))).toEqual(['9:15 AM', '11:10 AM', '1:19 PM'])
    expect(timed.map((s) => s.leg.from)).toEqual(['start', 'palace', 'prado'])
    expect(timed.every((s) => !s.leg.estimated)).toBe(true)
  })

  it('turns a split schedule into two days, the second starting at 10:00', () => {
    const itinerary = fromRoute(true)

    expect(itinerary.days).toHaveLength(2)
    expect(itinerary.days[1]!.startMinutes).toBe(600)
    expect(itinerary.days[1]!.stops[0]!.leg.from).toBe('start')
    expect(formatDateRange(itinerary)).toBe('Sat 14 Nov – Sun 15 Nov 2026')
  })

  it('never starts a stop before the traveler can arrive, and waits for a later chosen time', () => {
    const day: ItineraryDay = fromRoute().days[0]!
    const later = { ...day, stops: day.stops.map((s, i) => (i === 1 ? { ...s, fixedStart: 13 * 60 } : s)) }
    const earlier = { ...day, stops: day.stops.map((s, i) => (i === 1 ? { ...s, fixedStart: 9 * 60 } : s)) }

    const waited = timeDay(later)
    expect(formatClock(waited[1]!.begin)).toBe('1:00 PM')
    expect(formatClock(waited[2]!.arrive)).toBe('3:09 PM')
    expect(timeDay(earlier)[1]).toMatchObject({ tooEarly: true })
    expect(formatClock(timeDay(earlier)[1]!.begin)).toBe('11:10 AM')
  })

  it('re-estimates only the legs whose previous stop changed', () => {
    const day = fromRoute().days[0]!
    const withoutPalace = relinkDay({ ...day, stops: day.stops.slice(1) }, SOL, 'walk')

    expect(withoutPalace.stops[0]!.leg).toMatchObject({ from: 'start', estimated: true })
    expect(withoutPalace.stops[1]!.leg).toEqual(day.stops[2]!.leg)
  })

  it('exports a calendar event per stop in the city time zone', () => {
    const ics = toIcs(fromRoute(true), 'Madrid', 'Europe/Madrid', new Date('2026-10-01T12:00:00Z'))

    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
    expect(ics).toContain('DTSTART;TZID=Europe/Madrid:20261114T091500')
    expect(ics).toContain('DTSTART;TZID=Europe/Madrid:20261115T')
    expect(ics).toContain('SUMMARY:palace')
    expect(ics).toContain('GEO:40.417900;-3.714300')
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('writes plain text by day', () => {
    const text = toPlainText(fromRoute(), 'Madrid', formatClock)

    expect(text.split('\n')).toEqual([
      'My Madrid itinerary · Sat 14 Nov 2026',
      '',
      'Day 1 · Sat 14 Nov',
      '9:15 AM–10:45 AM  palace',
      '11:10 AM–1:10 PM  prado',
      '1:19 PM–2:19 PM  retiro',
    ])
  })
})
