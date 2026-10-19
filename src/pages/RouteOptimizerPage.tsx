import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Bus,
  Car,
  CircleCheck,
  Flag,
  Footprints,
  MapPin,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { MapPlace } from '../components/explorer/PlacesMap'
import { AppLayout } from '../components/layout/AppLayout'
import { TripSteps } from '../components/trip/TripSteps'
import { findCity, type City } from '../data/destinations'
import { deviceLocation, rememberDeviceLocation } from '../services/deviceLocation'
import { describeLocationError, getCurrentLocation, LocationError } from '../services/geolocation'
import { itineraryFromSchedule, saveItinerary, useItineraries } from '../services/itinerary'
import { formatCategory } from '../services/recommendationFormat'
import {
  buildSchedule,
  formatClock,
  formatKm,
  LONG_DAY_MINUTES,
  planRoute,
  type PlannedRoute,
} from '../services/routePlanner'
import {
  formatMinutes,
  setTripPlaces,
  tripSettings,
  updateTripSettings,
  useTripStore,
  type StartPoint,
  type TravelMode,
} from '../services/tripStore'
import type { LocationRequest } from '../types/api'

const PlacesMap = lazy(() => import('../components/explorer/PlacesMap'))

const MODES: { id: TravelMode; label: string; icon: typeof Footprints }[] = [
  { id: 'walk', label: 'Walking', icon: Footprints },
  { id: 'transit', label: 'Transit', icon: Bus },
  { id: 'drive', label: 'Driving', icon: Car },
]

