import { API_BASE_URL } from '../config/env'
import { getAccessToken, oktaAuth } from '../config/okta'
import {
  EVENT_TYPES,
  REFRESH_STATUSES,
  type ApiProblem,
  type CreateTravelSessionRequest,
  type ChatReply,
  type ChatRequest,
  type CreateTravelSessionResponse,
  type EventType,
  type LiveSuggestion,
  type LocationRequest,
  type PagedRecommendationResponse,
  type OptimizedRoute,
  type PlaceDetails,
  type PlacePhoto,
  type RecommendationDto,
  type RecommendationSearchRequest,
  type RouteOptimizeRequest,
  type TravelSessionRecommendationResponse,
} from '../types/api'
import type { TravelerPreferences } from '../types/travel'

const SESSIONS_PATH = '/api/v1/travel-sessions'
const RECOMMENDATIONS_PATH = '/api/v1/recommendations'
const PLACES_PATH = '/api/v1/places'
const ROUTES_PATH = '/api/v1/routes/optimize'
const CHAT_PATH = '/api/v1/chat'
const TRAVEL_PLAN_PATH = '/api/v1/travel-plan'

export interface TravelApiRequestOptions {
  signal?: AbortSignal
}

/** Error from the travel API. Carries only the safe ProblemDetail fields, never stack traces. */
export class TravelApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | null
  readonly fieldErrors: Record<string, string>

  constructor(init: {
    status: number
    title: string
    detail: string | null
    fieldErrors?: Record<string, string>
  }) {
    super(init.detail ?? init.title)
    this.name = 'TravelApiError'
    this.status = init.status
    this.title = init.title
    this.detail = init.detail
    this.fieldErrors = init.fieldErrors ?? {}
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCreateSessionResponse(value: unknown): value is CreateTravelSessionResponse {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    value.sessionId.trim().length > 0 &&
    value.status === 'ACTIVE' &&
    typeof value.expiresAt === 'string'
  )
}

function isRecommendationDto(value: unknown): value is RecommendationDto {
  return (
    isRecord(value) &&
    typeof value.placeId === 'string' &&
    value.placeId.trim().length > 0 &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    typeof value.category === 'string' &&
    typeof value.description === 'string' &&
    typeof value.latitude === 'number' && Number.isFinite(value.latitude) &&
    typeof value.longitude === 'number' && Number.isFinite(value.longitude) &&
    (value.estimatedCost == null || (typeof value.estimatedCost === 'number' && Number.isFinite(value.estimatedCost))) &&
    (value.estimatedDurationMinutes == null || (typeof value.estimatedDurationMinutes === 'number' && Number.isFinite(value.estimatedDurationMinutes))) &&
    (value.currencyCode == null || typeof value.currencyCode === 'string') &&
    (value.mapsUrl == null || typeof value.mapsUrl === 'string')
  )
}

function isLiveSuggestion(value: unknown): value is LiveSuggestion {
  if (!isRecord(value) || !isRecord(value.event)) return false
  const event = value.event
  return (
    typeof value.headline === 'string' &&
    typeof value.message === 'string' &&
    typeof value.aiWritten === 'boolean' &&
    typeof event.id === 'string' &&
    typeof event.name === 'string' &&
    EVENT_TYPES.includes(event.type as EventType) &&
    typeof event.source === 'string' &&
    (event.startsAt === undefined || (typeof event.startsAt === 'string' && Number.isFinite(Date.parse(event.startsAt)))) &&
    (event.url === undefined || (typeof event.url === 'string' && event.url.startsWith('https://'))) &&
    (event.imageUrl === undefined || (typeof event.imageUrl === 'string' && event.imageUrl.startsWith('https://')))
  )
}

function isRecommendationResponse(value: unknown): value is TravelSessionRecommendationResponse {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt)) &&
    REFRESH_STATUSES.includes(value.refreshStatus as TravelSessionRecommendationResponse['refreshStatus']) &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every(isRecommendationDto) &&
    (value.liveSuggestions === undefined ||
      (Array.isArray(value.liveSuggestions) && value.liveSuggestions.every(isLiveSuggestion)))
  )
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPagedRecommendationResponse(value: unknown): value is PagedRecommendationResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every(isRecommendationDto) &&
    isNonNegativeInteger(value.page) &&
    isNonNegativeInteger(value.size) && value.size > 0 &&
    isNonNegativeInteger(value.totalElements) &&
    isNonNegativeInteger(value.totalPages) &&
    value.recommendations.length <= value.size
  )
}

