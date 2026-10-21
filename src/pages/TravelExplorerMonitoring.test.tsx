import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AUTO_REFRESH_INTERVAL_MS, SESSION_EXPIRED_NOTICE } from '../hooks/useTravelSession'
import { TravelExplorerPage } from './TravelExplorerPage'

const SESSION_ID = 'session-1'
const FAR_FUTURE = '2030-01-01T00:00:00Z'

const placeA = {
  placeId: 'place-a',
  name: 'Colosseum Walk',
  category: 'HISTORY',
  description: 'A guided walk past ancient ruins.',
  latitude: 41.8902,
  longitude: 12.4922,
}

const placeB = {
  placeId: 'place-b',
  name: 'Trastevere Studio',
  category: 'ART',
  description: 'A small studio with local painters.',
  latitude: 41.889,
  longitude: 12.47,
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
  return json(200, { sessionId: SESSION_ID, refreshStatus, recommendations, generatedAt: FAR_FUTURE })
}

/** Scripts recommendation responses in order and records every request made. */
function mockBackend(
  recommendationQueue: Array<() => Response | Promise<Response>>,
  createdExpiresAt = FAR_FUTURE,
) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (method === 'POST' && url.endsWith('/api/v1/travel-sessions')) {
      return json(201, { sessionId: SESSION_ID, status: 'ACTIVE', expiresAt: createdExpiresAt })
    }
    if (method === 'POST' && url.endsWith(`/api/v1/travel-sessions/${SESSION_ID}/recommendations`)) {
      const next = recommendationQueue.shift()
      return next ? next() : recommendationsResponse('UNCHANGED')
    }
    if (method === 'DELETE') return new Response(null, { status: 204 })
    return json(404, { title: 'Not found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function recommendationCalls(fetchMock: ReturnType<typeof mockBackend>) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    return (init?.method ?? 'GET') === 'POST' && String(input).endsWith('/recommendations')
  })
}

const START = { latitude: 41.9028, longitude: 12.4964 }
/** About 1.1 km from START: far enough for the backend to search again. */
const WALKED = { latitude: 41.9128, longitude: 12.4964 }
let watchCallback: PositionCallback | null = null

function positionAt(coordinates: { latitude: number; longitude: number }): GeolocationPosition {
  return {
    coords: { ...coordinates, accuracy: 10 } as GeolocationCoordinates,
    timestamp: Date.now(),
  } as GeolocationPosition
}

/** The first fix is START; any later one-off fix is WALKED, as if the traveler moved on. */
function mockGeolocation() {
  let calls = 0
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    success(positionAt(calls++ === 0 ? START : WALKED))
  })
  const watchPosition = vi.fn((success: PositionCallback) => {
    watchCallback = success
    return 1
  })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition, watchPosition, clearWatch: vi.fn() },
  })
  return getCurrentPosition
}

/** Reports a watched position about 1 km away, so the next automatic check is worth sending. */
async function walk() {
  await act(async () => {
    watchCallback?.(positionAt(WALKED))
  })
}

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
}

