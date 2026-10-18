import { cachedRequest, forgetRequest } from './requestCache'
import { describeTravelApiError, optimizeRoute } from './travelApi'
import { distanceKm, legMinutes, roadKm } from './travelEstimate'
import type { SavedPlace, TravelMode } from './tripStore'
import type { LocationRequest } from '../types/api'

export interface RouteLeg {
  km: number
  minutes: number
  /** Google encoded polyline of the street route; absent for estimates. */
  polyline?: string
}

export interface PlannedRoute {
  /** Stops in visiting order. */
  stops: SavedPlace[]
  /** legs[0] runs from the start to stops[0]. */
  legs: RouteLeg[]
  source: 'google' | 'estimate'
  /** Why Google was not used, when it was asked and could not answer. */
  fallbackReason?: string
}

/** Visit time assumed for the schedule when a place has no estimate. */
export const ASSUMED_VISIT_MINUTES = 60

/** Free routing: nearest neighbour from the start, then 2-opt until no reversal shortens the path. */
export function localRoute(places: readonly SavedPlace[], start: LocationRequest, mode: TravelMode): PlannedRoute {
  const left = [...places]
  const path: SavedPlace[] = []
  let at: LocationRequest = start
  while (left.length > 0) {
    let best = 0
    for (let i = 1; i < left.length; i++) {
      if (distanceKm(at, left[i]!) < distanceKm(at, left[best]!)) best = i
    }
    const next = left.splice(best, 1)[0]!
    path.push(next)
    at = next
  }
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = i + 1; j < path.length; j++) {
        const before = i === 0 ? start : path[i - 1]!
        const after = path[j + 1]
        const removed = distanceKm(before, path[i]!) + (after ? distanceKm(path[j]!, after) : 0)
        const added = distanceKm(before, path[j]!) + (after ? distanceKm(path[i]!, after) : 0)
        if (removed - added > 1e-9) {
          path.splice(i, j - i + 1, ...path.slice(i, j + 1).reverse())
          improved = true
        }
      }
    }
  }
  return { stops: path, legs: estimatedLegs(start, path, mode), source: 'estimate' }
}

export function estimatedLeg(from: LocationRequest, to: LocationRequest, mode: TravelMode): RouteLeg {
  const km = distanceKm(from, to)
  return { km: roadKm(km, mode), minutes: legMinutes(km, mode) }
}

function estimatedLegs(start: LocationRequest, stops: readonly SavedPlace[], mode: TravelMode): RouteLeg[] {
  return stops.map((stop, i) => estimatedLeg(i === 0 ? start : stops[i - 1]!, stop, mode))
}

function cacheKey(places: readonly SavedPlace[], start: LocationRequest, mode: TravelMode) {
  const ids = places.map((p) => p.placeId).sort().join(',')
  return `route:${mode}:${start.latitude.toFixed(4)},${start.longitude.toFixed(4)}:${ids}`
}

/**
 * The best visiting order with travel times. Walking and driving ask Google (street routes, one capped call;
 * repeated within a few minutes it is not asked again). Transit, and any refusal or failure, uses the free
 * local optimizer, so the page always has a route.
 */
export async function planRoute(
  places: readonly SavedPlace[],
  start: LocationRequest,
  mode: TravelMode,
  options: { fresh?: boolean } = {},
): Promise<PlannedRoute> {
  if (mode === 'transit' || places.length < 2) return localRoute(places, start, mode)
  const key = cacheKey(places, start, mode)
  if (options.fresh) forgetRequest(key)
  try {
    const route = await cachedRequest(key, () =>
      optimizeRoute({
        mode: mode === 'drive' ? 'DRIVE' : 'WALK',
        origin: { latitude: start.latitude, longitude: start.longitude },
        stops: places.map((p) => ({ id: p.placeId, latitude: p.latitude, longitude: p.longitude })),
      }),
    )
    const byId = new Map(places.map((p) => [p.placeId, p]))
    return {
      stops: route.order.map((id) => byId.get(id)!),
      legs: route.legs.map((leg) => ({
        km: leg.distanceMeters / 1000,
        minutes: Math.round(leg.durationSeconds / 60),
        ...(leg.polyline ? { polyline: leg.polyline } : {}),
      })),
      source: route.source === 'google' ? 'google' : 'estimate',
    }
  } catch (error) {
    return { ...localRoute(places, start, mode), fallbackReason: describeRouteError(error) }
  }
}

