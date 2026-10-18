import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TravelExplorerPage } from './TravelExplorerPage'

const SESSION_ID = 'session-1'

const createdSession = {
  sessionId: SESSION_ID,
  status: 'ACTIVE',
  expiresAt: '2030-01-01T00:00:00Z',
}

const fullRecommendation = {
  placeId: 'place-1',
  name: 'Colosseum Walk',
  category: 'HISTORY',
  description: 'A guided walk past ancient ruins.',
  latitude: 41.8902,
  longitude: 12.4922,
  estimatedDurationMinutes: 45,
  estimatedCost: 12.5,
  currencyCode: 'EUR',
  mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=41.8902,12.4922',
}

const sparseRecommendation = {
  placeId: 'place-2',
  name: 'Riverside Market',
  category: 'LOCAL_EXPERIENCES',
  description: 'Neighbourhood stalls and small producers.',
  latitude: 41.9,
  longitude: 12.5,
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function recommendationsResponse(
  refreshStatus: 'UPDATED' | 'UNCHANGED' | 'NO_NEW_RESULTS',
  recommendations: unknown[] = [],
): Response {
  return json(200, {
    sessionId: SESSION_ID,
    refreshStatus,
    recommendations,
    generatedAt: '2030-01-01T00:00:00Z',
  })
}

type Responder = () => Response | Promise<Response>

interface BackendRoutes {
  createSession?: Responder
  recommendations?: Responder[]
  stopSession?: Responder
}

/** Serves each recommendation request in order, so tests can script refresh outcomes. */
function mockBackend(routes: BackendRoutes = {}) {
  const recommendationQueue = [...(routes.recommendations ?? [])]
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'POST' && url.endsWith('/api/v1/travel-sessions')) {
      return routes.createSession ? routes.createSession() : json(201, createdSession)
    }
    if (method === 'POST' && url.endsWith(`/api/v1/travel-sessions/${SESSION_ID}/recommendations`)) {
      const next = recommendationQueue.shift()
      return next ? next() : recommendationsResponse('NO_NEW_RESULTS')
    }
    if (method === 'DELETE' && url.endsWith(`/api/v1/travel-sessions/${SESSION_ID}`)) {
      return routes.stopSession ? routes.stopSession() : new Response(null, { status: 204 })
    }
    return json(404, { title: 'Not found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

type GeolocationImpl = (success: PositionCallback, error: PositionErrorCallback) => void

function mockGeolocation(impl: GeolocationImpl = (success) => success(position())) {
  const getCurrentPosition = vi.fn(impl)
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition,
      watchPosition: vi.fn(() => 1),
      clearWatch: vi.fn(),
    },
  })
  return getCurrentPosition
}

function position(latitude = 41.9028, longitude = 12.4964): GeolocationPosition {
  return {
    coords: { latitude, longitude, accuracy: 10 } as GeolocationCoordinates,
    timestamp: Date.now(),
  } as GeolocationPosition
}

function geolocationError(code: number): GeolocationImpl {
  return (_success, error) => {
    error({ code, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
  }
}

function renderPage() {
  render(<TravelExplorerPage />)
  return userEvent.setup()
}

async function fillValidPreferences(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: 'Art' }))
  await user.type(screen.getByLabelText('Maximum budget'), '20')
}

function startButton() {
  return screen.getByRole('button', { name: 'Start Exploring' })
}