/** Advances fake time and lets pending promises settle inside act. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function startSession(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox', { name: 'Art' }))
  await user.type(screen.getByLabelText('Maximum budget'), '20')
  await user.click(screen.getByRole('button', { name: 'Start Exploring' }))
  await screen.findByRole('heading', { name: 'Colosseum Walk' })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  setDocumentHidden(false)
})

afterEach(() => {
  watchCallback = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'geolocation')
  Reflect.deleteProperty(document, 'hidden')
})

describe('Travel session monitoring', () => {
  it('refreshes recommendations automatically on the interval and shows new places', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    const fetchMock = mockBackend([
      () => recommendationsResponse('UPDATED', [placeA]),
      () => recommendationsResponse('UPDATED', [placeB]),
    ])
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()
    expect(recommendationCalls(fetchMock)).toHaveLength(1)

    await advance(AUTO_REFRESH_INTERVAL_MS)

    expect(recommendationCalls(fetchMock)).toHaveLength(2)
    expect(await screen.findByRole('heading', { name: 'Trastevere Studio' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
  })

  it('alerts once for a newly found place and dismisses it without re-alerting the same place', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    mockBackend([
      () => recommendationsResponse('UPDATED', [placeA]),
      () => recommendationsResponse('UPDATED', [placeA, placeB]),
      () => recommendationsResponse('UNCHANGED', []),
    ])
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()
    expect(screen.queryByText('New nearby suggestion')).not.toBeInTheDocument()

    await advance(AUTO_REFRESH_INTERVAL_MS)
    const alert = await screen.findByText('New nearby suggestion')
    expect(alert.closest('[role="status"]')).toHaveTextContent('Trastevere Studio')

    await user.click(screen.getByRole('button', { name: 'Dismiss suggestion' }))
    expect(screen.queryByText('New nearby suggestion')).not.toBeInTheDocument()

    await advance(AUTO_REFRESH_INTERVAL_MS)
    expect(screen.queryByText('New nearby suggestion')).not.toBeInTheDocument()
  })

  it('does not refresh automatically while the tab is hidden', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    const fetchMock = mockBackend([() => recommendationsResponse('UPDATED', [placeA])])
    render(<TravelExplorerPage />)
    await startSession(user)

    setDocumentHidden(true)
    await advance(AUTO_REFRESH_INTERVAL_MS)

    expect(recommendationCalls(fetchMock)).toHaveLength(1)
  })

  it('keeps existing cards and shows an error when an automatic refresh fails', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    mockBackend([
      () => recommendationsResponse('UPDATED', [placeA]),
      () => json(503, { title: 'Service unavailable', status: 503, detail: 'Provider busy' }),
    ])
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()

    await advance(AUTO_REFRESH_INTERVAL_MS)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
  })

  it('does not end an active session locally when the original expiry time passes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    // The backend extends expiry on each valid interaction, so the creation-time value is not authoritative.
    const soon = new Date(Date.now() + 60_000).toISOString()
    const fetchMock = mockBackend([() => recommendationsResponse('UPDATED', [placeA])], soon)
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()

    await advance(AUTO_REFRESH_INTERVAL_MS)

    expect(recommendationCalls(fetchMock).length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText(SESSION_EXPIRED_NOTICE)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Colosseum Walk' })).toBeInTheDocument()
  })

  it('shows the expired notice when the backend reports the session expired (410)', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    const fetchMock = mockBackend([
      () => recommendationsResponse('UPDATED', [placeA]),
      () => json(410, { title: 'Travel session expired', status: 410 }),
    ])
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()

    await advance(AUTO_REFRESH_INTERVAL_MS)

    expect(await screen.findByText(SESSION_EXPIRED_NOTICE)).toBeInTheDocument()
    expect(recommendationCalls(fetchMock)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    const panel = screen.getByRole('region', { name: /active travel mode/i })
    expect(within(panel).getByText('Not Exploring')).toBeInTheDocument()
  })

  it('stops watching location while hidden and refreshes on return when the last check is stale', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const getCurrentPosition = mockGeolocation()
    const clearWatch = vi.fn()
    const watchPosition = vi.fn(() => 7)
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition, watchPosition, clearWatch },
    })
    const fetchMock = mockBackend([() => recommendationsResponse('UPDATED', [placeA])])
    render(<TravelExplorerPage />)
    await startSession(user)
    expect(watchPosition).toHaveBeenCalledTimes(1)

    setDocumentHidden(true)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(clearWatch).toHaveBeenCalledWith(7)

    await advance(AUTO_REFRESH_INTERVAL_MS * 2)
    expect(recommendationCalls(fetchMock)).toHaveLength(1)

    setDocumentHidden(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(watchPosition).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(recommendationCalls(fetchMock)).toHaveLength(2))
  })

  it('offers a notification opt-in once a session is active and reflects the granted permission', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    mockBackend([() => recommendationsResponse('UPDATED', [placeA])])
    const requestPermission = vi.fn(async () => 'granted' as NotificationPermission)
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'default', requestPermission }))
    render(<TravelExplorerPage />)
    await startSession(user)

    await user.click(screen.getByRole('button', { name: 'Alert me to new places and events' }))

    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Alerts are on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alert me to new places and events' })).not.toBeInTheDocument()
  })

  it('stops monitoring immediately while termination is pending and keeps it stopped after failure', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    const fetchMock = mockBackend([() => recommendationsResponse('UPDATED', [placeA])])
    render(<TravelExplorerPage />)
    await startSession(user)

    let finishStop: (response: Response) => void = () => undefined
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishStop = resolve }))
    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))

    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(1)
    await advance(AUTO_REFRESH_INTERVAL_MS)
    expect(recommendationCalls(fetchMock)).toHaveLength(1)

    await act(async () => { finishStop(json(503, { title: 'Service unavailable' })) })
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't confirm")
    await advance(AUTO_REFRESH_INTERVAL_MS)
    expect(recommendationCalls(fetchMock)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Stop Exploring' })).toBeEnabled()
  })

  it('ignores a late failed automatic response after stopping the session', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mockGeolocation()
    let finishRefresh: (response: Response) => void = () => undefined
    mockBackend([
      () => recommendationsResponse('UPDATED', [placeA]),
      () => new Promise<Response>((resolve) => { finishRefresh = resolve }),
    ])
    render(<TravelExplorerPage />)
    await startSession(user)
    await walk()
    await advance(AUTO_REFRESH_INTERVAL_MS)
    await user.click(screen.getByRole('button', { name: 'Stop Exploring' }))
    await advance(0)
    expect(screen.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()

    await act(async () => { finishRefresh(json(503, { title: 'Provider unavailable' })) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Colosseum Walk' })).not.toBeInTheDocument()
  })
})
