import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  MapPin,
  Plus,
  Route,
  Trash2,
  X,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { TripSteps } from '../components/trip/TripSteps'
import { primaryCategory } from '../data/categories'
import { findCity, type City } from '../data/destinations'
import { describeLocationError, getCurrentLocation, LocationError } from '../services/geolocation'
import { lastExploredCity } from '../services/lastCity'
import { formatCategory } from '../services/recommendationFormat'
import { deviceLocation as sharedDeviceLocation, rememberDeviceLocation } from '../services/deviceLocation'
import { estimateTravel } from '../services/travelEstimate'
import {
  formatMinutes,
  moveTripPlace,
  removeTripPlace,
  setTripPlaces,
  totalVisitMinutes,
  tripSettings,
  updateTripSettings,
  useTripStore,
  type SavedPlace,
  type TravelMode,
} from '../services/tripStore'
import type { LocationRequest } from '../types/api'

const TOAST_MS = 4000

const MODES: { id: TravelMode; label: string }[] = [
  { id: 'walk', label: 'Walking' },
  { id: 'transit', label: 'Transit' },
  { id: 'drive', label: 'Driving' },
]


/** /trip without a city opens the trip for the last explored city. */
export function TripRedirect() {
  const cityId = findCity(lastExploredCity())?.id ?? 'madrid'
  return <Navigate to={`/trip/${cityId}`} replace />
}

export function TripBuilderPage() {
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
  return <TripBuilder key={city.id} city={city} />
}

interface Toast {
  message: string
  /** The trip before the change, for Undo. */
  undo?: SavedPlace[]
}