async function startExploring(user: ReturnType<typeof userEvent.setup>) {
  await fillValidPreferences(user)
  await user.click(startButton())
}

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('Start Exploring', () => {
  it('starts a session with valid preferences and shows recommendations', async () => {
    const getCurrentPosition = mockGeolocation()
    const fetchMock = mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)

    const [createUrl, createInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(String(createUrl)).toBe('http://localhost:8080/api/v1/travel-sessions')
    expect(JSON.parse(String(createInit?.body))).toEqual({
      interests: ['ART'],
      maxBudget: 20,
      currencyCode: 'EUR',
      availableMinutes: 60,
    })

    const [recsUrl, recsInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(String(recsUrl)).toBe(`http://localhost:8080/api/v1/travel-sessions/${SESSION_ID}/recommendations`)
    expect(JSON.parse(String(recsInit?.body))).toEqual({
      location: { latitude: 41.9028, longitude: 12.4964 },
    })

    expect(screen.getByText('Exploring')).toBeInTheDocument()
    expect(screen.getByText('Shared')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop Exploring' })).toBeEnabled()
  })

  it('does not create a session when preferences are invalid', async () => {
    const getCurrentPosition = mockGeolocation()
    const fetchMock = mockBackend()
    const user = renderPage()

    await user.type(screen.getByLabelText('Maximum budget'), '-5')
    await user.click(startButton())

    expect(screen.getByText('Select at least one interest.')).toBeInTheDocument()
    expect(screen.getByText('Budget cannot be negative.')).toBeInTheDocument()
    expect(getCurrentPosition).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a clear message and creates no session when location permission is denied', async () => {
    mockGeolocation(geolocationError(1))
    const fetchMock = mockBackend()
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Location permission was denied. Allow location access in your browser settings, then try again.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Not Exploring')).toBeInTheDocument()
    expect(startButton()).toBeEnabled()
  })

  it('shows a clear message when the location is unavailable', async () => {
    mockGeolocation(geolocationError(2))
    const fetchMock = mockBackend()
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't determine your current location. Please try again.",
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows a timeout message when location lookup times out', async () => {
    mockGeolocation(geolocationError(3))
    mockBackend()
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Finding your location took too long. Please try again.',
    )
  })

  it('shows progress messages while location, session, and recommendations load', async () => {
    let resolveRecommendations: (response: Response) => void = () => undefined
    mockGeolocation()
    mockBackend({
      recommendations: [
        () =>
          new Promise<Response>((resolve) => {
            resolveRecommendations = resolve
          }),
      ],
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByText('Discovering nearby experiences...')).toBeInTheDocument()

    resolveRecommendations(recommendationsResponse('UPDATED', [fullRecommendation]))
    expect(await screen.findByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
  })

  it('explains why location is needed before the traveler starts', () => {
    renderPage()

    expect(screen.getByText(/Your browser will ask for your location/)).toBeInTheDocument()
  })

  it('creates only one session when Start is clicked twice quickly', async () => {
    const getCurrentPosition = mockGeolocation()
    const fetchMock = mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
    })
    const user = renderPage()
    await fillValidPreferences(user)

    fireEvent.click(startButton())
    fireEvent.click(startButton())

    expect(await screen.findByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    const createCalls = fetchMock.mock.calls.filter(
      ([url, init]) => init?.method === 'POST' && String(url).endsWith('/api/v1/travel-sessions'),
    )
    expect(createCalls).toHaveLength(1)
  })

  it('keeps the session and offers a retry when recommendations fail', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () => json(503, { title: 'Provider unavailable', status: 503 }),
        () => recommendationsResponse('UPDATED', [fullRecommendation]),
      ],
    })
    const user = renderPage()

    await startExploring(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nearby experiences are temporarily unavailable. Please try again.')
    expect(screen.getByRole('button', { name: 'Stop Exploring' })).toBeEnabled()

    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports an unreachable backend without a stack trace or technical details', async () => {
    mockGeolocation()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const user = renderPage()

    await startExploring(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      "We couldn't reach the travel service. Check that the backend is running and try again.",
    )
    expect(alert).not.toHaveTextContent('Failed to fetch')
    expect(startButton()).toBeEnabled()
  })

  it('shows the backend validation message from a ProblemDetail response', async () => {
    mockGeolocation()
    mockBackend({
      createSession: () =>
        json(400, {
          title: 'Validation failed',
          status: 400,
          detail: 'Maximum budget must be zero or more.',
          errors: { maxBudget: 'must be zero or more' },
        }),
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Maximum budget must be zero or more.',
    )
    expect(startButton()).toBeEnabled()
  })

  it('shows a generic message for server errors without exposing backend details', async () => {
    mockGeolocation()
    mockBackend({
      createSession: () =>
        json(500, {
          title: 'Internal Server Error',
          status: 500,
          detail: 'NullPointerException at com.aitravel.Secret.run',
        }),
    })
    const user = renderPage()

    await startExploring(user)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Something went wrong on our side. Please try again.')
    expect(alert).not.toHaveTextContent('NullPointerException')
  })
})

