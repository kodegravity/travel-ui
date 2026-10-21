import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTO_REFRESH_INTERVAL_MS, LIVE_REFRESH_THROTTLE_MS, useTravelSession } from './useTravelSession'
import type { RecommendationDto, RefreshStatus } from '../types/api'

const preferences = {
  interests: ['HISTORY' as const, 'ART' as const],
  maxBudget: 50,
  currency: 'EUR' as const,
  availableTimeMinutes: 180,
}
const rome = { latitude: 41.8902, longitude: 12.4922 }
const moved = { latitude: 41.9002, longitude: 12.5022 }
const first: RecommendationDto = {
  placeId: 'first', name: 'Colosseum', category: 'HISTORY', description: 'Ancient amphitheatre.',
  ...rome,
}
const second: RecommendationDto = {
  ...first, placeId: 'second', name: 'Art studio', description: 'Local art.',
}
const third: RecommendationDto = { ...first, placeId: 'third', name: 'Historic square' }
let locationCallback: PositionCallback
let locationError: PositionErrorCallback | null
let fetchMock: ReturnType<typeof vi.fn>
let responses: Array<() => Response | Promise<Response>>

function position(coordinates = rome, accuracy = 10): GeolocationPosition {
  const coords: GeolocationCoordinates = {
    ...coordinates, accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null,
    toJSON: () => ({ ...coordinates, accuracy }),
  }
  const timestamp = Date.now()
  return {
    coords,
    timestamp,
    toJSON: () => ({ coords: coords.toJSON(), timestamp }),
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function recommendations(status: RefreshStatus, places: RecommendationDto[] = []): Response {
  return json(200, {
    sessionId: 'session', refreshStatus: status, recommendations: places, generatedAt: new Date().toISOString(),
  })
}

function refreshCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/recommendations'))
}

async function move(coordinates = moved, accuracy = 10) {
  await act(async () => { locationCallback(position(coordinates, accuracy)) })
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => success(position())),
      watchPosition: vi.fn((success: PositionCallback, error: PositionErrorCallback | null) => {
        locationCallback = success
        locationError = error
        return 42
      }),
      clearWatch: vi.fn(),
    },
  })
  responses = [() => recommendations('UPDATED', [first])]
  fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    if (url.endsWith('/travel-sessions')) {
      return json(201, { sessionId: 'session', status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' })
    }
    return responses.shift()?.() ?? recommendations('UNCHANGED')
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'geolocation')
  Reflect.deleteProperty(document, 'hidden')
})

async function start() {
  const hook = renderHook(() => useTravelSession())
  await act(async () => { await hook.result.current.start(preferences) })
  return hook
}