function TripBuilder({ city }: { city: City }) {
  const store = useTripStore()
  const places = store.trips[city.id] ?? []
  const settings = tripSettings(city.id, store)
  const [toast, setToast] = useState<Toast | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  // The device location stays in memory only, never in storage.
  const [deviceLocation, setDeviceLocation] = useState<LocationRequest | null>(sharedDeviceLocation)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const toastTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  function flash(next: Toast) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(next)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  function remove(place: SavedPlace) {
    const before = places
    removeTripPlace(city.id, place.placeId)
    flash({ message: `${place.name} removed`, undo: before })
  }

  function clearAll() {
    const before = places
    setTripPlaces(city.id, [])
    flash({ message: 'Trip cleared', undo: before })
  }

  function undo() {
    if (toast?.undo) setTripPlaces(city.id, toast.undo)
    setToast(null)
  }

  async function requestCurrentLocation() {
    setLocating(true)
    setLocationError(null)
    try {
      const location = await getCurrentLocation()
      rememberDeviceLocation(location)
      setDeviceLocation(location)
      updateTripSettings(city.id, { start: 'current' })
    } catch (error) {
      setLocationError(error instanceof LocationError ? describeLocationError(error.code) : "We couldn't get your location.")
      updateTripSettings(city.id, { start: 'center' })
    } finally {
      setLocating(false)
    }
  }

  // "Current location" needs this visit's device position; without it the estimate starts at the city centre.
  const startsAtDevice = settings.start === 'current' && deviceLocation !== null
  const startLocation = startsAtDevice ? deviceLocation : city.location
  const travel = estimateTravel(places, settings.mode, startLocation)
  const sightseeing = totalVisitMinutes(places)
  const unknownDurations = places.filter((p) => p.estimatedDurationMinutes == null).length
  const modeLabel = MODES.find((m) => m.id === settings.mode)?.label.toLowerCase() ?? 'walking'
  const canOptimize = places.length >= 2

  function onDrop(event: DragEvent<HTMLLIElement>, to: number) {
    event.preventDefault()
    if (dragIndex !== null) moveTripPlace(city.id, dragIndex, to)
    setDragIndex(null)
    setOverIndex(null)
  }

  const optimizeButton = (className = '') =>
    canOptimize ? (
      <Link className={`tm-btn tm-btn--accent ${className}`} to={`/trip/${city.id}/route`}>
        <Route size={18} aria-hidden="true" />
        Optimize My Route
      </Link>
    ) : (
      <button type="button" className={`tm-btn tm-btn--accent ${className}`} disabled aria-describedby="optimize-note">
        <Route size={18} aria-hidden="true" />
        Optimize My Route
      </button>
    )

  return (
    <AppLayout active="trip">
      <div className="trip">
        <div className="explore-container trip__main">
          <TripSteps current={1} />

          <header className="trip-head">
            <div className="trip-head__text">
              <h1 className="trip-head__title">Build Your {city.name} Itinerary</h1>
              <p className="trip-head__lead">
                Drag to set your preferred order, or use the arrows. Your trip is saved on this device as you go.
              </p>
            </div>
            <div className="trip-head__actions">
              <Link className="tm-btn tm-btn--ghost tm-btn--sm" to={`/explore/${city.id}`}>
                <Plus size={18} aria-hidden="true" />
                Add More Attractions
              </Link>
              {places.length > 0 && (
                <button type="button" className="tm-btn tm-btn--danger tm-btn--sm" onClick={clearAll}>
                  <Trash2 size={18} aria-hidden="true" />
                  Clear Selection
                </button>
              )}
            </div>
          </header>

          <div className="trip-layout">
            <section className="trip-list-section" aria-label="Selected attractions">
              {places.length > 0 ? (
                <>
                  <ol className="trip-list">
                    {places.map((place, i) => {
                      const tone = primaryCategory(place.category).tone
                      return (
                        <li
                          key={place.placeId}
                          className={`tm-card trip-item${dragIndex === i ? ' trip-item--dragging' : ''}${overIndex === i && dragIndex !== i ? ' trip-item--over' : ''}`}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move'
                            setDragIndex(i)
                          }}
                          onDragOver={(event) => {
                            event.preventDefault()
                            setOverIndex(i)
                          }}
                          onDragLeave={() => setOverIndex((current) => (current === i ? null : current))}
                          onDrop={(event) => onDrop(event, i)}
                          onDragEnd={() => {
                            setDragIndex(null)
                            setOverIndex(null)
                          }}
                        >
                          <span className="trip-item__handle" aria-hidden="true" title="Drag to reorder">
                            <GripVertical size={18} />
                          </span>
                          <span className="trip-item__number" aria-hidden="true">
                            {i + 1}
                          </span>
                          <span className="trip-item__thumb tone-tile" style={{ backgroundColor: tone }} aria-hidden="true" />
                          <span className="trip-item__text">
                            <Link
                              className="trip-item__name"
                              to={`/places/${city.id}/${encodeURIComponent(place.placeId)}`}
                              aria-label={`Stop ${i + 1}: ${place.name}`}
                            >
                              {place.name}
                            </Link>
                            {place.category && <span className="trip-item__category">{formatCategory(place.category)}</span>}
                          </span>
                          <span className="trip-item__duration">
                            <Clock size={15} aria-hidden="true" />
                            {place.estimatedDurationMinutes != null ? `≈ ${formatMinutes(place.estimatedDurationMinutes)}` : 'Time unknown'}
                          </span>
                          <span className="trip-item__controls">
                            <button
                              type="button"
                              className="trip-mini"
                              aria-label={`Move ${place.name} up`}
                              disabled={i === 0}
                              onClick={() => moveTripPlace(city.id, i, i - 1)}
                            >
                              <ChevronUp size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="trip-mini"
                              aria-label={`Move ${place.name} down`}
                              disabled={i === places.length - 1}
                              onClick={() => moveTripPlace(city.id, i, i + 1)}
                            >
                              <ChevronDown size={16} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="trip-mini trip-mini--danger"
                              aria-label={`Remove ${place.name}`}
                              onClick={() => remove(place)}
                            >
                              <X size={16} aria-hidden="true" />
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                  <p className="trip-tip">Tip: the route optimizer may suggest a different order. You can always keep yours.</p>
                </>
              ) : (
                <div className="tm-card state-card">
                  <span className="state-card__icon" aria-hidden="true">
                    <MapPin size={26} />
                  </span>
                  <h2 className="state-card__title">Your trip is empty</h2>
                  <p className="state-card__text">Add at least two places from Explore {city.name} to build and optimize a route.</p>
                  <Link className="tm-btn tm-btn--primary tm-btn--sm" to={`/explore/${city.id}`}>
                    Explore {city.name}
                  </Link>
                </div>
              )}
            </section>

            <aside className="tm-card trip-summary" aria-labelledby="summary-title">
              <h2 id="summary-title" className="trip-summary__title">
                Trip summary
              </h2>
              <dl className="trip-stats">
                <div className="trip-stat">
                  <dt>Places</dt>
                  <dd>{places.length}</dd>
                </div>
                <div className="trip-stat">
                  <dt>Sightseeing</dt>
                  <dd className="trip-stat--blue">{formatMinutes(sightseeing)}</dd>
                </div>
                <div className="trip-stat trip-stat--wide">
                  <dt>Est. travel time · {modeLabel}</dt>
                  <dd className="trip-stat--coral">≈ {formatMinutes(travel.minutes)}</dd>
                  <p className="trip-stat__note">
                    Rough estimate for {travel.km.toFixed(1)} km in the current order
                    {startsAtDevice ? ', from your location' : `, from ${city.name} centre`}. The optimizer uses real
                    street routes.
                  </p>
                </div>
              </dl>
              {unknownDurations > 0 && (
                <p className="trip-summary__warn">
                  {unknownDurations} {unknownDurations === 1 ? 'place has' : 'places have'} no visit estimate and{' '}
                  {unknownDurations === 1 ? 'is' : 'are'} not counted in sightseeing time.
                </p>
              )}

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

              <fieldset className="trip-field">
                <legend className="trip-field__legend">Starting point</legend>
                <label className={`trip-radio${settings.start === 'center' ? ' trip-radio--on' : ''}`}>
                  <input
                    type="radio"
                    name="start"
                    checked={settings.start === 'center'}
                    onChange={() => updateTripSettings(city.id, { start: 'center' })}
                  />
                  <span>
                    <span className="trip-radio__label">City Center</span>
                    <span className="trip-radio__hint">{city.name} centre</span>
                  </span>
                </label>
                <label className={`trip-radio${settings.start === 'current' ? ' trip-radio--on' : ''}`}>
                  <input
                    type="radio"
                    name="start"
                    checked={settings.start === 'current'}
                    disabled={locating}
                    onChange={() => void requestCurrentLocation()}
                  />
                  <span>
                    <span className="trip-radio__label">Current Location</span>
                    <span className="trip-radio__hint">
                      {locating ? 'Finding your location…' : startsAtDevice ? 'Using your device location' : 'Uses device location'}
                    </span>
                  </span>
                </label>
                {locationError && (
                  <p className="tm-error" role="alert">
                    {locationError}
                  </p>
                )}
                <p className="trip-field__hint">Hotel or custom addresses are coming with the route optimizer.</p>
              </fieldset>

              {optimizeButton('trip-summary__cta')}
              <p id="optimize-note" className="trip-summary__note">
                {canOptimize ? 'Finds the shortest order with real street routes.' : 'Add at least 2 places to optimize.'}
              </p>
            </aside>
          </div>
        </div>

        <div className="trip-bar">
          <span className="trip-bar__summary">
            <strong>
              {places.length} {places.length === 1 ? 'place' : 'places'}
            </strong>
            <span>
              ≈ {formatMinutes(sightseeing)} sightseeing · ≈ {formatMinutes(travel.minutes)} travel
            </span>
          </span>
          {optimizeButton('trip-bar__cta')}
        </div>

        {toast && (
          <div className="tm-toast" role="status">
            <span className="tm-toast__icon" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            {toast.message}
            {toast.undo && (
              <button type="button" className="tm-toast__action" onClick={undo}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
