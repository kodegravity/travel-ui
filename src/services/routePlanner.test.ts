import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSchedule, formatClock, formatKm, localRoute, planRoute } from './routePlanner'
import type { SavedPlace } from './tripStore'

const SOL = { latitude: 40.4169, longitude: -3.7035 }

function stop(id: string, latitude: number, longitude: number, minutes?: number): SavedPlace {
  return {
    placeId: id,
    cityId: 'madrid',
    name: id,
    category: 'HISTORY',
    latitude,
    longitude,
    ...(minutes != null ? { estimatedDurationMinutes: minutes } : {}),
  }
}

const PALACE = stop('palace', 40.4179, -3.7143, 90)
const MAYOR = stop('mayor', 40.4155, -3.7074, 60)
const PRADO = stop('prado', 40.4138, -3.6921, 120)
const RETIRO = stop('retiro', 40.4153, -3.6844, 60)

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('localRoute', () => {
  it('does one side of town before crossing to the other', () => {
    const route = localRoute([RETIRO, PALACE, PRADO, MAYOR], SOL, 'walk')

    expect(route.stops.slice(0, 2).map((p) => p.placeId).sort()).toEqual(['mayor', 'palace'])
    expect(route.stops.slice(2).map((p) => p.placeId)).toEqual(['prado', 'retiro'])
    expect(route.legs).toHaveLength(4)
    expect(route.source).toBe('estimate')
  })
})

describe('planRoute', () => {
  it('uses Google for walking and keeps its order, distances, and street lines', async () => {
    const fetchMock = vi.fn(async () =>
      json(200, {
        order: ['retiro', 'palace'],
        legs: [
          { distanceMeters: 1600, durationSeconds: 1260, polyline: 'abc' },
          { distanceMeters: 2900, durationSeconds: 2280 },
        ],
        distanceMeters: 4500,
        durationSeconds: 3540,
        source: 'google',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const route = await planRoute([PALACE, RETIRO], SOL, 'walk')

    expect(route.source).toBe('google')
    expect(route.stops.map((p) => p.placeId)).toEqual(['retiro', 'palace'])
    expect(route.legs[0]).toEqual({ km: 1.6, minutes: 21, polyline: 'abc' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/api/v1/routes/optimize')
    expect(JSON.parse(init.body as string)).toMatchObject({ mode: 'WALK', stops: [{ id: 'palace' }, { id: 'retiro' }] })
  })

  it('falls back to its own estimate when Google is refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { title: 'Attraction provider unavailable' })))

    const route = await planRoute([PALACE, RETIRO], SOL, 'drive')

    expect(route.source).toBe('estimate')
    expect(route.fallbackReason).toMatch(/daily limit/)
    expect(route.stops).toHaveLength(2)
  })

  it('never asks Google for transit', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const route = await planRoute([PALACE, RETIRO], SOL, 'transit')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(route.source).toBe('estimate')
    expect(route.fallbackReason).toBeUndefined()
  })
})

describe('buildSchedule', () => {
  const route = {
    stops: [PALACE, stop('cafe', 40.416, -3.703)],
    legs: [
      { km: 1, minutes: 15 },
      { km: 1, minutes: 10 },
    ],
    source: 'google' as const,
  }

  it('starts at 9:00 and assumes an hour where the visit time is unknown', () => {
    const schedule = buildSchedule(route, SOL, 'walk', false)

    expect(schedule.stops.map((s) => formatClock(s.arrive))).toEqual(['9:15 AM', '10:55 AM'])
    expect(schedule.stops[1]).toMatchObject({ visitMinutes: 60, visitKnown: false })
    expect(formatClock(schedule.end)).toBe('11:55 AM')
    expect(schedule.travelMinutes).toBe(25)
    expect(schedule.dayMinutes).toEqual([175])
  })

  it('splits into two days, the second starting at 10:00 from the starting point', () => {
    const schedule = buildSchedule(route, SOL, 'walk', true)

    expect(schedule.stops.map((s) => s.day)).toEqual([1, 2])
    expect(schedule.stops[1]).toMatchObject({ dayBreak: true })
    expect(schedule.stops[1]!.leg.estimated).toBe(true)
    expect(schedule.stops[1]!.arrive).toBeGreaterThan(10 * 60)
    expect(schedule.dayMinutes).toHaveLength(2)
  })

  it('formats clock times and distances', () => {
    expect(formatClock(12 * 60 + 5)).toBe('12:05 PM')
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatKm(0.85)).toBe('850 m')
    expect(formatKm(2.44)).toBe('2.4 km')
  })
})