describe('proactive foreground exploration', () => {
  it('does not throttle the initial recommendation or alert for initial results', async () => {
    const { result } = await start()
    expect(refreshCalls()).toHaveLength(1)
    expect(result.current.state.recommendations).toEqual([first])
    expect(result.current.state.liveSuggestion).toBeNull()
    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('coalesces movement, sends the latest fix after 30 seconds, and highlights genuinely new IDs', async () => {
    const { result } = await start()
    responses.push(() => recommendations('UPDATED', [second]))
    await move()
    await move({ latitude: 41.9102, longitude: 12.5122 })
    await advance(LIVE_REFRESH_THROTTLE_MS - 1)
    expect(refreshCalls()).toHaveLength(1)
    await advance(1)
    expect(refreshCalls()).toHaveLength(2)
    expect(JSON.parse(String(refreshCalls()[1]?.[1]?.body))).toEqual({
      location: { latitude: 41.9102, longitude: 12.5122 },
    })
    expect(result.current.state.liveSuggestion).toEqual(second)
    expect(result.current.state.newRecommendationIds).toEqual(['second'])
  })

  it('replaces the on-screen suggestion with the newest place', async () => {
    const { result } = await start()
    responses.push(() => recommendations('UPDATED', [second]), () => recommendations('UPDATED', [third]))
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(result.current.state.liveSuggestion).toEqual(second)

    await move(rome)
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(result.current.state.liveSuggestion).toEqual(third)
  })

  it('ignores GPS jitter and rejects inaccurate fixes without sending them', async () => {
    const { result } = await start()
    await move({ latitude: 41.89021, longitude: 12.49221 })
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(refreshCalls()).toHaveLength(1)
    await move(moved, 2000)
    expect(result.current.state.locationNotice).toMatch(/not accurate enough/)
    expect(refreshCalls()).toHaveLength(1)
    await move()
    expect(result.current.state.locationNotice).toBeNull()
    await advance(0)
    expect(refreshCalls()).toHaveLength(2)
  })

  it('deduplicates repeated IDs, including duplicates within a response, for the whole session', async () => {
    const { result } = await start()
    responses.push(() => recommendations('UPDATED', [first, second, second, third]))
    await act(async () => { await result.current.refresh() })
    expect(result.current.state.liveSuggestion?.placeId).toBe('second')
    expect(result.current.state.recommendations).toHaveLength(3)
    act(() => result.current.dismissSuggestion())
    expect(result.current.state.liveSuggestion).toBeNull()
    responses.push(() => recommendations('UPDATED', [second, third]))
    await act(async () => { await result.current.refresh() })
    expect(result.current.state.liveSuggestion).toBeNull()
    expect(result.current.state.newRecommendationIds).toEqual([])
    expect(result.current.state.recommendations).toHaveLength(3)
  })

  it.each(['UNCHANGED', 'NO_NEW_RESULTS'] as const)('%s preserves cards without a new-place alert', async (status) => {
    const { result } = await start()
    responses.push(() => recommendations(status))
    await act(async () => { await result.current.refresh() })
    expect(result.current.state.recommendations).toEqual([first])
    expect(result.current.state.liveSuggestion).toBeNull()
    expect(result.current.state.newRecommendationIds).toEqual([])
    expect(result.current.state.notice).not.toBeNull()
  })

  it('disabling live suggestions stops GPS and automatic requests but preserves the session and manual checks', async () => {
    const { result } = await start()
    act(() => result.current.setLiveSuggestionsEnabled(false))
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42)
    await advance(AUTO_REFRESH_INTERVAL_MS * 2)
    expect(refreshCalls()).toHaveLength(1)
    expect(result.current.state.sessionId).toBe('session')
    responses.push(() => recommendations('UPDATED', [second]))
    await act(async () => { await result.current.refresh() })
    expect(result.current.state.recommendations).toContainEqual(second)
    expect(result.current.state.liveSuggestion).toBeNull()
    act(() => result.current.setLiveSuggestionsEnabled(true))
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(2)
  })

  it('hiding the tab clears watching and throttled movement, then resumes on visibility', async () => {
    const { result } = await start()
    await move()
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42)
    await advance(AUTO_REFRESH_INTERVAL_MS)
    expect(refreshCalls()).toHaveLength(1)
    act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await advance(0)
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(2)
    expect(result.current.state.sessionId).toBe('session')
    expect(refreshCalls()).toHaveLength(2)
  })

  it('never overlaps automatic requests and ignores successful responses after live mode is disabled', async () => {
    const { result } = await start()
    let finish: (response: Response) => void = () => undefined
    responses.push(() => new Promise((resolve) => { finish = resolve }))
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(result.current.state.isCheckingForUpdates).toBe(true)
    await advance(AUTO_REFRESH_INTERVAL_MS * 2)
    expect(refreshCalls()).toHaveLength(2)
    act(() => result.current.setLiveSuggestionsEnabled(false))
    await act(async () => { finish(recommendations('UPDATED', [second])) })
    expect(result.current.state.recommendations).toEqual([first])
    expect(result.current.state.liveSuggestion).toBeNull()
    expect(result.current.state.isCheckingForUpdates).toBe(false)
  })

  it('pauses automatic retries on provider failure, preserving cards until explicit retry', async () => {
    const { result } = await start()
    responses.push(() => json(503, { title: 'Provider unavailable', status: 503 }))
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(result.current.state.errorMessage).toMatch(/temporarily unavailable/)
    expect(result.current.state.recommendations).toEqual([first])
    await advance(AUTO_REFRESH_INTERVAL_MS * 3)
    expect(refreshCalls()).toHaveLength(2)
    responses.push(() => recommendations('UPDATED', [second]))
    await act(async () => { await result.current.refresh() })
    expect(result.current.state.errorMessage).toBeNull()
    expect(result.current.state.recommendations).toContainEqual(second)
  })

  it('reports watched location errors without clearing useful cards', async () => {
    const { result } = await start()
    act(() => locationError?.({
      code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3,
    }))
    expect(result.current.state.locationNotice).toMatch(/too long/)
    expect(result.current.state.recommendations).toEqual([first])
  })

  it('stops a slow manual refresh and ignores its late response', async () => {
    const { result } = await start()
    let finish: (response: Response) => void = () => undefined
    responses.push(() => new Promise((resolve) => { finish = resolve }))
    let refresh: Promise<void>
    act(() => { refresh = result.current.refresh() })
    await advance(0)
    expect(result.current.canStop).toBe(true)
    await act(async () => { await result.current.stop() })
    await act(async () => {
      finish(recommendations('UPDATED', [second]))
      await refresh
    })
    expect(result.current.state.sessionId).toBeNull()
    expect(result.current.state.recommendations).toEqual([])
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42)
  })

  it('expires cleanly and removes monitoring and alerts', async () => {
    const { result } = await start()
    responses.push(() => json(410, { title: 'Travel session expired', status: 410 }))
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)
    expect(result.current.state.sessionId).toBeNull()
    expect(result.current.state.notice).toMatch(/expired/)
    expect(result.current.state.liveSuggestion).toBeNull()
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42)
  })

  it('cleans up listeners, watchers and pending updates on unmount', async () => {
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const { unmount } = await start()
    await move()
    unmount()
    await advance(AUTO_REFRESH_INTERVAL_MS)
    expect(refreshCalls()).toHaveLength(1)
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledWith(42)
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})

