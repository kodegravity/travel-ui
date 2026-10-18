import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TravelApiError,
  createTravelSession,
  describeTravelApiError,
  getSessionRecommendations,
  isSessionGoneError,
  stopTravelSession,
} from './travelApi'
import type { TravelerPreferences } from '../types/travel'

const preferences: TravelerPreferences = {
  interests: ['HISTORY', 'ART'],
  maxBudget: 50,
  currency: 'EUR',
  availableTimeMinutes: 180,
}

function stubFetch(response: Response | Error | DOMException) {
  const fetchMock = vi.fn(async () => {
    if (!(response instanceof Response)) throw response
    return response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createTravelSession', () => {
  it('POSTs the backend field names as JSON', async () => {
    const fetchMock = stubFetch(
      json(201, { sessionId: 's1', status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' }),
    )

    const session = await createTravelSession(preferences)

    expect(session.sessionId).toBe('s1')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/api/v1/travel-sessions')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({
      interests: ['HISTORY', 'ART'],
      maxBudget: 50,
      currencyCode: 'EUR',
      availableMinutes: 180,
    })
  })

  it('rejects a response that does not match the documented contract', async () => {
    stubFetch(json(201, { id: 'wrong-field' }))

    await expect(createTravelSession(preferences)).rejects.toMatchObject({
      name: 'TravelApiError',
      title: 'Invalid response',
    })
  })

  it('maps a ProblemDetail error body into TravelApiError', async () => {
    stubFetch(
      json(400, {
        title: 'Validation failed',
        status: 400,
        detail: 'Some fields are invalid.',
        errors: { maxBudget: 'must be zero or more' },
      }),
    )

    const error = await createTravelSession(preferences).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(TravelApiError)
    expect(error).toMatchObject({
      status: 400,
      title: 'Validation failed',
      detail: 'Some fields are invalid.',
      fieldErrors: { maxBudget: 'must be zero or more' },
    })
  })

  it('uses a generic title when the error body is not JSON', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }))

    await expect(createTravelSession(preferences)).rejects.toMatchObject({
      status: 502,
      title: 'Request failed with status 502',
      detail: null,
    })
  })

  it('reports a network failure as status 0 without the underlying message', async () => {
    stubFetch(new TypeError('Failed to fetch'))

    await expect(createTravelSession(preferences)).rejects.toMatchObject({
      status: 0,
      title: 'Network error',
    })
  })

  it('propagates AbortError so callers can ignore cancelled requests', async () => {
    stubFetch(new DOMException('aborted', 'AbortError'))

    await expect(createTravelSession(preferences)).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('getSessionRecommendations', () => {
  it('POSTs only latitude and longitude', async () => {
    const fetchMock = stubFetch(
      json(200, {
        sessionId: 's1',
        refreshStatus: 'UNCHANGED',
        recommendations: [],
        generatedAt: '2030-01-01T00:00:00Z',
      }),
    )

    const response = await getSessionRecommendations('s1', { latitude: 1, longitude: 2 })

    expect(response.refreshStatus).toBe('UNCHANGED')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/api/v1/travel-sessions/s1/recommendations')
    expect(JSON.parse(String(init.body))).toEqual({ location: { latitude: 1, longitude: 2 } })
  })

  it('rejects an unknown refresh status', async () => {
    stubFetch(
      json(200, { sessionId: 's1', refreshStatus: 'MAYBE', recommendations: [], generatedAt: 'x' }),
    )

    await expect(getSessionRecommendations('s1', { latitude: 1, longitude: 2 })).rejects.toMatchObject({
      title: 'Invalid response',
    })

  })

  it('rejects recommendation responses for a different session', async () => {
    stubFetch(json(200, {
      sessionId: 'other', refreshStatus: 'UPDATED', recommendations: [],
      generatedAt: '2030-01-01T00:00:00Z',
    }))
    await expect(getSessionRecommendations('s1', { latitude: 1, longitude: 2 })).rejects.toMatchObject({
      title: 'Invalid response',
    })
  })

  it('rejects an invalid update timestamp instead of announcing an invalid last check', async () => {
    stubFetch(json(200, {
      sessionId: 's1', refreshStatus: 'UNCHANGED', recommendations: [], generatedAt: null,
    }))
    await expect(getSessionRecommendations('s1', { latitude: 1, longitude: 2 })).rejects.toMatchObject({
      title: 'Invalid response',
    })
  })
})

describe('stopTravelSession', () => {
  it('resolves on 204 without parsing a body and sends no Content-Type', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }))

    await expect(stopTravelSession('s1')).resolves.toBeUndefined()

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://localhost:8080/api/v1/travel-sessions/s1')
    expect(init.method).toBe('DELETE')
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('throws a session-gone error for an unknown session', async () => {
    stubFetch(json(404, { title: 'Not found', status: 404 }))

    const error = await stopTravelSession('missing').catch((e: unknown) => e)

    expect(isSessionGoneError(error)).toBe(true)
  })
})

describe('error helpers', () => {
  it('describes backend-unavailable and server errors without technical details', () => {
    expect(describeTravelApiError(new TravelApiError({ status: 0, title: 'Network error', detail: null }))).toBe(
      "We couldn't reach the travel service. Check that the backend is running and try again.",
    )
    expect(
      describeTravelApiError(
        new TravelApiError({ status: 500, title: 'Internal', detail: 'NullPointerException' }),
      ),
    ).toBe('Something went wrong on our side. Please try again.')
  })

  it('treats 409 "Travel session stopped" as session gone, but a refresh conflict as retryable', () => {
    expect(
      isSessionGoneError(new TravelApiError({ status: 409, title: 'Travel session stopped', detail: null })),
    ).toBe(true)
    expect(
      isSessionGoneError(new TravelApiError({ status: 409, title: 'Refresh in progress', detail: null })),
    ).toBe(false)
  })
})