function isOptional(value: unknown, type: 'string' | 'number' | 'boolean'): boolean {
  return value == null || (typeof value === type && (type !== 'number' || Number.isFinite(value)))
}

function isPlaceDetails(value: unknown): value is PlaceDetails {
  return (
    isRecord(value) &&
    typeof value.placeId === 'string' &&
    typeof value.name === 'string' &&
    value.name.trim().length > 0 &&
    isOptional(value.address, 'string') &&
    isOptional(value.latitude, 'number') &&
    isOptional(value.longitude, 'number') &&
    isOptional(value.rating, 'number') &&
    isOptional(value.userRatingCount, 'number') &&
    isOptional(value.openNow, 'boolean') &&
    isOptional(value.summary, 'string') &&
    isOptional(value.websiteUri, 'string') &&
    (value.weekdayHours == null || (Array.isArray(value.weekdayHours) && value.weekdayHours.every((d) => typeof d === 'string'))) &&
    (value.reviews == null || (Array.isArray(value.reviews) && value.reviews.every(isRecord))) &&
    (value.photo == null || (isRecord(value.photo) && typeof value.photo.url === 'string'))
  )
}

async function readProblem(response: Response): Promise<TravelApiError> {
  const fallbackTitle = `Request failed with status ${response.status}`
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!isRecord(body)) {
    return new TravelApiError({ status: response.status, title: fallbackTitle, detail: null })
  }

  const problem = body as ApiProblem
  const fieldErrors: Record<string, string> = {}
  if (isRecord(problem.errors)) {
    for (const [field, message] of Object.entries(problem.errors)) {
      if (typeof message === 'string') fieldErrors[field] = message
    }
  }

  return new TravelApiError({
    status: response.status,
    title: typeof problem.title === 'string' ? problem.title : fallbackTitle,
    detail: typeof problem.detail === 'string' ? problem.detail : null,
    fieldErrors,
  })
}

async function send(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  // Only look up a token when Okta is configured; otherwise requests go out unauthenticated as before.
  const accessToken = oktaAuth ? await getAccessToken() : null
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new TravelApiError({ status: 0, title: 'Network error', detail: null })
  }

  if (!response.ok) throw await readProblem(response)
  return response
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new TravelApiError({
      status: response.status,
      title: 'Invalid response',
      detail: 'The travel service returned an unexpected response.',
    })
  }
}

function invalidResponse(status: number): TravelApiError {
  return new TravelApiError({
    status,
    title: 'Invalid response',
    detail: 'The travel service returned an unexpected response.',
  })
}

export function toCreateTravelSessionRequest(
  preferences: TravelerPreferences,
): CreateTravelSessionRequest {
  return {
    interests: [...preferences.interests],
    maxBudget: preferences.maxBudget,
    currencyCode: preferences.currency,
    availableMinutes: preferences.availableTimeMinutes,
  }
}

/** POST /api/v1/travel-sessions. Returns the new session. No location is sent. */
export async function createTravelSession(
  preferences: TravelerPreferences,
  options: TravelApiRequestOptions = {},
): Promise<CreateTravelSessionResponse> {
  const response = await send(
    'POST',
    SESSIONS_PATH,
    toCreateTravelSessionRequest(preferences),
    options.signal,
  )
  const body = await readJson(response)
  if (!isCreateSessionResponse(body)) throw invalidResponse(response.status)
  return body
}

/** POST /api/v1/travel-sessions/{sessionId}/recommendations with the current location. */
export interface LiveEventOptions {
  /** Kinds of event to alert about; empty turns live alerts off. */
  eventTypes: readonly EventType[]
  /** Events already shown in this session, so they are not suggested again. */
  seenEventIds: readonly string[]
}

export async function getSessionRecommendations(
  sessionId: string,
  location: LocationRequest,
  options: TravelApiRequestOptions & { live?: LiveEventOptions } = {},
): Promise<TravelSessionRecommendationResponse> {
  const live = options.live && options.live.eventTypes.length > 0
    ? { eventTypes: [...options.live.eventTypes], seenEventIds: options.live.seenEventIds.slice(-200) }
    : {}
  const response = await send(
    'POST',
    `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}/recommendations`,
    { location: { latitude: location.latitude, longitude: location.longitude }, ...live },
    options.signal,
  )
  const body = await readJson(response)
  if (!isRecommendationResponse(body) || body.sessionId !== sessionId) throw invalidResponse(response.status)
  return body
}

