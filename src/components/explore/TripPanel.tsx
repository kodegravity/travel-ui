import { Route, X } from 'lucide-react'
import { primaryCategory } from '../../data/categories'
import { formatMinutes, totalVisitMinutes, type SavedPlace } from '../../services/tripStore'

export interface TripPanelProps {
  cityName: string
  places: readonly SavedPlace[]
  onRemove: (placeId: string) => void
  /** Heading level id, so the panel can be labelled where it is placed. */
  headingId: string
}

/** SelectedPlacesPanel from the design. Route optimizing is the next page to build, so its button is inactive. */
export function TripPanel({ cityName, places, onRemove, headingId }: TripPanelProps) {
  const minutes = totalVisitMinutes(places)
  const canOptimize = places.length >= 2

  return (
    <div className="trip-panel">
      <div className="trip-panel__head">
        <h2 id={headingId} className="trip-panel__title">
          Your {cityName} trip
        </h2>
        <span className="trip-panel__count">
          {places.length} {places.length === 1 ? 'place' : 'places'}
        </span>
      </div>

      {places.length > 0 ? (
        <>
          <ul className="trip-panel__list">
            {places.map((place) => {
              const category = primaryCategory(place.category)
              return (
                <li key={place.placeId} className="trip-panel__item">
                  <span className="trip-panel__thumb tone-tile" style={{ backgroundColor: category.tone }} aria-hidden="true" />
                  <span className="trip-panel__text">
                    <span className="trip-panel__name">{place.name}</span>
                    <span className="trip-panel__meta">
                      {place.estimatedDurationMinutes != null
                        ? `≈ ${formatMinutes(place.estimatedDurationMinutes)}`
                        : 'Time unknown'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="trip-panel__remove"
                    aria-label={`Remove ${place.name}`}
                    onClick={() => onRemove(place.placeId)}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="trip-panel__total">
            <span>Est. sightseeing time</span>
            <strong>{formatMinutes(minutes)}</strong>
          </div>
        </>
      ) : (
        <p className="trip-panel__empty">
          No places yet. Use <strong>Add to Trip</strong> on any card.
        </p>
      )}

      <button type="button" className="tm-btn tm-btn--accent trip-panel__cta" disabled aria-describedby={`${headingId}-note`}>
        <Route size={18} aria-hidden="true" />
        Optimize My Route
      </button>
      <p id={`${headingId}-note`} className="trip-panel__note">
        {canOptimize
          ? 'Route optimizing is coming soon. Your selection is saved on this device.'
          : 'Add at least 2 places to optimize a route.'}
      </p>
    </div>
  )
}