function describeRouteError(error: unknown): string {
  const message = describeTravelApiError(error)
  return message.startsWith('Nearby experiences are temporarily unavailable')
    ? "Google routing isn't available right now (the daily limit may be used up)."
    : message
}

export interface ScheduledStop {
  place: SavedPlace
  number: number
  /** The leg that arrives here. */
  leg: RouteLeg & { estimated: boolean }
  /** Minutes after midnight. */
  arrive: number
  visitMinutes: number
  visitKnown: boolean
  /** True for the first stop of day 2. */
  dayBreak: boolean
  day: 1 | 2
}

export interface Schedule {
  stops: ScheduledStop[]
  travelMinutes: number
  visitMinutes: number
  km: number
  /** Minutes from the first departure to the last stop's end, per day. */
  dayMinutes: number[]
  end: number
}

export const DAY_START = 9 * 60
export const DAY_TWO_START = 10 * 60
/** Days longer than this get the "split into 2 days" suggestion. */
export const LONG_DAY_MINUTES = 10 * 60

/**
 * Times for the route, starting at 9:00. Split days break where day 1 passes half the total; day 2 starts at 10:00
 * from the same starting point, with an estimated first leg.
 */
export function buildSchedule(route: PlannedRoute, start: LocationRequest, mode: TravelMode, split: boolean): Schedule {
  const visitOf = (p: SavedPlace) => p.estimatedDurationMinutes ?? ASSUMED_VISIT_MINUTES
  const total = route.stops.reduce((sum, p, i) => sum + visitOf(p) + route.legs[i]!.minutes, 0)
  let breakAt = -1
  if (split && route.stops.length > 1) {
    let elapsed = 0
    for (let i = 0; i < route.stops.length; i++) {
      elapsed += route.legs[i]!.minutes + visitOf(route.stops[i]!)
      if (elapsed >= total / 2) {
        breakAt = Math.min(i + 1, route.stops.length - 1)
        break
      }
    }
  }

  let clock = DAY_START
  let dayStart = DAY_START
  const dayMinutes: number[] = []
  const stops: ScheduledStop[] = route.stops.map((place, i) => {
    const dayBreak = i === breakAt
    if (dayBreak) {
      dayMinutes.push(clock - dayStart)
      clock = DAY_TWO_START
      dayStart = DAY_TWO_START
    }
    const leg = dayBreak
      ? { ...estimatedLeg(start, place, mode), estimated: true }
      : { ...route.legs[i]!, estimated: route.source !== 'google' }
    clock += leg.minutes
    const arrive = clock
    const visitMinutes = visitOf(place)
    clock += visitMinutes
    return {
      place,
      number: i + 1,
      leg,
      arrive,
      visitMinutes,
      visitKnown: place.estimatedDurationMinutes != null,
      dayBreak,
      day: breakAt >= 0 && i >= breakAt ? 2 : 1,
    }
  })
  dayMinutes.push(clock - dayStart)

  return {
    stops,
    travelMinutes: stops.reduce((sum, s) => sum + s.leg.minutes, 0),
    visitMinutes: stops.reduce((sum, s) => sum + s.visitMinutes, 0),
    km: stops.reduce((sum, s) => sum + s.leg.km, 0),
    dayMinutes,
    end: clock,
  }
}

/** "9:05 AM". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = Math.round(minutes % 60)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "850 m" or "2.4 km". */
export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
