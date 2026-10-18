import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronUp, Search, SearchX } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ExplorePlaceCard } from '../components/explore/ExplorePlaceCard'
import { TripPanel } from '../components/explore/TripPanel'
import { CATEGORIES, interestsOf } from '../data/categories'
import { findCity, findCountry, type City } from '../data/destinations'
import { useCityPlaces } from '../hooks/useCityPlaces'
import { rememberExploredCity } from '../services/lastCity'
import {
  formatMinutes,
  removeTripPlace,
  toggleFavorite,
  toggleTripPlace,
  toSavedPlace,
  totalVisitMinutes,
  useTripStore,
} from '../services/tripStore'
import type { RecommendationDto } from '../types/api'
import type { PlaceLinkState } from './PlaceDetailsPage'
import type { Interest } from '../types/travel'

type SortKey = 'recommended' | 'shortest' | 'name'
type CategoryFilter = 'all' | Interest

const BATCH = 9
const TOAST_MS = 2400

/** "14–16 Nov 2026 · 2 travelers" from the trip details Home passed along, when they are valid. */
function describeTrip(arrive: string | null, depart: string | null, travelers: string | null): string | null {
  const parse = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(y!, m! - 1, d)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const from = parse(arrive)
  const to = parse(depart)
  const people = travelers && /^\d+$/.test(travelers) ? Number(travelers) : null
  const parts: string[] = []
  if (from && to && to >= from) {
    const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()
    const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    const full = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    parts.push(sameMonth ? `${from.getDate()}–${full.format(to)}` : `${dayMonth.format(from)} – ${full.format(to)}`)
  }
  if (people && people > 0) parts.push(`${people} ${people === 1 ? 'traveler' : 'travelers'}`)
  return parts.length ? parts.join(' · ') : null
}

function sortPlaces(places: RecommendationDto[], sort: SortKey): RecommendationDto[] {
  if (sort === 'recommended') return places
  const copy = [...places]
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name))
  return copy.sort(
    (a, b) => (a.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER) - (b.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER),
  )
}

function CityNotFound() {
  return (
    <AppLayout active="explore">
      <div className="explore-missing">
        <div className="tm-card state-card">
          <h1 className="state-card__title">We don&apos;t know that city yet</h1>
          <p className="state-card__text">Pick a destination on the Home page to start exploring.</p>
          <Link className="tm-btn tm-btn--primary tm-btn--sm" to="/">
            Choose a destination
          </Link>
        </div>
      </div>
    </AppLayout>
  )
}

export function ExplorePage() {
  const { cityId } = useParams()
  const city = findCity(cityId)
  return city ? <CityExplorer key={city.id} city={city} /> : <CityNotFound />
}