describe('Recommendation results', () => {
  it('renders name, category, description, duration, cost, and a safe directions link', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
    const card = screen.getByRole('article')
    expect(within(card).getByText('History')).toBeInTheDocument()
    expect(screen.getByText('A guided walk past ancient ruins.')).toBeInTheDocument()
    expect(screen.getByText('About 45 min')).toBeInTheDocument()
    expect(screen.getByText('€12.50')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /Get directions to Colosseum Walk/ })
    expect(link).toHaveAttribute('href', fullRecommendation.mapsUrl)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('handles missing cost and duration without inventing values', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [sparseRecommendation])],
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByRole('heading', { name: 'Riverside Market' })).toBeInTheDocument()
    expect(screen.getByText('Duration unavailable')).toBeInTheDocument()
    expect(screen.getByText('Price unavailable')).toBeInTheDocument()
    expect(within(screen.getByRole('article')).getByText('Local experiences')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Get directions/ })).not.toBeInTheDocument()
  })

  it('does not render a directions link for a non-https maps URL', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () =>
          recommendationsResponse('UPDATED', [
            { ...sparseRecommendation, mapsUrl: 'javascript:alert(1)' },
          ]),
      ],
    })
    const user = renderPage()

    await startExploring(user)

    await screen.findByRole('heading', { name: 'Riverside Market' })
    expect(screen.queryByRole('link', { name: /Get directions/ })).not.toBeInTheDocument()
  })

  it('shows an empty-results message when the backend returns no places', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [() => recommendationsResponse('NO_NEW_RESULTS', [])],
    })
    const user = renderPage()

    await startExploring(user)

    expect(await screen.findByText('No new places found nearby.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop Exploring' })).toBeEnabled()
  })

  it('keeps existing cards when a refresh returns UNCHANGED', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () => recommendationsResponse('UPDATED', [fullRecommendation]),
        () => recommendationsResponse('UNCHANGED'),
      ],
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Check for new places' }))

    expect(await screen.findByText(/No new check was needed yet/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
  })

  it('shows an informative message when a refresh returns NO_NEW_RESULTS', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () => recommendationsResponse('UPDATED', [fullRecommendation]),
        () => recommendationsResponse('NO_NEW_RESULTS'),
      ],
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Check for new places' }))

    expect(
      await screen.findByText(
        'No new places were found nearby. Your current suggestions are still shown.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds newly returned places on UPDATED without duplicating existing ones', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () => recommendationsResponse('UPDATED', [fullRecommendation]),
        () => recommendationsResponse('UPDATED', [fullRecommendation, sparseRecommendation]),
      ],
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Check for new places' }))

    await screen.findByRole('heading', { name: 'Riverside Market' })
    expect(screen.getAllByRole('heading', { name: 'Colosseum Walk' })).toHaveLength(1)
  })
})

describe('Stop Exploring', () => {
  it('ends the session and returns to the initial state', async () => {
    mockGeolocation()
    const fetchMock = mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))

    expect(await screen.findByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(screen.getByText('Not Exploring')).toBeInTheDocument()
    expect(screen.getByText('Not Shared')).toBeInTheDocument()
    expect(screen.getByText('Your next adventure starts here.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Colosseum Walk' })).not.toBeInTheDocument()

    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE')
    expect(String(deleteCall?.[0])).toBe(`http://localhost:8080/api/v1/travel-sessions/${SESSION_ID}`)
  })

  it('does not claim the session ended when stopping fails, and allows a retry', async () => {
    mockGeolocation()
    let stopAttempts = 0
    mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
      stopSession: () => {
        stopAttempts += 1
        return stopAttempts === 1
          ? json(500, { title: 'Internal Server Error', status: 500 })
          : new Response(null, { status: 204 })
      },
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't confirm that your travel session ended.")
    expect(screen.getByText('Exploring')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))

    expect(await screen.findByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(stopAttempts).toBe(2)
  })

  it('treats a session already gone on the backend as stopped', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
      stopSession: () => json(404, { title: 'Travel session not found', status: 404 }),
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))

    expect(await screen.findByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(screen.getByText('Your travel session had already ended.')).toBeInTheDocument()
  })

  it('discards a stale session when recommendations report it is gone', async () => {
    mockGeolocation()
    mockBackend({
      recommendations: [
        () => recommendationsResponse('UPDATED', [fullRecommendation]),
        () => json(404, { title: 'Travel session not found', status: 404 }),
      ],
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    await user.click(screen.getByRole('button', { name: 'Check for new places' }))

    expect(await screen.findByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(
      screen.getByText(
        'Your travel session has ended. Start exploring again to get new suggestions.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Colosseum Walk' })).not.toBeInTheDocument()
  })

  it('prevents repeated Stop requests while the first is in flight', async () => {
    mockGeolocation()
    let resolveStop: (response: Response) => void = () => undefined
    const fetchMock = mockBackend({
      recommendations: [() => recommendationsResponse('UPDATED', [fullRecommendation])],
      stopSession: () =>
        new Promise<Response>((resolve) => {
          resolveStop = resolve
        }),
    })
    const user = renderPage()

    await startExploring(user)
    await screen.findByRole('heading', { name: 'Colosseum Walk' })

    const stop = screen.getByRole('button', { name: 'Stop Exploring' })
    fireEvent.click(stop)
    fireEvent.click(stop)

    expect(screen.getByText('Stopping')).toBeInTheDocument()
    resolveStop(new Response(null, { status: 204 }))

    await waitFor(() => expect(startButton()).toBeEnabled())
    const deleteCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(1)
  })
})