export function RouteOptimizerPage() {
  const { cityId } = useParams()
  const city = findCity(cityId)
  if (!city) {
    return (
      <AppLayout active="trip">
        <div className="explore-missing">
          <div className="tm-card state-card">
            <h1 className="state-card__title">We don&apos;t know that city yet</h1>
            <Link className="tm-btn tm-btn--primary tm-btn--sm" to="/">
              Choose a destination
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }
  return <RouteOptimizer key={city.id} city={city} />
}

/** The last answer, tagged with the request it answers; a different key means a new answer is loading. */
type RouteState = { key: string; route: PlannedRoute }

function RouteOptimizer({ city }: { city: City }) {
  const store = useTripStore()
  const navigate = useNavigate()
  const saved = useItineraries()[city.id]
  const places = useMemo(() => store.trips[city.id] ?? [], [store.trips, city.id])
  const settings = tripSettings(city.id, store)
  const [device, setDevice] = useState<LocationRequest | null>(deviceLocation)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [routeState, setRouteState] = useState<RouteState | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [split, setSplit] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const usesDevice = settings.start === 'current' && device !== null
  const start: LocationRequest = usesDevice ? device : city.location
  const startName = usesDevice ? 'Your location' : `${city.name} centre`
  const tripKey = places.map((p) => p.placeId).sort().join(',')
  const requestKey = `${settings.mode}|${start.latitude},${start.longitude}|${tripKey}|${attempt}`

  useEffect(() => {
    if (places.length < 2) return
    let active = true
    void planRoute(places, start, settings.mode, { fresh: attempt > 0 }).then((route) => {
      if (active) setRouteState({ key: requestKey, route })
    })
    return () => {
      active = false
    }
    // requestKey captures the places, start, mode, and recalculation attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  async function requestLocation() {
    setLocating(true)
    setLocationError(null)
    try {
      const location = await getCurrentLocation()
      rememberDeviceLocation(location)
      setDevice(location)
      updateTripSettings(city.id, { start: 'current' })
    } catch (error) {
      setLocationError(error instanceof LocationError ? describeLocationError(error.code) : "We couldn't get your location.")
      updateTripSettings(city.id, { start: 'center' })
    } finally {
      setLocating(false)
    }
  }

  function chooseStart(value: StartPoint) {
    setLocationError(null)
    if (value === 'current' && !device) {
      void requestLocation()
      return
    }
    updateTripSettings(city.id, { start: value })
  }

  const route = routeState?.key === requestKey ? routeState.route : null
  const loading = places.length >= 2 && !route
  const schedule = useMemo(
    () => (route ? buildSchedule(route, start, settings.mode, split) : null),
    // start is derived from these keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, settings.mode, split, start.latitude, start.longitude],
  )

  /** Applies the order to the trip and saves the schedule as the itinerary, keeping its dates and travelers. */
  function save() {
    if (!route || !schedule) return
    setTripPlaces(city.id, route.stops)
    saveItinerary(
      itineraryFromSchedule({
        cityId: city.id,
        schedule,
        mode: settings.mode,
        // Never store a device location: re-estimates start from the centre instead.
        start: city.location,
        startName,
        source: route.source,
        ...(saved ? { startDate: saved.startDate, travelers: saved.travelers } : {}),
      }),
    )
    navigate(`/trip/${city.id}/itinerary`)
  }

  if (places.length < 2) {
    return (
      <AppLayout active="trip">
        <div className="explore-container route-page__empty">
          <div className="tm-card state-card">
            <span className="state-card__icon" aria-hidden="true">
              <MapPin size={26} />
            </span>
            <h1 className="state-card__title">Add at least 2 places first</h1>
            <p className="state-card__text">The optimizer needs two or more stops in your {city.name} trip.</p>
            <Link className="tm-btn tm-btn--primary tm-btn--sm" to={`/explore/${city.id}`}>
              Explore {city.name}
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }

  const modeLabel = MODES.find((m) => m.id === settings.mode)!.label.toLowerCase()
  const LegIcon = MODES.find((m) => m.id === settings.mode)!.icon
  const overall = schedule ? schedule.dayMinutes.reduce((a, b) => a + b, 0) : 0
  const longestDay = schedule ? Math.max(...schedule.dayMinutes) : 0
  const visitPct = schedule && overall > 0 ? Math.round((schedule.visitMinutes / (schedule.visitMinutes + schedule.travelMinutes)) * 100) : 0
  const assumedVisits = schedule?.stops.filter((s) => !s.visitKnown).length ?? 0
  const last = schedule?.stops.at(-1)
  const selected = schedule?.stops.find((s) => s.place.placeId === selectedId)
  const mapPlaces: MapPlace[] =
    schedule?.stops.map((s) => ({
      id: s.place.placeId,
      name: s.place.name,
      latitude: s.place.latitude,
      longitude: s.place.longitude,
      number: s.number,
    })) ?? []

  const actions = (className: string) => (
    <div className={className}>
      <button
        type="button"
        className="tm-btn tm-btn--ghost tm-btn--sm"
        onClick={() => setAttempt((n) => n + 1)}
        disabled={loading}
        aria-label="Recalculate route"
      >
        <RefreshCw size={18} aria-hidden="true" className={loading ? 'route-spin' : undefined} />
        <span className="route-actions__label">{loading ? 'Calculating…' : 'Recalculate Route'}</span>
      </button>
      <button type="button" className="tm-btn tm-btn--accent" onClick={save} disabled={!route}>
        <Save size={18} aria-hidden="true" />
        Save My Itinerary
      </button>
    </div>
  )

  return (
    <AppLayout active="trip">
      <div className="trip route-page">
        <div className="explore-container trip__main">
          <TripSteps current={2} />

          <header className="trip-head">
            <div className="trip-head__text">
              <Link className="route-back" to={`/trip/${city.id}`}>
                <ArrowLeft size={18} aria-hidden="true" />
                Back to Trip Builder
              </Link>
              <h1 className="trip-head__title">Your optimized {city.name} route</h1>
              <div className="route-badges">
                {route?.source === 'google' && <span className="route-badge route-badge--ok">Street routes by Google</span>}
                {route?.source === 'estimate' && (
                  <span className="route-badge">
                    {settings.mode === 'transit'
                      ? 'Transit times are estimates'
                      : 'Estimated from straight-line distances'}
                  </span>
                )}
                {loading && <span className="route-badge">Finding the shortest order…</span>}
              </div>
            </div>
            {actions('route-actions route-actions--head')}
          </header>

          {route?.fallbackReason && (
            <p className="route-note" role="status">
              {route.fallbackReason} Showing our own estimate instead; it works the same way, with less precise times.
            </p>
          )}

          <div className="route-layout">
            <section className="tm-card route-timeline" aria-label="Optimized route" aria-busy={loading}>
              <fieldset className="trip-field">
                <legend className="trip-field__legend">Travel mode</legend>
                <div className="segmented-control">
                  {MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className="segmented-control__option"
                      aria-pressed={settings.mode === mode.id}
                      onClick={() => updateTripSettings(city.id, { mode: mode.id })}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="route-start">
                <span className="trip-field__legend">Starting point</span>
                <select
                  className="route-select"
                  value={usesDevice ? 'current' : 'center'}
                  disabled={locating}
                  onChange={(event) => chooseStart(event.target.value as StartPoint)}
                >
                  <option value="center">City Center · {city.name}</option>
                  <option value="current">Current Location</option>
                </select>
              </label>
              {locating && <p className="trip-field__hint">Finding your location…</p>}
              {settings.start === 'current' && !device && !locating && (
                <p className="trip-field__hint">
                  Starting from the city centre. Choose Current Location again to use where you are now.
                </p>
              )}
              {locationError && (
                <p className="tm-error" role="alert">
                  {locationError}
                </p>
              )}
              {settings.mode === 'transit' && (
                <p className="route-mode-note">
                  Google doesn&apos;t optimize public transport routes, so the order and times for transit are our own
                  estimate. Check live times in Google Maps on the day.
                </p>
              )}

              {schedule ? (
                <ol className="route-steps">
                  <li className="route-step route-step--end">
                    <span className="route-step__flag" aria-hidden="true">
                      <Flag size={16} />
                    </span>
                    <span className="route-step__text">
                      <strong>Start · {startName}</strong>
                      <span>Depart {formatClock(9 * 60)}</span>
                    </span>
                  </li>
                  {schedule.stops.map((stop) => (
                    <li key={stop.place.placeId} className="route-step">
                      {stop.dayBreak && (
                        <div className="route-day">
                          Day 2 · starts {formatClock(10 * 60)}
                          <span>from {startName}</span>
                        </div>
                      )}
                      <div className="route-leg">
                        <span className="route-leg__line" aria-hidden="true" />
                        <LegIcon size={15} aria-hidden="true" />
                        <span>
                          {stop.leg.estimated && '≈ '}
                          {formatKm(stop.leg.km)} · {formatMinutes(stop.leg.minutes)} {modeLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`route-stop${stop.place.placeId === selectedId ? ' route-stop--on' : ''}`}
                        aria-pressed={stop.place.placeId === selectedId}
                        onClick={() => setSelectedId(stop.place.placeId)}
                      >
                        <span className="trip-item__number" aria-hidden="true">
                          {stop.number}
                        </span>
                        <span className="route-stop__text">
                          <span className="route-stop__top">
                            <strong>{stop.place.name}</strong>
                            <span className="route-stop__time">{formatClock(stop.arrive)}</span>
                          </span>
                          {stop.place.category && <span className="route-stop__cat">{formatCategory(stop.place.category)}</span>}
                          <span className="route-stop__visit">
                            Visit {stop.visitKnown ? formatMinutes(stop.visitMinutes) : `≈ ${formatMinutes(stop.visitMinutes)} (assumed)`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {last && (
                    <li className="route-step route-step--end">
                      <span className="route-step__flag route-step__flag--done" aria-hidden="true">
                        <CircleCheck size={16} />
                      </span>
                      <span className="route-step__text">
                        <strong>Finish · {last.place.name}</strong>
                        <span>Est. end {formatClock(schedule.end)}</span>
                      </span>
                    </li>
                  )}
                </ol>
              ) : (
                <div className="route-skeleton" aria-hidden="true">
                  {places.map((p) => (
                    <span key={p.placeId} className="tm-skeleton route-skeleton__row" />
                  ))}
                </div>
              )}
            </section>

            <section className="route-side" aria-label="Map and summary">
              <div className="tm-card route-map">
                <Suspense fallback={<div className="places-map places-map--loading">Loading map…</div>}>
                  <PlacesMap
                    places={mapPlaces}
                    center={start}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    visible
                    route={
                      schedule
                        ? {
                            points: [start, ...schedule.stops.map((s) => s.place)],
                            encodedLegs: schedule.stops.map((s) => (s.leg.estimated ? undefined : s.leg.polyline)),
                          }
                        : undefined
                    }
                  />
                </Suspense>
                {selected && (
                  <div className="route-pop">
                    <span className="route-pop__kicker">
                      Stop {selected.number} · arrive {formatClock(selected.arrive)}
                    </span>
                    <strong>{selected.place.name}</strong>
                    <Link to={`/places/${city.id}/${encodeURIComponent(selected.place.placeId)}`}>View details</Link>
                  </div>
                )}
              </div>

              <div className="tm-card route-summary">
                <div className="route-summary__head">
                  <h2 className="trip-summary__title">Trip summary</h2>
                  <span>
                    {split ? 'Across 2 days' : 'One day'} · {modeLabel}
                  </span>
                </div>
                {schedule ? (
                  <>
                    <dl className="route-stats">
                      <div className="trip-stat">
                        <dt>Places</dt>
                        <dd>{schedule.stops.length}</dd>
                      </div>
                      <div className="trip-stat">
                        <dt>Travel distance</dt>
                        <dd>{formatKm(schedule.km)}</dd>
                      </div>
                      <div className="trip-stat">
                        <dt>Travel time</dt>
                        <dd className="trip-stat--coral">{formatMinutes(schedule.travelMinutes)}</dd>
                      </div>
                      <div className="trip-stat">
                        <dt>Sightseeing</dt>
                        <dd className="trip-stat--blue">{formatMinutes(schedule.visitMinutes)}</dd>
                      </div>
                      <div className="trip-stat trip-stat--wide">
                        <dt>Overall duration</dt>
                        <dd>{formatMinutes(overall)}</dd>
                      </div>
                    </dl>
                    <div className="route-bar" role="img" aria-label={`Attractions ${visitPct}%, travel ${100 - visitPct}%`}>
                      <span className="route-bar__visit" style={{ width: `${visitPct}%` }} />
                      <span className="route-bar__travel" style={{ width: `${100 - visitPct}%` }} />
                    </div>
                    <div className="route-legend">
                      <span>
                        <i className="route-legend__dot route-legend__dot--visit" />
                        Time at attractions {visitPct}%
                      </span>
                      <span>
                        <i className="route-legend__dot route-legend__dot--travel" />
                        Time travelling {100 - visitPct}%
                      </span>
                    </div>
                    {assumedVisits > 0 && (
                      <p className="trip-summary__warn">
                        {assumedVisits} {assumedVisits === 1 ? 'place has' : 'places have'} no visit estimate; the schedule
                        assumes 1h each.
                      </p>
                    )}
                    {!split && longestDay > LONG_DAY_MINUTES && (
                      <div className="route-alert" role="alert">
                        <AlertTriangle size={20} aria-hidden="true" />
                        <span>
                          <strong>This itinerary may be too long for one day.</strong>
                          <span>About {formatMinutes(overall)} including travel. We suggest keeping a day under 10 hours.</span>
                        </span>
                        <button type="button" className="tm-btn tm-btn--accent tm-btn--sm" onClick={() => setSplit(true)}>
                          Split Into 2 Days
                        </button>
                      </div>
                    )}
                    {split && (
                      <div className="route-split">
                        <span>
                          <strong>Split into 2 days</strong>
                          <span>
                            Day 1: {formatMinutes(schedule.dayMinutes[0] ?? 0)} · Day 2: {formatMinutes(schedule.dayMinutes[1] ?? 0)}
                          </span>
                        </span>
                        <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={() => setSplit(false)}>
                          Keep as 1 day
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="trip-field__hint">Calculating…</p>
                )}
              </div>
            </section>
          </div>
        </div>

        {actions('trip-bar route-bar-mobile')}

      </div>
    </AppLayout>
  )
}
