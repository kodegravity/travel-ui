import { describe, expect, it } from 'vitest'
import { rankDetours } from './detours'
import type { RecommendationDto } from '../types/api'

const PALACE = { latitude: 40.4179, longitude: -3.7143 }
const PRADO = { latitude: 40.4138, longitude: -3.6921 }

function place(id: string, latitude: number, longitude: number, minutes?: number): RecommendationDto {
  return { placeId: id, name: id, category: 'HISTORY', description: '', latitude, longitude,
    ...(minutes != null ? { estimatedDurationMinutes: minutes } : {}) }
}

describe('rankDetours', () => {
  // Sol and Plaza Mayor sit almost on the Palace → Prado line; Retiro is past the Prado; Debod is the other way.
  const SOL = place('sol', 40.4169, -3.7035, 30)
  const MAYOR = place('mayor', 40.4155, -3.7074, 45)
  const RETIRO = place('retiro', 40.4153, -3.6844, 90)
  const DEBOD = place('debod', 40.424, -3.7178, 30)

  it('keeps places just off the route, cheapest detour first', () => {
    const detours = rankDetours(PALACE, PRADO, [RETIRO, DEBOD, MAYOR, SOL], 'walk', new Set())

    // Retiro lies past the Prado: about 23 extra minutes on foot, so it is not "on the way".
    expect(detours.map((d) => d.place.placeId)).toEqual(['mayor', 'sol'])
    expect(detours[0]!.extraMinutes).toBeLessThanOrEqual(2)
    expect(detours.every((d) => d.extraMinutes <= 12)).toBe(true)
  })

  it('skips places already planned and places well off the route', () => {
    expect(rankDetours(PALACE, PRADO, [MAYOR, SOL], 'walk', new Set(['mayor'])).map((d) => d.place.placeId)).toEqual(['sol'])
    const farOff = place('far', 40.43, -3.70, 30)
    expect(rankDetours(PALACE, PRADO, [farOff], 'walk', new Set())).toEqual([])
  })

  it('returns at most three', () => {
    const many = Array.from({ length: 6 }, (_, i) => place(`p${i}`, 40.4155 + i * 0.0002, -3.705))
    expect(rankDetours(PALACE, PRADO, many, 'walk', new Set())).toHaveLength(3)
  })
})