describe('live event alerts', () => {
  const game = {
    event: {
      id: 'G1', name: 'Roma vs Lazio', type: 'SPORTS', venueName: 'Stadio Olimpico', distanceKm: 3.1,
      startsAt: '2030-01-01T19:45:00Z', url: 'https://www.ticketmaster.it/event/G1', source: 'ticketmaster',
    },
    headline: 'Derby night nearby', message: 'The Rome derby, a short ride away.', aiWritten: true,
  }
  const concert = {
    event: { id: 'C1', name: 'Jazz Night', type: 'MUSIC', source: 'ticketmaster' },
    headline: 'Live music nearby: Jazz Night', message: 'About 0.4 km from you.', aiWritten: false,
  }

  function withLive(status: RefreshStatus, live: unknown[], places: RecommendationDto[] = []): Response {
    return json(200, {
      sessionId: 'session', refreshStatus: status, recommendations: places, generatedAt: new Date().toISOString(),
      liveSuggestions: live,
    })
  }

  function body(call: unknown[]) {
    return JSON.parse(String((call[1] as RequestInit).body))
  }

  async function startWith(options: Parameters<typeof useTravelSession>[0]) {
    const hook = renderHook(() => useTravelSession(options))
    await act(async () => { await hook.result.current.start(preferences) })
    return hook
  }

  it('collects alerts newest first and never asks for an event twice', async () => {
    responses = [() => withLive('UPDATED', [game], [first]), () => withLive('NO_NEW_RESULTS', [concert])]
    const { result } = await startWith({ eventTypes: ['SPORTS', 'MUSIC'] })

    expect(result.current.state.liveEvents.map((item) => item.event.id)).toEqual(['G1'])
    expect(body(refreshCalls()[0]!)).toMatchObject({ eventTypes: ['SPORTS', 'MUSIC'], seenEventIds: [] })

    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)

    expect(body(refreshCalls()[1]!).seenEventIds).toEqual(['G1'])
    expect(result.current.state.liveEvents.map((item) => item.event.id)).toEqual(['C1', 'G1'])
    expect(result.current.state.newLiveEventIds).toEqual(['C1'])

    act(() => result.current.dismissLiveEvent('C1'))
    expect(result.current.state.liveEvents.map((item) => item.event.id)).toEqual(['G1'])
  })

  it('sends no event options when alerts are off', async () => {
    await startWith({ eventTypes: [] })

    expect(body(refreshCalls()[0]!)).toEqual({ location: { latitude: rome.latitude, longitude: rome.longitude } })
  })

  it('keeps watching in a background tab only with background alerts on', async () => {
    const quiet = await startWith({ eventTypes: ['SPORTS'] })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(navigator.geolocation.clearWatch).toHaveBeenCalledTimes(1)
    quiet.unmount()

    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    vi.mocked(navigator.geolocation.clearWatch).mockClear()
    await startWith({ eventTypes: ['SPORTS'], backgroundAlerts: true })
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(navigator.geolocation.clearWatch).not.toHaveBeenCalled()
  })

  it('shows a system notification for new alerts that arrive while the tab is hidden', async () => {
    const shown: string[] = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(title: string) { shown.push(title) }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    responses = [() => withLive('UPDATED', [], [first]), () => withLive('NO_NEW_RESULTS', [game])]
    await startWith({ eventTypes: ['SPORTS'], backgroundAlerts: true })

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)

    expect(shown).toEqual(['Derby night nearby'])
  })

  it('notifies new places from a background tab without any event types', async () => {
    const shown: Array<{ title: string; body?: string }> = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(title: string, options?: NotificationOptions) { shown.push({ title, body: options?.body }) }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    responses = [() => recommendations('UPDATED', [first]), () => recommendations('UPDATED', [first, second])]
    await startWith({ eventTypes: [], backgroundAlerts: true })

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(navigator.geolocation.clearWatch).not.toHaveBeenCalled()
    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)

    expect(shown).toEqual([{ title: '1 new place nearby', body: 'Art studio' }])
  })

  it('does not notify places while the tab is visible; the page shows them', async () => {
    const shown: string[] = []
    class FakeNotification {
      static permission = 'granted'
      onclick: (() => void) | null = null
      constructor(title: string) { shown.push(title) }
      close() {}
    }
    vi.stubGlobal('Notification', FakeNotification)
    responses = [() => recommendations('UPDATED', [first]), () => recommendations('UPDATED', [second])]
    const { result } = await startWith({ eventTypes: [], backgroundAlerts: true })

    await move()
    await advance(LIVE_REFRESH_THROTTLE_MS)

    expect(shown).toEqual([])
    expect(result.current.state.liveSuggestion).toEqual(second)
  })
})
