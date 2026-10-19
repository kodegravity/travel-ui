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
  /** Live event alerts; absent from older backends, empty when alerts are off or nothing new is on. */
  liveSuggestions?: LiveSuggestion[]
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

/** GET /api/v1/places/{placeId}. Every field but the id and name can be missing. */
export interface PlaceDetails {
  placeId: string
  name: string
  address?: string
  latitude?: number
  longitude?: number
  rating?: number
  userRatingCount?: number
  openNow?: boolean
  /** One line per day, formatted by the provider. */
  weekdayHours?: string[]
  websiteUri?: string
  googleMapsUri?: string
  summary?: string
  /** Google's level, such as PRICE_LEVEL_MODERATE. */
  priceLevel?: string
  accessibility?: {
    wheelchairAccessibleEntrance?: boolean
    wheelchairAccessibleRestroom?: boolean
    wheelchairAccessibleSeating?: boolean
    wheelchairAccessibleParking?: boolean
  }
  photo?: PlacePhoto
  reviews?: PlaceReview[]
  /** "google" or "sample", for the attribution line. */
  source?: string
}

export interface PlaceAttribution {
  displayName?: string
  uri?: string
}

export interface PlaceReview {
  authorName?: string
  authorUri?: string
  rating?: number
  text?: string
  relativeTime?: string
}

/** RFC 9457 problem detail returned by the backend for errors. */
export interface ApiProblem {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
  errors?: Record<string, string>
}

/** A Google place photo: a short-lived image URL plus the author credits Google requires us to show. */
export interface PlacePhoto {
  url: string
  widthPx?: number
  heightPx?: number
  attributions: PlaceAttribution[]
}

/** POST /api/v1/routes/optimize. Google optimizes walking and driving only. */
export interface RouteOptimizeRequest {
  mode: 'WALK' | 'DRIVE'
  origin: LocationRequest
  stops: { id: string; latitude: number; longitude: number }[]
}

/** legs[0] runs from the origin to order[0], legs[i] from order[i-1] to order[i]. */
export interface OptimizedRoute {
  order: string[]
  legs: { distanceMeters: number; durationSeconds: number; polyline?: string }[]
  distanceMeters: number
  durationSeconds: number
  /** "google" for street routes, "estimate" for distance-based estimates. */
  source: string
}

export const EVENT_TYPES = ['SPORTS', 'MUSIC', 'ARTS', 'FAMILY', 'OTHER'] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** A ticketed event near the traveler. Times and venue come from the event source, never from the AI. */
export interface LiveEvent {
  id: string
  name: string
  type: EventType
  genre?: string
  venueName?: string
  latitude?: number
  longitude?: number
  /** ISO instant; absent when only a date is announced. */
  startsAt?: string
  localDate?: string
  localTime?: string
  distanceKm?: number
  url?: string
  imageUrl?: string
  /** "ticketmaster" or "sample". */
  source: string
}

export interface LiveSuggestion {
  event: LiveEvent
  headline: string
  message: string
  /** True when the AI chose the event and wrote the text. */
  aiWritten: boolean
}

/** "Ask ROAM" chat. The app keeps the conversation and sends the recent turns each time; nothing is stored. */
export interface ChatTurn {
  role: 'USER' | 'ASSISTANT'
  content: string
}

export interface ChatContext {
  /** Where the traveler is, when they share it; otherwise the city centre. */
  location?: LocationRequest
  placeName?: string
  /** Local date and time, such as 2026-10-19T14:30. */
  localDateTime: string
  interests?: string[]
  maxBudget?: number
  currencyCode?: string
  availableMinutes?: number
  tripStops?: string[]
}

export interface ChatRequest {
  messages: ChatTurn[]
  context: ChatContext
}

export interface ChatSuggestion {
  placeId: string
  name: string
  categories: string[]
  latitude: number
  longitude: number
  distanceKm?: number
  estimatedDurationMinutes?: number
  estimatedCost?: number
  currencyCode?: string
  reason: string
}

export interface ChatWeather {
  summary: string
  temperatureC?: number
  rainLikely: boolean
  rainChancePct?: number
  isDay: boolean
}

export interface ChatReply {
  reply: string
  suggestions: ChatSuggestion[]
  weather?: ChatWeather
  /** False when the AI was unavailable and the answer is rule-based. */
  aiWritten: boolean
}
