import { useCallback, useEffect, useRef, useState } from 'react'
import {
  describeLocationError,
  getCurrentLocation,
  LocationError,
} from '../services/geolocation'
import { describeTravelApiError, isAbortError, searchRecommendations } from '../services/travelApi'
import type { LocationRequest, PagedRecommendationResponse } from '../types/api'
import type { TravelerPreferences } from '../types/travel'

export type NearbySearchStatus = 'IDLE' | 'LOCATING' | 'LOADING' | 'SUCCESS' | 'ERROR'

/** Where to search: the browser's position, or a fixed point (city preset or typed coordinates). */
export type SearchTarget = { kind: 'current' } | { kind: 'fixed'; location: LocationRequest; label: string }

export interface NearbySearchState {
  status: NearbySearchStatus
  result: PagedRecommendationResponse | null
  errorMessage: string | null
  /** Human-readable place the current results are for. */
  locationLabel: string | null
  /** Search centre, kept in memory only so the map can show it. */
  center: LocationRequest | null
}

interface ActiveQuery {
  preferences: TravelerPreferences
  location: LocationRequest
  size: number
}

export interface UseNearbySearchResult {
  state: NearbySearchState
  isBusy: boolean
  /** Resolves true when the first page loaded. */
  search: (preferences: TravelerPreferences, target: SearchTarget, size: number) => Promise<boolean>
  goToPage: (page: number) => Promise<void>
}

const INITIAL_STATE: NearbySearchState = {
  status: 'IDLE',
  result: null,
  errorMessage: null,
  locationLabel: null,
  center: null,
}

function locationErrorMessage(error: unknown): string {
  return error instanceof LocationError ? describeLocationError(error.code) : "We couldn't get your location."
}

/**
 * One-off, paged search (POST /api/v1/recommendations), separate from Active Travel Mode.
 * A newer search or page change cancels the one in flight, so a slow response never overwrites newer results.
 */
export function useNearbySearch(): UseNearbySearchResult {
  const [state, setState] = useState<NearbySearchState>(INITIAL_STATE)
  const queryRef = useRef<ActiveQuery | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const startRequest = useCallback((): AbortController => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [])

  const loadPage = useCallback(
    async (query: ActiveQuery, page: number, controller: AbortController, locationLabel: string): Promise<boolean> => {
      setState((previous) => ({ ...previous, status: 'LOADING', errorMessage: null, locationLabel }))
      try {
        const result = await searchRecommendations(query.preferences, query.location, page, query.size, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return false
        setState({ status: 'SUCCESS', result, errorMessage: null, locationLabel, center: query.location })
        return true
      } catch (error) {
        if (isAbortError(error) || controller.signal.aborted) return false
        // Keep the previous page visible so a failed page change does not wipe the list.
        setState((previous) => ({ ...previous, status: 'ERROR', errorMessage: describeTravelApiError(error) }))
        return false
      }
    },
    [],
  )

  const search = useCallback(
    async (preferences: TravelerPreferences, target: SearchTarget, size: number) => {
      const controller = startRequest()
      let location: LocationRequest
      let label: string
      if (target.kind === 'current') {
        setState({ ...INITIAL_STATE, status: 'LOCATING' })
        try {
          location = await getCurrentLocation(controller.signal)
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) return false
          setState({ ...INITIAL_STATE, status: 'ERROR', errorMessage: locationErrorMessage(error) })
          return false
        }
        label = 'your current location'
      } else {
        location = target.location
        label = target.label
      }
      const query: ActiveQuery = { preferences, location, size }
      queryRef.current = query
      setState({ ...INITIAL_STATE, status: 'LOADING', locationLabel: label, center: location })
      return loadPage(query, 0, controller, label)
    },
    [loadPage, startRequest],
  )

  const goToPage = useCallback(
    async (page: number) => {
      const query = queryRef.current
      if (!query || page < 0) return
      await loadPage(query, page, startRequest(), state.locationLabel ?? '')
    },
    [loadPage, startRequest, state.locationLabel],
  )

  return {
    state,
    isBusy: state.status === 'LOCATING' || state.status === 'LOADING',
    search,
    goToPage,
  }
}
