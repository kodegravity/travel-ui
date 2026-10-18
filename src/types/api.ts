import type { Interest } from './travel'

/** Mirrors docs/FRONTEND_API_INTEGRATION.md in the backend repository. */

export type RefreshStatus = 'UPDATED' | 'UNCHANGED' | 'NO_NEW_RESULTS'

export const REFRESH_STATUSES: readonly RefreshStatus[] = ['UPDATED', 'UNCHANGED', 'NO_NEW_RESULTS']

export interface LocationRequest {
  latitude: number
  longitude: number
}

export interface CreateTravelSessionRequest {
  interests: Interest[]
  maxBudget: number
  currencyCode: string
  availableMinutes: number
}

export interface TravelSessionRefreshRequest {
  location: LocationRequest
}

export interface CreateTravelSessionResponse {
  sessionId: string
  status: 'ACTIVE'
  expiresAt: string
}

export interface RecommendationDto {
  placeId: string
  name: string
  category: string
  description: string
  latitude: number
  longitude: number
  /** Omitted by the backend when unknown. */
  estimatedDurationMinutes?: number
  /** Omitted by the backend when unknown. */
  estimatedCost?: number
  /** Present only when estimatedCost is present. */
  currencyCode?: string
  /** Google Maps walking directions, when available. */
  mapsUrl?: string
}

export interface TravelSessionRecommendationResponse {
  sessionId: string
  refreshStatus: RefreshStatus
  recommendations: RecommendationDto[]
  generatedAt: string
}

/** POST /api/v1/recommendations body: a one-off search at a location. */
export interface RecommendationSearchRequest {
  location: LocationRequest
  interests: Interest[]
  maxBudget: number
  currencyCode: string
  availableMinutes: number
}

/** One page of POST /api/v1/recommendations results, best first. */
export interface PagedRecommendationResponse {
  recommendations: RecommendationDto[]
  /** Zero-based. */
  page: number
  size: number
  totalElements: number
  totalPages: number
}

/** Page sizes the backend accepts are 1-50; the UI offers these. */
export const SEARCH_PAGE_SIZES = [5, 10, 20] as const

export type SearchPageSize = (typeof SEARCH_PAGE_SIZES)[number]

/** RFC 9457 problem detail returned by the backend for errors. */
export interface ApiProblem {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string>
}
