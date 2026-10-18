import { describe, expect, it } from 'vitest'
import { distanceKm, estimateTravel, legMinutes } from './travelEstimate'

const SOL = { latitude: 40.4169, longitude: -3.7035 }
const PALACE = { latitude: 40.4179, longitude: -3.7143 }
const RETIRO = { latitude: 40.4153, longitude: -3.6844 }

describe('travelEstimate', () => {
  it('measures straight-line distance', () => {
    expect(distanceKm(SOL, PALACE)).toBeCloseTo(0.92, 1)
    expect(distanceKm(SOL, SOL)).toBe(0)
  })

  it('walks slower than it drives, and transit pays a wait per leg', () => {
    expect(legMinutes(2, 'walk')).toBe(35)
    expect(legMinutes(2, 'drive')).toBeLessThan(legMinutes(2, 'walk'))
    expect(legMinutes(0.1, 'transit')).toBeGreaterThanOrEqual(8)
    expect(legMinutes(0, 'transit')).toBe(0)
  })

  it('adds a leg from the starting point', () => {
    const withoutStart = estimateTravel([PALACE, RETIRO], 'walk', null)
    const fromSol = estimateTravel([PALACE, RETIRO], 'walk', SOL)

    expect(withoutStart.legs).toBe(1)
    expect(fromSol.legs).toBe(2)
    expect(fromSol.minutes).toBeGreaterThan(withoutStart.minutes)
  })

  it('depends on the visiting order', () => {
    const efficient = estimateTravel([PALACE, SOL, RETIRO], 'walk', null)
    const zigzag = estimateTravel([SOL, RETIRO, PALACE], 'walk', null)

    expect(zigzag.km).toBeGreaterThan(efficient.km)
  })

  it('is zero for an empty trip', () => {
    expect(estimateTravel([], 'walk', SOL)).toEqual({ minutes: 0, km: 0, legs: 0 })
  })
})