function CityExplorer({ city }: { city: City }) {
  const [params] = useSearchParams()
  const { status, places, errorMessage, retry } = useCityPlaces(city)
  const store = useTripStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sort, setSort] = useState<SortKey>('recommended')
  const [limit, setLimit] = useState(BATCH)
  const [toast, setToast] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const toastTimer = useRef<number | null>(null)

  const country = findCountry(city.country)
  const trip = store.trips[city.id] ?? []
  const tripIds = new Set(trip.map((p) => p.placeId))
  const favoriteIds = new Set(store.favorites.map((p) => p.placeId))
  const tripLabel = describeTrip(params.get('arrive'), params.get('depart'), params.get('travelers'))

  useEffect(() => rememberExploredCity(city.id), [city.id])
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = places.filter(
      (place) =>
        (category === 'all' || interestsOf(place.category).includes(category)) &&
        (!q || `${place.name} ${place.category}`.toLowerCase().includes(q)),
    )
    return sortPlaces(matches, sort)
  }, [places, query, category, sort])
  const shown = filtered.slice(0, limit)

  function flash(message: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  function handleToggleTrip(place: RecommendationDto) {
    const added = toggleTripPlace(toSavedPlace(city.id, place))
    flash(added ? `${place.name} added to your trip` : `${place.name} removed from your trip`)
  }

  function resetFilters() {
    setQuery('')
    setCategory('all')
    setLimit(BATCH)
  }

  const resultLabel = status === 'ready' ? `${filtered.length} ${filtered.length === 1 ? 'place' : 'places'}` : 'Places'

  return (
    <AppLayout active="explore">
      <div className="explore">
        <section className="city-banner tone-tile" aria-labelledby="city-title">
          <div className="explore-container city-banner__content">
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <span>{city.country}</span>
              <span aria-hidden="true">/</span>
              <span aria-current="page">{city.name}</span>
            </nav>
            <h1 id="city-title" className="city-banner__title">
              Explore {city.name}
            </h1>
            <p className="city-banner__lead">
              Discover the best attractions, restaurants, museums, and hidden gems in {city.name}.
            </p>
            <ul className="city-banner__chips">
              {tripLabel && <li>{tripLabel}</li>}
              {country && <li>Currency · {country.currency}</li>}
              <li>Language · {city.language ?? country?.language}</li>
              <li>Time zone · {city.timeZone}</li>
            </ul>
          </div>
        </section>

        <div className="explore-container explore-main">
          <div className="explore-search">
            <Search size={20} className="explore-search__icon" aria-hidden="true" />
            <label htmlFor="place-filter" className="visually-hidden">
              Filter places in {city.name}
            </label>
            <input
              id="place-filter"
              className="explore-search__input"
              type="search"
              placeholder="Filter by name or category…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setLimit(BATCH)
              }}
            />
          </div>

          <div className="chips" role="group" aria-label="Categories">
            <button
              type="button"
              className={`chip${category === 'all' ? ' chip--on' : ''}`}
              aria-pressed={category === 'all'}
              onClick={() => {
                setCategory('all')
                setLimit(BATCH)
              }}
            >
              All
            </button>
            {CATEGORIES.map((meta) => (
              <button
                key={meta.interest}
                type="button"
                className={`chip${category === meta.interest ? ' chip--on' : ''}`}
                aria-pressed={category === meta.interest}
                onClick={() => {
                  setCategory(meta.interest)
                  setLimit(BATCH)
                }}
              >
                {meta.label}
              </button>
            ))}
          </div>

          <div className="explore-layout">
            <section className="explore-results" aria-label="Places">
              <div className="explore-results__head">
                <h2 id="results-heading" className="explore-results__count" aria-live="polite">
                  {resultLabel}
                </h2>
                <label className="explore-sort">
                  Sort
                  <select className="explore-sort__select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                    <option value="recommended">Recommended</option>
                    <option value="shortest">Shortest visit</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </label>
              </div>

              {status === 'loading' && (
                <ul className="place-grid" aria-busy="true" aria-label="Loading places">
                  {Array.from({ length: 6 }, (_, i) => (
                    <li key={i} className="tm-card place-skeleton" aria-hidden="true">
                      <span className="tm-skeleton place-skeleton__media" />
                      <span className="place-skeleton__body">
                        <span className="tm-skeleton place-skeleton__line place-skeleton__line--title" />
                        <span className="tm-skeleton place-skeleton__line" />
                        <span className="tm-skeleton place-skeleton__button" />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {status === 'error' && (
                <div className="tm-card state-card" role="alert">
                  <span className="state-card__icon state-card__icon--danger" aria-hidden="true">
                    <AlertTriangle size={26} />
                  </span>
                  <h3 className="state-card__title">We couldn&apos;t load places</h3>
                  <p className="state-card__text">{errorMessage}</p>
                  <button type="button" className="tm-btn tm-btn--primary tm-btn--sm" onClick={retry}>
                    Try again
                  </button>
                </div>
              )}

              {status === 'ready' && filtered.length === 0 && (
                <div className="tm-card state-card">
                  <span className="state-card__icon" aria-hidden="true">
                    <SearchX size={26} />
                  </span>
                  <h3 className="state-card__title">
                    {places.length === 0 ? `No places found around ${city.name}` : query ? `No places match “${query}”` : 'No places in this category'}
                  </h3>
                  <p className="state-card__text">
                    {places.length === 0
                      ? 'The search found nothing near the city centre. Try again later.'
                      : 'Try a different word, or browse all categories.'}
                  </p>
                  {places.length > 0 && (
                    <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={resetFilters}>
                      Clear search &amp; filters
                    </button>
                  )}
                </div>
              )}

              {status === 'ready' && filtered.length > 0 && (
                <>
                  <ul className="place-grid">
                    {shown.map((place) => (
                      <li key={place.placeId}>
                        <ExplorePlaceCard
                          place={place}
                          inTrip={tripIds.has(place.placeId)}
                          isFavorite={favoriteIds.has(place.placeId)}
                          onToggleTrip={() => handleToggleTrip(place)}
                          onToggleFavorite={() => toggleFavorite(toSavedPlace(city.id, place))}
                          detailsTo={`/places/${city.id}/${encodeURIComponent(place.placeId)}`}
                          detailsState={{ place, nearby: places } satisfies PlaceLinkState}
                        />
                      </li>
                    ))}
                  </ul>
                  {filtered.length > limit && (
                    <button type="button" className="tm-btn tm-btn--ghost explore-more" onClick={() => setLimit((n) => n + BATCH)}>
                      Show {Math.min(BATCH, filtered.length - limit)} more places
                    </button>
                  )}
                </>
              )}
            </section>

            <aside className="tm-card explore-trip" aria-labelledby="trip-heading">
              <TripPanel
                cityId={city.id}
                cityName={city.name}
                places={trip}
                onRemove={(placeId) => removeTripPlace(city.id, placeId)}
                headingId="trip-heading"
              />
            </aside>
          </div>
        </div>

        <div className="explore-bar">
          <div className="explore-bar__summary">
            <strong>
              {trip.length} {trip.length === 1 ? 'place' : 'places'} selected
            </strong>
            <span>≈ {formatMinutes(totalVisitMinutes(trip))} sightseeing</span>
          </div>
          <button
            type="button"
            className="tm-btn tm-btn--accent tm-btn--sm"
            aria-expanded={sheetOpen}
            aria-controls="trip-sheet"
            onClick={() => setSheetOpen((open) => !open)}
          >
            <ChevronUp size={18} aria-hidden="true" className={sheetOpen ? 'explore-bar__chevron--open' : undefined} />
            {sheetOpen ? 'Hide trip' : 'View trip'}
          </button>
        </div>

        {sheetOpen && (
          <div className="trip-sheet" id="trip-sheet" role="dialog" aria-modal="false" aria-labelledby="trip-sheet-heading">
            <TripPanel
              cityId={city.id}
                cityName={city.name}
              places={trip}
              onRemove={(placeId) => removeTripPlace(city.id, placeId)}
              headingId="trip-sheet-heading"
            />
          </div>
        )}

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
