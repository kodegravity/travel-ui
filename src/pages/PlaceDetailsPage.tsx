import { lazy, Suspense, useEffect, useState } from 'react'
import {
  Accessibility,
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Heart,
  MapPin,
  Plus,
  Star,
  Tag,
} from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { CATEGORIES, interestsOf, primaryCategory } from '../data/categories'
import { findCity, findCountry, type City } from '../data/destinations'
import { cachedRequest, forgetRequest } from '../services/requestCache'
import { formatCost, isSafeMapsUrl } from '../services/recommendationFormat'
import { describeTravelApiError, getPlaceDetails, TravelApiError } from '../services/travelApi'
import { rememberPlacePhoto } from '../services/placePhotos'
import { usePlacePhoto } from '../hooks/usePlacePhoto'
import { PhotoCredit } from '../components/common/PhotoCredit'
import {
  formatMinutes,
  toggleFavorite,
  toggleTripPlace,
  useTripStore,
  type SavedPlace,
} from '../services/tripStore'
import type { PlaceDetails, RecommendationDto } from '../types/api'

const PlacesMap = lazy(() => import('../components/explorer/PlacesMap'))

/** What Explore already knew, passed along in the link so the page has content before details arrive. */
export interface PlaceLinkState {
  place?: RecommendationDto
  nearby?: RecommendationDto[]
}

type Tab = 'overview' | 'reviews' | 'nearby'
type DetailsState =
  | { status: 'loading' }
  | { status: 'ready'; details: PlaceDetails }
  | { status: 'missing' }
  | { status: 'error'; message: string }

const WALKING_KMH = 4.5
const MAX_NEARBY = 6
const TOAST_MS = 2600

const PRICE_LEVELS: Record<string, { label: string; symbols: number }> = {
  PRICE_LEVEL_FREE: { label: 'Free', symbols: 0 },
  PRICE_LEVEL_INEXPENSIVE: { label: 'Inexpensive', symbols: 1 },
  PRICE_LEVEL_MODERATE: { label: 'Moderate', symbols: 2 },
  PRICE_LEVEL_EXPENSIVE: { label: 'Expensive', symbols: 3 },
  PRICE_LEVEL_VERY_EXPENSIVE: { label: 'Very expensive', symbols: 4 },
}

function currencySymbol(code: string | undefined): string {
  if (!code) return '$'
  try {
    const part = new Intl.NumberFormat('en', { style: 'currency', currency: code }).formatToParts(0)
    return part.find((p) => p.type === 'currency')?.value ?? '$'
  } catch {
    return '$'
  }
}

function describePrice(level: string | undefined, currency: string | undefined): string | null {
  const known = level ? PRICE_LEVELS[level] : undefined
  if (!known) return null
  return known.symbols === 0 ? known.label : `${known.label} · ${currencySymbol(currency).repeat(known.symbols)}`
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function formatCount(n: number): string {
  return new Intl.NumberFormat('en', { notation: n >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n)
}

function useToast(): [string | null, (message: string) => void] {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])
  return [toast, setToast]
}

export function PlaceDetailsPage() {
  const { cityId, placeId } = useParams()
  const city = findCity(cityId)
  if (!city || !placeId) {
    return (
      <AppLayout active="explore">
        <NotFound city={city} />
      </AppLayout>
    )
  }
  return <PlaceView key={`${city.id}/${placeId}`} city={city} placeId={placeId} />
}

function NotFound({ city }: { city: City | undefined }) {
  return (
    <div className="explore-missing">
      <div className="tm-card state-card">
        <h1 className="state-card__title">We couldn&apos;t find that place</h1>
        <p className="state-card__text">It may have closed, or the link is incomplete.</p>
        <Link className="tm-btn tm-btn--primary tm-btn--sm" to={city ? `/explore/${city.id}` : '/'}>
          {city ? `Back to Explore ${city.name}` : 'Choose a destination'}
        </Link>
      </div>
    </div>
  )
}