/** DELETE /api/v1/travel-sessions/{sessionId}. Expects 204 No Content; the body is never parsed. */
export async function stopTravelSession(
  sessionId: string,
  options: TravelApiRequestOptions = {},
): Promise<void> {
  await send('DELETE', `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`, undefined, options.signal)
}

export function toRecommendationSearchRequest(
  preferences: TravelerPreferences,
  location: LocationRequest,
): RecommendationSearchRequest {
  return {
    location: { latitude: location.latitude, longitude: location.longitude },
    ...toCreateTravelSessionRequest(preferences),
  }
}

/**
 * POST /api/v1/recommendations?page=&size=. A one-off search that is not tied to a travel session.
 * Every call runs the search again on the backend (one attraction-provider call per page).
 */
export async function searchRecommendations(
  preferences: TravelerPreferences,
  location: LocationRequest,
  page: number,
  size: number,
  options: TravelApiRequestOptions = {},
): Promise<PagedRecommendationResponse> {
  const query = new URLSearchParams({ page: String(page), size: String(size) })
  const response = await send(
    'POST',
    `${RECOMMENDATIONS_PATH}?${query.toString()}`,
    toRecommendationSearchRequest(preferences, location),
    options.signal,
  )
  const body = await readJson(response)
  if (!isPagedRecommendationResponse(body) || body.page !== page) throw invalidResponse(response.status)
  return body
}

/**
 * GET /api/v1/places/{placeId}: address, rating, hours, one photo, and reviews when known.
 * Each call can cost a Google Place Details and a photo lookup, so callers should not repeat it needlessly.
 */
export async function getPlaceDetails(placeId: string, options: TravelApiRequestOptions = {}): Promise<PlaceDetails> {
  const response = await send('GET', `${PLACES_PATH}/${encodeURIComponent(placeId)}`, undefined, options.signal)
  const body = await readJson(response)
  if (!isPlaceDetails(body) || body.placeId !== placeId) throw invalidResponse(response.status)
  return body
}

function isPlacePhoto(value: unknown): value is PlacePhoto {
  if (typeof value !== 'object' || value === null) return false
  const photo = value as Partial<PlacePhoto>
  return typeof photo.url === 'string' && photo.url.startsWith('https://') && Array.isArray(photo.attributions ?? [])
}

function isOptimizedRoute(value: unknown, stops: number): value is OptimizedRoute {
  if (typeof value !== 'object' || value === null) return false
  const route = value as Partial<OptimizedRoute>
  return (
    Array.isArray(route.order) &&
    route.order.length === stops &&
    route.order.every((id) => typeof id === 'string') &&
    Array.isArray(route.legs) &&
    route.legs.length === stops &&
    route.legs.every((leg) => typeof leg?.distanceMeters === 'number' && typeof leg.durationSeconds === 'number') &&
    typeof route.source === 'string'
  )
}

/**
 * GET /api/v1/places/{placeId}/photo: one small photo for a place card, or 404 when the place has none.
 * Each call can cost a Google photo lookup (capped per day on the backend), so cache the result per session.
 */
export async function getPlacePhoto(placeId: string, options: TravelApiRequestOptions = {}): Promise<PlacePhoto> {
  const response = await send('GET', `${PLACES_PATH}/${encodeURIComponent(placeId)}/photo`, undefined, options.signal)
  const body = await readJson(response)
  if (!isPlacePhoto(body)) throw invalidResponse(response.status)
  return { ...body, attributions: body.attributions ?? [] }
}

/**
 * POST /api/v1/routes/optimize: the stops in a short visiting order with street travel times.
 * Each call can cost one Google Routes call (capped per day on the backend).
 */
export async function optimizeRoute(
  request: RouteOptimizeRequest,
  options: TravelApiRequestOptions = {},
): Promise<OptimizedRoute> {
  const response = await send('POST', ROUTES_PATH, request, options.signal)
  const body = await readJson(response)
  const ids = new Set(request.stops.map((stop) => stop.id))
  if (!isOptimizedRoute(body, request.stops.length) || !body.order.every((id) => ids.has(id))) {
    throw invalidResponse(response.status)
  }
  return body
}

