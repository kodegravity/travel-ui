import { useEffect, useReducer, useRef } from 'react'
import {
  getCurrentLocation,
  LocationError,
  watchLocation,
  distanceBetweenLocations,
  type BrowserCoordinates,
} from '../services/geolocation'
import {
  createTravelSession,
  getSessionRecommendations,
  isAbortError,
  isSessionExpiredError,
  isSessionGoneError,
  describeTravelApiError,
  stopTravelSession,
} from '../services/travelApi'
import type { RecommendationDto, RefreshStatus, TravelSessionRecommendationResponse } from '../types/api'
import type { TravelerPreferences } from '../types/travel'

export type TravelSessionPhase =
  | 'IDLE'
  | 'REQUESTING_LOCATION'
  | 'STARTING_SESSION'
  | 'LOADING_RECOMMENDATIONS'
  | 'ACTIVE'
  | 'EMPTY_RESULTS'
  | 'ERROR'
  | 'STOPPING_SESSION'

type BusyPhase = Extract<
  TravelSessionPhase,
  'REQUESTING_LOCATION' | 'STARTING_SESSION' | 'LOADING_RECOMMENDATIONS' | 'STOPPING_SESSION'
>

const BUSY_PHASES: readonly TravelSessionPhase[] = [
  'REQUESTING_LOCATION',
  'STARTING_SESSION',
  'LOADING_RECOMMENDATIONS',
  'STOPPING_SESSION',
]

/** The backend only evaluates a refresh at most every 5 minutes, so polling at this interval is never wasted. */
export const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000
export const LIVE_REFRESH_THROTTLE_MS = 30_000
const GPS_JITTER_METERS = 25
/** A watched position older than this is not reused for an automatic refresh. */
const WATCHED_LOCATION_MAX_AGE_MS = 10 * 60 * 1000

/** Which user action failed. Decides which recovery button is offered. */
export type FailedAction = 'start' | 'refresh' | 'stop'

export interface TravelSessionState {
  phase: TravelSessionPhase
  /** Set only after the backend confirms session creation. Held in memory only. */
  sessionId: string | null
  /** ISO timestamp of the last successful recommendation check (backend generatedAt). */
  lastCheckedAt: string | null
  /** True once the browser has provided a location for this session. No coordinates are kept in state. */
  locationShared: boolean
  recommendations: RecommendationDto[]
  refreshStatus: RefreshStatus | null
  /** Informational message, such as "no new places found". */
  notice: string | null
  errorMessage: string | null
  failedAction: FailedAction | null
  liveSuggestionsEnabled: boolean
  isCheckingForUpdates: boolean
  liveSuggestion: RecommendationDto | null
  newRecommendationIds: string[]
  locationNotice: string | null
}

export const SESSION_ENDED_NOTICE =
  'Your travel session has ended. Start exploring again to get new suggestions.'
export const SESSION_EXPIRED_NOTICE =
  'Your travel session has expired. Start exploring again to get new suggestions.'

export const initialTravelSessionState: TravelSessionState = {
  phase: 'IDLE',
  sessionId: null,
  lastCheckedAt: null,
  locationShared: false,
  recommendations: [],
  refreshStatus: null,
  notice: null,
  errorMessage: null,
  failedAction: null,
  liveSuggestionsEnabled: true,
  isCheckingForUpdates: false,
  liveSuggestion: null,
  newRecommendationIds: [],
  locationNotice: null,
}

type TravelSessionAction =
  | { type: 'BUSY'; phase: BusyPhase }
  | { type: 'LOCATION_SHARED' }
  | { type: 'SESSION_CREATED'; sessionId: string }
  | { type: 'RECOMMENDATIONS_RECEIVED'; response: TravelSessionRecommendationResponse; initial: boolean }
  | { type: 'CHECKING'; checking: boolean }
  | { type: 'LIVE_ENABLED'; enabled: boolean }
  | { type: 'DISMISS_SUGGESTION' }
  | { type: 'LOCATION_NOTICE'; message: string | null }
  | { type: 'FAILED'; action: FailedAction; message: string }
  | { type: 'RESET'; notice: string | null }

