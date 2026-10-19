import { CURRENCIES, INTERESTS, MAX_CUSTOM_TIME_MINUTES, type Currency, type TravelerPreferences } from '../types/travel'
import type { LocationRequest, RecommendationDto } from '../types/api'
import { cachedRequest } from './requestCache'
import { searchRecommendations } from './travelApi'
import { distanceKm, legMinutes, roadKm } from './travelEstimate'
import type { TravelMode } from './tripStore'

/** A place just off a leg of the route, and what going via it costs. */
export interface Detour {
  place: RecommendationDto
  /** Extra travel time compared with going straight. */
  extraMinutes: number
  extraKm: number
}

/** The most extra travel a detour may add, per mode. */
const MAX_EXTRA_MINUTES: Record<TravelMode, number> = { walk: 12, transit: 15, drive: 12 }
const MAX_DETOURS = 3
/** One search covers every interest; the route, not a budget, decides what fits. */
const SEARCH_SIZE = 20

/**
 * Places worth a short detour between two points, cheapest first. Going via a place costs the two legs through it
 * minus the direct leg, using the same distance model as the rest of the app.
 */
export function rankDetours(
  from: LocationRequest,
  to: LocationRequest,
  candidates: readonly RecommendationDto[],
  mode: TravelMode,
  excludeIds: ReadonlySet<string>,
): Detour[] {
  const direct = distanceKm(from, to)
  return candidates
    .filter((place) => !excludeIds.has(place.placeId))
    .map((place) => {
      const first = distanceKm(from, place)
      const second = distanceKm(place, to)
      return {
        place,
        extraMinutes: Math.max(0, legMinutes(first, mode) + legMinutes(second, mode) - legMinutes(direct, mode)),
        extraKm: Math.max(0, roadKm(first + second - direct, mode)),
      }
    })
    .filter((detour) => detour.extraMinutes <= MAX_EXTRA_MINUTES[mode])
    .sort((a, b) => a.extraMinutes - b.extraMinutes || Number(b.place.estimatedDurationMinutes != null) - Number(a.place.estimatedDurationMinutes != null))
    .slice(0, MAX_DETOURS)
}

function searchPreferences(currencyCode: string): TravelerPreferences {
  const currency: Currency = CURRENCIES.find((c) => c === currencyCode) ?? 'EUR'
  return { interests: [...INTERESTS], maxBudget: 100_000, currency, availableTimeMinutes: MAX_CUSTOM_TIME_MINUTES }
}

/**
 * Detours for one leg: a single search around the leg's midpoint (one capped Google search; repeats within a few
 * minutes reuse it), then ranking in the browser.
 */
export async function findDetours(
  from: LocationRequest,
  to: LocationRequest,
  mode: TravelMode,
  currencyCode: string,
  excludeIds: ReadonlySet<string>,
): Promise<Detour[]> {
  const mid = { latitude: (from.latitude + to.latitude) / 2, longitude: (from.longitude + to.longitude) / 2 }
  const key = `detours:${mid.latitude.toFixed(3)},${mid.longitude.toFixed(3)}`
  const result = await cachedRequest(key, () => searchRecommendations(searchPreferences(currencyCode), mid, 0, SEARCH_SIZE))
  return rankDetours(from, to, result.recommendations, mode, excludeIds)
}