function PlaceView({ city, placeId }: { city: City; placeId: string }) {
  const linkState = (useLocation().state ?? {}) as PlaceLinkState
  const store = useTripStore()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{ attempt: number; state: DetailsState } | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [toast, showToast] = useToast()

  useEffect(() => {
    let active = true
    cachedRequest(`place-details:${placeId}`, () => getPlaceDetails(placeId))
      .then((details) => {
        if (details.photo) rememberPlacePhoto(placeId, details.photo)
        if (active) setLoaded({ attempt, state: { status: 'ready', details } })
      })
      .catch((error: unknown) => {
        if (!active) return
        const missing = error instanceof TravelApiError && error.status === 404
        setLoaded({ attempt, state: missing ? { status: 'missing' } : { status: 'error', message: describeTravelApiError(error) } })
      })
    return () => {
      active = false
    }
  }, [placeId, attempt])

  const state: DetailsState = loaded && loaded.attempt === attempt ? loaded.state : { status: 'loading' }
  const details = state.status === 'ready' ? state.details : undefined

  // Basic facts we already had: from the Explore link, or from the saved trip or favorites.
  const saved: SavedPlace | undefined =
    store.trips[city.id]?.find((p) => p.placeId === placeId) ?? store.favorites.find((p) => p.placeId === placeId)
  const basic = linkState.place?.placeId === placeId ? linkState.place : undefined
  const name = details?.name ?? basic?.name ?? saved?.name
  const category = basic?.category ?? saved?.category
  const duration = basic?.estimatedDurationMinutes ?? saved?.estimatedDurationMinutes
  const latitude = details?.latitude ?? basic?.latitude ?? saved?.latitude
  const longitude = details?.longitude ?? basic?.longitude ?? saved?.longitude
  const country = findCountry(city.country)

  if (state.status === 'missing' && !name) {
    return (
      <AppLayout active="explore">
        <NotFound city={city} />
      </AppLayout>
    )
  }

  const savedPlace: SavedPlace | null =
    name && latitude != null && longitude != null
      ? {
          placeId,
          cityId: city.id,
          name,
          category: category ?? '',
          latitude,
          longitude,
          ...(duration != null ? { estimatedDurationMinutes: duration } : {}),
          ...(basic?.mapsUrl ?? saved?.mapsUrl ? { mapsUrl: basic?.mapsUrl ?? saved?.mapsUrl } : {}),
        }
      : null
  const inTrip = (store.trips[city.id] ?? []).some((p) => p.placeId === placeId)
  const isFavorite = store.favorites.some((p) => p.placeId === placeId)
  const directions = basic?.mapsUrl ?? saved?.mapsUrl
  const tone = primaryCategory(category ?? '').tone

  function onToggleTrip() {
    if (!savedPlace) return
    const added = toggleTripPlace(savedPlace)
    showToast(added ? `${savedPlace.name} added to your trip` : `${savedPlace.name} removed from your trip`)
  }

  function onToggleFavorite() {
    if (!savedPlace) return
    const added = toggleFavorite(savedPlace)
    showToast(added ? 'Saved to Favorites' : 'Removed from Favorites')
  }

  const nearby =
    latitude != null && longitude != null
      ? (linkState.nearby ?? [])
          .filter((p) => p.placeId !== placeId)
          .map((p) => ({ place: p, km: haversineKm({ latitude, longitude }, p) }))
          .sort((a, b) => a.km - b.km)
          .slice(0, MAX_NEARBY)
      : []
  const reviewCount = details?.reviews?.length ?? 0
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    ...(reviewCount > 0 ? [{ id: 'reviews' as const, label: `Reviews (${reviewCount})` }] : []),
    ...(nearby.length > 0 ? [{ id: 'nearby' as const, label: 'Nearby' }] : []),
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'overview'
  const price =
    describePrice(details?.priceLevel, country?.currency) ??
    (basic?.estimatedCost != null ? formatCost(basic.estimatedCost, basic.currencyCode) : null)
  const accessibility = details?.accessibility
  const accessibilityItems = accessibility
    ? [
        accessibility.wheelchairAccessibleEntrance != null &&
          `Wheelchair-accessible entrance: ${accessibility.wheelchairAccessibleEntrance ? 'yes' : 'no'}`,
        accessibility.wheelchairAccessibleRestroom != null &&
          `Accessible restroom: ${accessibility.wheelchairAccessibleRestroom ? 'yes' : 'no'}`,
        accessibility.wheelchairAccessibleSeating != null &&
          `Accessible seating: ${accessibility.wheelchairAccessibleSeating ? 'yes' : 'no'}`,
        accessibility.wheelchairAccessibleParking != null &&
          `Accessible parking: ${accessibility.wheelchairAccessibleParking ? 'yes' : 'no'}`,
      ].filter((item): item is string => Boolean(item))
    : []

  const addButton = (extraClass = '') => (
    <button
      type="button"
      className={`tm-btn ${inTrip ? 'tm-btn--added' : 'tm-btn--accent'} ${extraClass}`}
      aria-pressed={inTrip}
      disabled={!savedPlace}
      onClick={onToggleTrip}
    >
      {inTrip ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
      {inTrip ? 'In your trip' : 'Add to My Trip'}
    </button>
  )

  return (
    <AppLayout active="explore">
      <div className="place">
        <div className="explore-container place__main">
          <Link className="place__back" to={`/explore/${city.id}`}>
            <ArrowLeft size={18} aria-hidden="true" />
            Back to Explore {city.name}
          </Link>

          <header className="place-head">
            <div className="place-head__text">
              {category && (
                <ul className="place-head__chips">
                  {interestsOf(category).map((interest) => (
                    <li key={interest}>{CATEGORIES.find((c) => c.interest === interest)?.label}</li>
                  ))}
                </ul>
              )}
              <h1 className="place-head__title">
                {name ?? (state.status === 'loading' ? <span className="tm-skeleton place-head__title-skeleton" /> : 'Place details')}
              </h1>
              <div className="place-head__meta">
                {details?.rating != null && (
                  <span className="place-rating">
                    <Star size={16} aria-hidden="true" className="place-rating__star" />
                    <strong>{details.rating.toFixed(1)}</strong>
                    {details.userRatingCount != null && <span> · {formatCount(details.userRatingCount)} ratings</span>}
                  </span>
                )}
                {details?.address && (
                  <span className="place-head__address">
                    <MapPin size={16} aria-hidden="true" />
                    {details.address}
                  </span>
                )}
              </div>
            </div>
            <div className="place-head__actions">
              <button
                type="button"
                className="tm-btn tm-btn--ghost"
                aria-pressed={isFavorite}
                disabled={!savedPlace}
                onClick={onToggleFavorite}
              >
                <Heart size={18} aria-hidden="true" className={isFavorite ? 'place-card__heart--on' : undefined} />
                {isFavorite ? 'Saved' : 'Save'}
              </button>
              <a className="tm-btn tm-btn--ghost" href="#location">
                <MapPin size={18} aria-hidden="true" />
                View on Map
              </a>
              {addButton()}
            </div>
          </header>

          <figure className="place-photo">
            {details?.photo ? (
              <img className="place-photo__img" src={details.photo.url} alt={`${name ?? 'Place'}`} />
            ) : (
              <div className={`place-photo__tile tone-tile${state.status === 'loading' ? ' tm-skeleton' : ''}`} style={{ backgroundColor: tone }} aria-hidden="true" />
            )}
            {details?.photo && details.photo.attributions.length > 0 && (
              <figcaption className="place-photo__credit">
                Photo:{' '}
                {details.photo.attributions.map((a, i) => (
                  <span key={`${a.displayName}-${i}`}>
                    {i > 0 && ', '}
                    {a.uri ? (
                      <a href={a.uri} target="_blank" rel="noopener noreferrer">
                        {a.displayName}
                      </a>
                    ) : (
                      a.displayName
                    )}
                  </span>
                ))}
              </figcaption>
            )}
          </figure>

          {state.status === 'error' && (
            <div className="place-alert" role="alert">
              <AlertTriangle size={20} aria-hidden="true" />
              <span>
                Details are unavailable right now. {state.message}
              </span>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-btn--sm"
                onClick={() => {
                  forgetRequest(`place-details:${placeId}`)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </button>
            </div>
          )}

          <div className="place-layout">
            <section className="place-content" aria-label="About this place">
              <div className="place-tabs" role="tablist" aria-label="Place sections">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-controls={`panel-${t.id}`}
                    aria-selected={activeTab === t.id}
                    className="place-tabs__tab"
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" className="place-panel">
                  <h2 className="place-panel__title">About</h2>
                  {state.status === 'loading' ? (
                    <div className="place-panel__skeleton" aria-hidden="true">
                      <span className="tm-skeleton" />
                      <span className="tm-skeleton" />
                      <span className="tm-skeleton" />
                    </div>
                  ) : (
                    <p className="place-panel__text">
                      {details?.summary ?? basic?.description ?? 'No description is available for this place yet.'}
                    </p>
                  )}
                  {accessibilityItems.length > 0 && (
                    <>
                      <h2 className="place-panel__title">Accessibility</h2>
                      <ul className="place-panel__list">
                        {accessibilityItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && details?.reviews && (
                <div role="tabpanel" id="panel-reviews" aria-labelledby="tab-reviews" className="place-panel">
                  {details.rating != null && (
                    <div className="tm-card review-summary">
                      <span className="review-summary__score">{details.rating.toFixed(1)}</span>
                      <span className="review-summary__meta">
                        {details.userRatingCount != null ? `${formatCount(details.userRatingCount)} ratings on Google` : 'Google rating'}
                      </span>
                    </div>
                  )}
                  <ul className="review-list">
                    {details.reviews.map((review, i) => (
                      <li key={i} className="tm-card review">
                        <div className="review__head">
                          <span className="review__avatar" aria-hidden="true">
                            {(review.authorName ?? '?').charAt(0).toUpperCase()}
                          </span>
                          <span className="review__who">
                            {review.authorUri ? (
                              <a href={review.authorUri} target="_blank" rel="noopener noreferrer">
                                {review.authorName ?? 'Google user'}
                              </a>
                            ) : (
                              <strong>{review.authorName ?? 'Google user'}</strong>
                            )}
                            {review.relativeTime && <span className="review__when">{review.relativeTime}</span>}
                          </span>
                          {review.rating != null && (
                            <span className="review__stars" aria-label={`${review.rating} out of 5 stars`}>
                              ★ {review.rating}
                            </span>
                          )}
                        </div>
                        {review.text && <p className="review__text">{review.text}</p>}
                      </li>
                    ))}
                  </ul>
                  <p className="place-attribution">Reviews from Google</p>
                </div>
              )}

              {activeTab === 'nearby' && (
                <div role="tabpanel" id="panel-nearby" aria-labelledby="tab-nearby" className="place-panel">
                  <ul className="nearby-list">
                    {nearby.map(({ place, km }) => (
                      <li key={place.placeId}>
                        <NearbyCard
                          place={place}
                          to={`/places/${city.id}/${encodeURIComponent(place.placeId)}`}
                          state={{ place, nearby: linkState.nearby } satisfies PlaceLinkState}
                          walkMinutes={Math.max(1, Math.round((km / WALKING_KMH) * 60))}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <aside className="place-side" aria-label="Visit details">
              <div className="tm-card place-facts">
                <div className="place-fact">
                  <span className="place-fact__icon" aria-hidden="true">
                    <Clock size={20} />
                  </span>
                  <div className="place-fact__body">
                    <strong className="place-fact__label">
                      Opening hours
                      {details?.openNow != null && (
                        <span className={`open-badge${details.openNow ? ' open-badge--open' : ''}`}>
                          {details.openNow ? 'Open now' : 'Closed now'}
                        </span>
                      )}
                    </strong>
                    {details?.weekdayHours?.length ? (
                      <ul className="place-hours">
                        {details.weekdayHours.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="place-fact__muted">{state.status === 'loading' ? 'Loading…' : 'Not available'}</span>
                    )}
                  </div>
                </div>
                <div className="place-fact">
                  <span className="place-fact__icon" aria-hidden="true">
                    <Tag size={20} />
                  </span>
                  <div className="place-fact__body">
                    <strong className="place-fact__label">Price</strong>
                    <span className={price ? undefined : 'place-fact__muted'}>{price ?? 'Not available'}</span>
                  </div>
                </div>
                <div className="place-fact">
                  <span className="place-fact__icon" aria-hidden="true">
                    <Clock size={20} />
                  </span>
                  <div className="place-fact__body">
                    <strong className="place-fact__label">Visit duration</strong>
                    <span className={duration != null ? undefined : 'place-fact__muted'}>
                      {duration != null ? `About ${formatMinutes(duration)} (estimate)` : 'Not available'}
                    </span>
                  </div>
                </div>
                {details?.websiteUri?.startsWith('https://') && (
                  <div className="place-fact">
                    <span className="place-fact__icon" aria-hidden="true">
                      <Globe size={20} />
                    </span>
                    <div className="place-fact__body">
                      <strong className="place-fact__label">Website</strong>
                      <a href={details.websiteUri} target="_blank" rel="noopener noreferrer" className="place-fact__link">
                        {new URL(details.websiteUri).hostname.replace(/^www\./, '')}
                      </a>
                    </div>
                  </div>
                )}
                {accessibility?.wheelchairAccessibleEntrance != null && (
                  <div className="place-fact">
                    <span className="place-fact__icon" aria-hidden="true">
                      <Accessibility size={20} />
                    </span>
                    <div className="place-fact__body">
                      <strong className="place-fact__label">Accessibility</strong>
                      <span>
                        {accessibility.wheelchairAccessibleEntrance ? 'Wheelchair-accessible entrance' : 'Entrance not wheelchair accessible'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div id="location" className="tm-card place-location">
                {latitude != null && longitude != null ? (
                  <div className="place-location__map">
                    <Suspense fallback={<div className="places-map places-map--loading">Loading map…</div>}>
                      <PlacesMap
                        places={[{ id: placeId, name: name ?? 'Place', latitude, longitude, number: 1 }]}
                        center={null}
                        selectedId={placeId}
                        onSelect={() => {}}
                        visible
                      />
                    </Suspense>
                  </div>
                ) : null}
                <div className="place-location__body">
                  {details?.address && <span className="place-location__address">{details.address}</span>}
                  {isSafeMapsUrl(directions) && (
                    <a className="tm-btn tm-btn--ghost tm-btn--sm" href={directions} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={16} aria-hidden="true" />
                      Directions in Google Maps
                    </a>
                  )}
                  {addButton('place-location__add')}
                </div>
              </div>

              {details?.source && (
                <p className="place-attribution">
                  {details.source === 'google' ? 'Place information from Google' : 'Sample data for development'}
                </p>
              )}
            </aside>
          </div>
        </div>

        <div className="place-bar">
          <span className="place-bar__summary">
            <strong>{price ?? (duration != null ? `≈ ${formatMinutes(duration)}` : name)}</strong>
            <span>{price ? 'price level' : duration != null ? 'estimated visit' : ''}</span>
          </span>
          {addButton('place-bar__add')}
        </div>

        {toast && (
          <div className="tm-toast" role="status">
            <span className="tm-toast__icon" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            {toast}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function NearbyCard({ place, to, state, walkMinutes }: { place: RecommendationDto; to: string; state: PlaceLinkState; walkMinutes: number }) {
  const { ref, photo } = usePlacePhoto<HTMLAnchorElement>(place.placeId)
  return (
    <Link ref={ref} className="tm-card nearby-card" to={to} state={state}>
      <span className="nearby-card__thumb tone-tile" style={{ backgroundColor: primaryCategory(place.category).tone }} aria-hidden="true">
        {photo && <img className="card-photo" src={photo.url} alt="" loading="lazy" />}
      </span>
      <span className="nearby-card__text">
        <strong>{place.name}</strong>
        <span className="nearby-card__walk">{walkMinutes} min walk</span>
        {photo && <PhotoCredit photo={photo} plain className="nearby-card__credit" />}
      </span>
    </Link>
  )
}