/** Puts newly returned places first and keeps earlier ones, without duplicates. */
export function mergeRecommendations(
  previous: RecommendationDto[],
  incoming: RecommendationDto[],
): RecommendationDto[] {
  const uniqueIncoming = [...new Map(incoming.map((item) => [item.placeId, item])).values()]
  const incomingIds = new Set(uniqueIncoming.map((item) => item.placeId))
  return [...uniqueIncoming, ...previous.filter((item) => !incomingIds.has(item.placeId))]
}

function noticeFor(refreshStatus: RefreshStatus, hasRecommendations: boolean): string | null {
  switch (refreshStatus) {
    case 'UPDATED':
      return null
    case 'UNCHANGED':
      return 'No new check was needed yet. Your current suggestions are still shown.'
    case 'NO_NEW_RESULTS':
      return hasRecommendations
        ? 'No new places were found nearby. Your current suggestions are still shown.'
        : 'No new places were found nearby right now.'
  }
}

function reducer(state: TravelSessionState, action: TravelSessionAction): TravelSessionState {
  switch (action.type) {
    case 'BUSY':
      return { ...state, phase: action.phase, notice: null, errorMessage: null, failedAction: null, newRecommendationIds: [] }
    case 'LOCATION_SHARED':
      return { ...state, locationShared: true, locationNotice: null }
    case 'LOCATION_NOTICE':
      return { ...state, locationNotice: action.message }
    case 'CHECKING':
      return { ...state, isCheckingForUpdates: action.checking,
        newRecommendationIds: action.checking ? [] : state.newRecommendationIds }
    case 'LIVE_ENABLED':
      return { ...state, liveSuggestionsEnabled: action.enabled, liveSuggestion: null, newRecommendationIds: [] }
    case 'DISMISS_SUGGESTION':
      return { ...state, liveSuggestion: null }
    case 'SESSION_CREATED':
      return { ...state, sessionId: action.sessionId }
    case 'RECOMMENDATIONS_RECEIVED': {
      // A response that arrives after the session ended must not bring it back.
      if (state.sessionId !== action.response.sessionId) return state
      const { refreshStatus, recommendations, generatedAt } = action.response
      // UNCHANGED and NO_NEW_RESULTS never carry places; keep what is already on screen.
      const merged =
        refreshStatus === 'UPDATED'
          ? mergeRecommendations(state.recommendations, recommendations)
          : state.recommendations
      const previousIds = new Set(state.recommendations.map((item) => item.placeId))
      const newPlaces = !action.initial && refreshStatus === 'UPDATED'
        ? merged.filter((item) => !previousIds.has(item.placeId))
        : []
      return {
        ...state,
        phase: merged.length > 0 ? 'ACTIVE' : 'EMPTY_RESULTS',
        recommendations: merged,
        refreshStatus,
        lastCheckedAt: generatedAt,
        notice: noticeFor(refreshStatus, merged.length > 0),
        errorMessage: null,
        failedAction: null,
        newRecommendationIds: newPlaces.map((item) => item.placeId),
        // Keep one unobtrusive suggestion, not a queue that bursts after dismissal.
        liveSuggestion: state.liveSuggestionsEnabled
          ? state.liveSuggestion ?? newPlaces[0] ?? null
          : null,
      }
    }
    case 'FAILED':
      return {
        ...state,
        phase: 'ERROR',
        errorMessage: action.message,
        failedAction: action.action,
        newRecommendationIds: [],
      }
    case 'RESET':
      return { ...initialTravelSessionState, liveSuggestionsEnabled: state.liveSuggestionsEnabled, notice: action.notice }
  }
}