function isChatReply(value: unknown): value is ChatReply {
  if (!isRecord(value) || typeof value.reply !== 'string' || typeof value.aiWritten !== 'boolean') return false
  if (!Array.isArray(value.suggestions)) return false
  const suggestionsOk = value.suggestions.every(
    (s) =>
      isRecord(s) &&
      typeof s.placeId === 'string' &&
      typeof s.name === 'string' &&
      Array.isArray(s.categories) &&
      typeof s.latitude === 'number' &&
      typeof s.longitude === 'number' &&
      typeof s.reason === 'string',
  )
  const weatherOk =
    value.weather === undefined ||
    (isRecord(value.weather) && typeof value.weather.summary === 'string' && typeof value.weather.rainLikely === 'boolean')
  return suggestionsOk && weatherOk
}

/**
 * POST /api/v1/chat: one "Ask ROAM" reply. Each call can cost one OpenAI reply (capped per day on the backend), and
 * at most one Google search per area every 15 minutes.
 */
export async function askRoam(request: ChatRequest, options: TravelApiRequestOptions = {}): Promise<ChatReply> {
  const response = await send('POST', CHAT_PATH, request, options.signal)
  const body = await readJson(response)
  if (!isChatReply(body)) throw invalidResponse(response.status)
  return body
}

/** One synced part of the traveler's plan; null data records a deletion. */
export interface TravelPlanEntry {
  updatedAt: string
  data: unknown
}

export interface TravelPlan {
  /** One-way hash of the signed-in traveler, to notice a different account on this browser. */
  ownerRef: string
  /** 0 when nothing is stored yet. */
  version: number
  entries: Record<string, TravelPlanEntry>
}

function isTravelPlan(value: unknown): value is TravelPlan {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<TravelPlan>
  return (
    typeof v.ownerRef === 'string' &&
    typeof v.version === 'number' &&
    typeof v.entries === 'object' &&
    v.entries !== null &&
    Object.values(v.entries).every((entry) => typeof (entry as TravelPlanEntry)?.updatedAt === 'string')
  )
}

/** GET /api/v1/travel-plan: the signed-in traveler's synced trips and itineraries. */
export async function getTravelPlan(options: TravelApiRequestOptions = {}): Promise<TravelPlan> {
  const response = await send('GET', TRAVEL_PLAN_PATH, undefined, options.signal)
  const body = await readJson(response)
  if (!isTravelPlan(body)) throw invalidResponse(response.status)
  return body
}

/** PUT /api/v1/travel-plan: replaces the plan if it is still at baseVersion; 409 when another device saved first. */
export async function saveTravelPlan(
  baseVersion: number,
  entries: Record<string, TravelPlanEntry>,
  options: TravelApiRequestOptions = {},
): Promise<TravelPlan> {
  const response = await send('PUT', TRAVEL_PLAN_PATH, { baseVersion, entries }, options.signal)
  const body = await readJson(response)
  if (!isTravelPlan(body)) throw invalidResponse(response.status)
  return body
}

/** Converts an API error into a message that is safe to show to the traveler. */
export function describeTravelApiError(error: unknown): string {
  if (!(error instanceof TravelApiError)) {
    return 'Something went wrong. Please try again.'
  }

  switch (error.status) {
    case 0:
      return "We couldn't reach the travel service. Check that the backend is running and try again."
    case 400:
      return error.detail ?? 'Some of the details were invalid. Please check them and try again.'
    case 401:
      return 'Your sign-in has expired. Please sign in again.'
    case 403:
      return "You don't have access to this travel session."
    case 404:
      return 'This travel session could not be found.'
    case 409:
      return error.title === 'Travel session stopped'
        ? 'This travel session has already been stopped.'
        : 'A check for new places is already running. Please try again in a moment.'
    case 410:
      return 'This travel session has expired.'
    case 429:
      return 'Too many requests in a short time. Please wait a moment and try again.'
    case 503:
      return error.title === 'Travel session capacity reached'
        ? 'Too many travel sessions are active right now. Please try again later.'
        : 'Nearby experiences are temporarily unavailable. Please try again.'
    default:
      return 'Something went wrong on our side. Please try again.'
  }
}

/** True when the backend reports the session as expired (410). */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof TravelApiError && error.status === 410
}

/** True when the backend no longer has an active session for this ID. */
export function isSessionGoneError(error: unknown): boolean {
  return (
    error instanceof TravelApiError &&
    (error.status === 404 || error.status === 410 || error.title === 'Travel session stopped')
  )
}
