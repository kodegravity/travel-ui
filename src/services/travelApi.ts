import { API_BASE_URL } from '../config/env'
import { getAccessToken, oktaAuth } from '../config/okta'
import {
  REFRESH_STATUSES,
  type ApiProblem,
  type CreateTravelSessionRequest,
  type CreateTravelSessionResponse,
  type LocationRequest,
  type RecommendationDto,
  type TravelSessionRecommendationResponse,
} from '../types/api'
import type { TravelerPreferences } from '../types/travel'

const SESSIONS_PATH = '/api/v1/travel-sessions'

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

function isRecommendationResponse(value: unknown): value is TravelSessionRecommendationResponse {
  return (
    isRecord(value) &&
    typeof value.sessionId === 'string' &&
    typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt)) &&
    REFRESH_STATUSES.includes(value.refreshStatus as TravelSessionRecommendationResponse['refreshStatus']) &&
    Array.isArray(value.recommendations) &&
    value.recommendations.every(isRecommendationDto)
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
  method: 'POST' | 'DELETE',
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
export async function getSessionRecommendations(
  sessionId: string,
  location: LocationRequest,
  options: TravelApiRequestOptions = {},
): Promise<TravelSessionRecommendationResponse> {
  const response = await send(
    'POST',
    `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}/recommendations`,
    { location: { latitude: location.latitude, longitude: location.longitude } },
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