export interface TravelSessionController {
  state: TravelSessionState
  isBusy: boolean
  canStart: boolean
  canRefresh: boolean
  canStop: boolean
  start: (preferences: TravelerPreferences) => Promise<void>
  refresh: () => Promise<void>
  stop: () => Promise<void>
  setLiveSuggestionsEnabled: (enabled: boolean) => void
  dismissSuggestion: () => void
}

interface WatchedFix {
  coordinates: BrowserCoordinates
  receivedAt: number
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}

/**
 * Owns the Start / Refresh / Stop Exploring workflow and automatic monitoring.
 * Refs guard against duplicate requests before React re-renders, and stale responses are ignored after stop or unmount.
 */
export function useTravelSession(
  { refreshThrottleMs = LIVE_REFRESH_THROTTLE_MS }: { refreshThrottleMs?: number } = {},
): TravelSessionController {
  const [state, dispatch] = useReducer(reducer, initialTravelSessionState)
  const busyRef = useRef(false)
  const autoBusyRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)
  /** When the last successful evaluation finished. Used to decide if a refresh is due on return to the tab. */
  const lastSuccessAtRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const autoAbortRef = useRef<AbortController | null>(null)
  const watchedFixRef = useRef<WatchedFix | null>(null)
  const autoRefreshRef = useRef<() => Promise<void>>(async () => undefined)
  const lastAttemptAtRef = useRef<number | null>(null)
  const lastSubmittedLocationRef = useRef<BrowserCoordinates | null>(null)
  const liveEnabledRef = useRef(true)
  const automaticPausedRef = useRef(false)
  const monitoringStoppedRef = useRef(false)
  const stoppingRef = useRef(false)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      autoAbortRef.current?.abort()
      const sessionId = sessionIdRef.current
      if (sessionId) {
        sessionIdRef.current = null
        // Best effort: the page is going away, so don't leave an orphaned session running.
        void stopTravelSession(sessionId).catch(() => undefined)
      }
    }
  }, [])

  const monitoredSessionId =
    !state.liveSuggestionsEnabled || state.phase === 'STOPPING_SESSION' || state.failedAction === 'stop'
      ? null : state.sessionId
  useEffect(() => {
    if (monitoredSessionId === null) return

    // Location watching runs only while the tab is visible, so hidden tabs use no GPS.
    let stopWatching: (() => void) | null = null
    let movementTimer: number | undefined
    const considerMovement = () => {
      const fix = watchedFixRef.current
      const previous = lastSubmittedLocationRef.current
      if (!fix || !previous || distanceBetweenLocations(previous, fix.coordinates) < GPS_JITTER_METERS) return
      if (movementTimer !== undefined) return
      const delay = Math.max(0, refreshThrottleMs - (Date.now() - (lastAttemptAtRef.current ?? 0)))
      movementTimer = window.setTimeout(() => {
        movementTimer = undefined
        void autoRefreshRef.current()
      }, delay)
    }
    const startWatching = () => {
      if (stopWatching) return
      stopWatching = watchLocation(
        (coordinates) => {
          watchedFixRef.current = { coordinates, receivedAt: Date.now() }
          dispatch({ type: 'LOCATION_SHARED' })
          considerMovement()
        },
        (error) => {
          watchedFixRef.current = null
          dispatch({ type: 'LOCATION_NOTICE', message: error.message })
        },
      )
    }
    const stopWatchingNow = () => {
      stopWatching?.()
      stopWatching = null
      watchedFixRef.current = null
      window.clearTimeout(movementTimer)
      movementTimer = undefined
    }

    if (!document.hidden) startWatching()

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopWatchingNow()
        abortAutoRefresh()
        return
      }
      startWatching()
      // Catch up on a refresh that was missed while hidden, without waiting for the next tick.
      const lastSuccessAt = lastSuccessAtRef.current
      if (lastSuccessAt === null || Date.now() - lastSuccessAt >= AUTO_REFRESH_INTERVAL_MS) {
        void autoRefreshRef.current()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const timer = window.setInterval(() => {
      void autoRefreshRef.current()
    }, AUTO_REFRESH_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(timer)
      stopWatchingNow()
      abortAutoRefresh()
    }
  }, [monitoredSessionId, refreshThrottleMs])

  function begin(): AbortSignal | null {
    if (busyRef.current) return null
    busyRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    return controller.signal
  }

  function end(signal: AbortSignal) {
    if (abortRef.current?.signal !== signal) return
    busyRef.current = false
    abortRef.current = null
  }

  function abortAutoRefresh() {
    autoAbortRef.current?.abort()
    autoAbortRef.current = null
    autoBusyRef.current = false
    dispatch({ type: 'CHECKING', checking: false })
  }

  function endSessionLocally(notice: string) {
    abortAutoRefresh()
    sessionIdRef.current = null
    lastSubmittedLocationRef.current = null
    watchedFixRef.current = null
    dispatch({ type: 'RESET', notice })
  }

  function handleFailure(error: unknown) {
    if (isAbortError(error)) return

    if (isSessionExpiredError(error)) {
      endSessionLocally(SESSION_EXPIRED_NOTICE)
      return
    }
    if (isSessionGoneError(error)) {
      // The backend has no active session for this ID, so start over.
      endSessionLocally(SESSION_ENDED_NOTICE)
      return
    }

    const action: FailedAction = sessionIdRef.current ? 'refresh' : 'start'
    const message =
      error instanceof LocationError ? error.message : describeTravelApiError(error)
    dispatch({ type: 'FAILED', action, message })
  }

  async function acquireLocation(signal: AbortSignal): Promise<BrowserCoordinates> {
    const coordinates = await getCurrentLocation(signal)
    throwIfAborted(signal)
    watchedFixRef.current = { coordinates, receivedAt: Date.now() }
    dispatch({ type: 'LOCATION_SHARED' })
    return coordinates
  }

  /** Reuses a fresh watched position for automatic refreshes, otherwise asks the browser once. */
  async function locationForAutoRefresh(signal: AbortSignal): Promise<BrowserCoordinates> {
    const fix = watchedFixRef.current
    if (fix && Date.now() - fix.receivedAt < WATCHED_LOCATION_MAX_AGE_MS) {
      throwIfAborted(signal)
      return fix.coordinates
    }
    return acquireLocation(signal)
  }

  async function fetchRecommendations(
    sessionId: string,
    location: BrowserCoordinates,
    signal: AbortSignal,
    { initial = false }: { initial?: boolean } = {},
  ) {
    lastAttemptAtRef.current = Date.now()
    lastSubmittedLocationRef.current = location
    const response = await getSessionRecommendations(sessionId, location, { signal })
    throwIfAborted(signal)
    if (sessionIdRef.current !== sessionId) return
    lastSuccessAtRef.current = Date.now()
    dispatch({ type: 'RECOMMENDATIONS_RECEIVED', response, initial })
  }

  async function start(preferences: TravelerPreferences) {
    if (sessionIdRef.current !== null) return
    const signal = begin()
    if (!signal) return

    try {
      dispatch({ type: 'BUSY', phase: 'REQUESTING_LOCATION' })
      const location = await acquireLocation(signal)

      dispatch({ type: 'BUSY', phase: 'STARTING_SESSION' })
      const session = await createTravelSession(preferences, { signal })
      if (signal.aborted) {
        // The page unmounted while creating the session, so end it now.
        void stopTravelSession(session.sessionId).catch(() => undefined)
        throwIfAborted(signal)
      }
      sessionIdRef.current = session.sessionId
      automaticPausedRef.current = false
      monitoringStoppedRef.current = false
      lastSuccessAtRef.current = null
      dispatch({ type: 'SESSION_CREATED', sessionId: session.sessionId })

      dispatch({ type: 'BUSY', phase: 'LOADING_RECOMMENDATIONS' })
      await fetchRecommendations(session.sessionId, location, signal, { initial: true })
    } catch (error) {
      if (!signal.aborted) handleFailure(error)
    } finally {
      end(signal)
    }
  }

  async function refresh() {
    const sessionId = sessionIdRef.current
    if (!sessionId || autoBusyRef.current) return
    const signal = begin()
    if (!signal) return
    automaticPausedRef.current = false

    try {
      dispatch({ type: 'BUSY', phase: 'REQUESTING_LOCATION' })
      const location = await locationForAutoRefresh(signal)
      dispatch({ type: 'BUSY', phase: 'LOADING_RECOMMENDATIONS' })
      await fetchRecommendations(sessionId, location, signal)
    } catch (error) {
      if (!signal.aborted) handleFailure(error)
    } finally {
      end(signal)
    }
  }

  /** Background refresh on the interval. It never changes the busy phase, so the UI stays calm. */
  async function runAutoRefresh() {
    const sessionId = sessionIdRef.current
    if (sessionId === null || busyRef.current || autoBusyRef.current ||
      !liveEnabledRef.current || automaticPausedRef.current || monitoringStoppedRef.current) return
    // Pause while the tab is hidden to save backend and provider calls.
    if (document.hidden) return
    if (lastAttemptAtRef.current !== null && Date.now() - lastAttemptAtRef.current < refreshThrottleMs) return

    autoBusyRef.current = true
    const controller = new AbortController()
    autoAbortRef.current = controller
    dispatch({ type: 'CHECKING', checking: true })
    try {
      const location = await locationForAutoRefresh(controller.signal)
      await fetchRecommendations(sessionId, location, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) {
        automaticPausedRef.current = true
        handleFailure(error)
      }
    } finally {
      if (autoAbortRef.current === controller) {
        autoBusyRef.current = false
        autoAbortRef.current = null
        dispatch({ type: 'CHECKING', checking: false })
      }
    }
  }

  useEffect(() => {
    autoRefreshRef.current = runAutoRefresh
  })

  async function stop() {
    const sessionId = sessionIdRef.current
    if (!sessionId) {
      dispatch({ type: 'RESET', notice: null })
      return
    }
    if (stoppingRef.current) return
    stoppingRef.current = true
    abortRef.current?.abort()
    busyRef.current = false
    const signal = begin()
    if (!signal) return
    abortAutoRefresh()
    monitoringStoppedRef.current = true

    dispatch({ type: 'BUSY', phase: 'STOPPING_SESSION' })
    try {
      await stopTravelSession(sessionId, { signal })
      throwIfAborted(signal)
      sessionIdRef.current = null
      dispatch({ type: 'RESET', notice: null })
    } catch (error) {
      if (isAbortError(error)) return
      if (isSessionGoneError(error)) {
        // Already ended or expired on the backend, so there is nothing left to stop.
        sessionIdRef.current = null
        dispatch({
          type: 'RESET',
          notice: isSessionExpiredError(error)
            ? 'Your travel session had already expired.'
            : 'Your travel session had already ended.',
        })
        return
      }
      dispatch({
        type: 'FAILED',
        action: 'stop',
        message: `We couldn't confirm that your travel session ended. ${describeTravelApiError(error)} Press Stop Exploring to try again.`,
      })
    } finally {
      stoppingRef.current = false
      end(signal)
    }
  }

  function setLiveSuggestionsEnabled(enabled: boolean) {
    liveEnabledRef.current = enabled
    if (!enabled) abortAutoRefresh()
    else automaticPausedRef.current = false
    dispatch({ type: 'LIVE_ENABLED', enabled })
  }

  const isBusy = BUSY_PHASES.includes(state.phase)

  return {
    state,
    isBusy,
    canStart: state.sessionId === null && !isBusy,
    canRefresh: state.sessionId !== null && !isBusy && !state.isCheckingForUpdates && state.failedAction !== 'stop',
    canStop: state.sessionId !== null && state.phase !== 'STOPPING_SESSION',
    start,
    refresh,
    stop,
    setLiveSuggestionsEnabled,
    dismissSuggestion: () => dispatch({ type: 'DISMISS_SUGGESTION' }),
  }
}
