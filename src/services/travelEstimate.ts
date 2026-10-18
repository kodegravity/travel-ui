import type { LocationRequest } from '../types/api'
import type { TravelMode } from './tripStore'

interface Point {
  latitude: number
  longitude: number
}

/** Rough door-to-door model per mode: speed, a detour factor for street layouts, and a fixed overhead per leg. */
const MODEL: Record<TravelMode, { kmh: number; detour: number; overheadMin: number }> = {
  walk: { kmh: 4.5, detour: 1.3, overheadMin: 0 },
  transit: { kmh: 18, detour: 1.4, overheadMin: 8 },
  drive: { kmh: 22, detour: 1.4, overheadMin: 5 },
}

export function distanceKm(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLon = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function legMinutes(km: number, mode: TravelMode): number {
  const m = MODEL[mode]
  return km === 0 ? 0 : Math.round(((km * m.detour) / m.kmh) * 60 + m.overheadMin)
}

export interface TravelEstimate {
  minutes: number
  km: number
  legs: number
}

/**
 * Travel time for visiting the stops in the given order, starting from `start` when known. A rough estimate from
 * straight-line distances; real routing (Route Optimizer) will replace it.
 */
export function estimateTravel(stops: readonly Point[], mode: TravelMode, start: LocationRequest | null): TravelEstimate {
  const path: Point[] = start ? [start, ...stops] : [...stops]
  let minutes = 0
  let km = 0
  for (let i = 1; i < path.length; i += 1) {
    const legKm = distanceKm(path[i - 1]!, path[i]!)
    km += legKm
    minutes += legMinutes(legKm, mode)
  }
  return { minutes, km, legs: Math.max(0, path.length - 1) }
}
