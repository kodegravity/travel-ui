import { useCallback, useEffect, useState } from 'react'
import type { City } from '../data/destinations'
import { findCountry } from '../data/destinations'
import { describeTravelApiError, isAbortError, searchRecommendations } from '../services/travelApi'
import type { RecommendationDto } from '../types/api'
import { CURRENCIES, INTERESTS, MAX_CUSTOM_TIME_MINUTES, type Currency, type TravelerPreferences } from '../types/travel'

export type CityPlacesStatus = 'loading' | 'ready' | 'error'

export interface CityPlacesResult {
  status: CityPlacesStatus
  places: RecommendationDto[]
  errorMessage: string | null
  retry: () => void
}

/** Google returns at most 20 places per search, so one page holds them all. */
const PAGE_SIZE = 20
/** Browsing a city is not limited by budget; costs are only compared in the city's currency anyway. */
const BROWSE_BUDGET = 100_000

/**
 * Every interest at once, with the widest time window, so one search covers all category chips.
 * Filtering by category, text, and sort then happens in the browser at no extra API cost.
 */
function browsePreferences(city: City): TravelerPreferences {
  const code = findCountry(city.country)?.currency
  const currency: Currency = CURRENCIES.find((c) => c === code) ?? 'EUR'
  return {
    interests: [...INTERESTS],
    maxBudget: BROWSE_BUDGET,
    currency,
    availableTimeMinutes: MAX_CUSTOM_TIME_MINUTES,
  }
}

/** Loads the places around a city centre. One backend call (one Google call) per city visit or retry. */
export function useCityPlaces(city: City | undefined): CityPlacesResult {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; status: CityPlacesStatus; places: RecommendationDto[]; errorMessage: string | null }>({
    key: '',
    status: 'loading',
    places: [],
    errorMessage: null,
  })
  const requestKey = city ? `${city.id}#${attempt}` : ''

  useEffect(() => {
    if (!city) return
    const controller = new AbortController()
    searchRecommendations(browsePreferences(city), city.location, 0, PAGE_SIZE, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, status: 'ready', places: response.recommendations, errorMessage: null })
        }
      })
      .catch((error: unknown) => {
        if (isAbortError(error) || controller.signal.aborted) return
        setResult({ key: requestKey, status: 'error', places: [], errorMessage: describeTravelApiError(error) })
      })
    return () => controller.abort()
  }, [city, requestKey])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // A result for an older city or attempt still shows as loading for the current one.
  if (result.key !== requestKey) {
    return { status: 'loading', places: [], errorMessage: null, retry }
  }
  return { status: result.status, places: result.places, errorMessage: result.errorMessage, retry }
}
