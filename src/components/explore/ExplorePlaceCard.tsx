import { Check, Clock, ExternalLink, Heart, Plus, Tag } from 'lucide-react'
import { Link } from 'react-router-dom'
import { primaryCategory } from '../../data/categories'
import { formatCategory, formatCost, isSafeMapsUrl } from '../../services/recommendationFormat'
import { formatMinutes } from '../../services/tripStore'
import type { RecommendationDto } from '../../types/api'

export interface ExplorePlaceCardProps {
  place: RecommendationDto
  inTrip: boolean
  isFavorite: boolean
  onToggleTrip: () => void
  onToggleFavorite: () => void
  /** Place details page, with what Explore already loaded so it can render at once. */
  detailsTo: string
  detailsState: unknown
}

/** PlaceCard from the design: tile, save heart, name, category, visit time, price, and Add to Trip. */
export function ExplorePlaceCard({
  place,
  inTrip,
  isFavorite,
  onToggleTrip,
  onToggleFavorite,
  detailsTo,
  detailsState,
}: ExplorePlaceCardProps) {
  const category = primaryCategory(place.category)
  const Icon = category.icon

  return (
    <article className="tm-card place-card">
      <div className="place-card__media">
        <Link
          to={detailsTo}
          state={detailsState}
          className="place-card__photo tone-tile"
          style={{ backgroundColor: category.tone }}
          tabIndex={-1}
          aria-hidden="true"
        >
          <Icon size={44} strokeWidth={1.5} />
        </Link>
        <button
          type="button"
          className="place-card__fav"
          aria-pressed={isFavorite}
          aria-label={isFavorite ? `Remove ${place.name} from favorites` : `Save ${place.name} to favorites`}
          onClick={onToggleFavorite}
        >
          <Heart size={20} aria-hidden="true" className={isFavorite ? 'place-card__heart--on' : undefined} />
        </button>
      </div>

      <div className="place-card__body">
        <h3 className="place-card__name">
          <Link to={detailsTo} state={detailsState} className="place-card__link">
            {place.name}
          </Link>
        </h3>
        <p className="place-card__category">{formatCategory(place.category)}</p>
        <ul className="place-card__facts">
          <li>
            <Clock size={15} aria-hidden="true" />
            {place.estimatedDurationMinutes != null ? `≈ ${formatMinutes(place.estimatedDurationMinutes)}` : 'Time unknown'}
          </li>
          <li>
            <Tag size={15} aria-hidden="true" />
            {place.estimatedCost != null ? formatCost(place.estimatedCost, place.currencyCode) : 'Price unavailable'}
          </li>
        </ul>

        <div className="place-card__actions">
          <button
            type="button"
            className={`tm-btn ${inTrip ? 'tm-btn--added' : 'tm-btn--primary'}`}
            aria-pressed={inTrip}
            aria-label={inTrip ? `Remove ${place.name} from trip` : `Add ${place.name} to trip`}
            onClick={onToggleTrip}
          >
            {inTrip ? <Check size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            {inTrip ? 'Added to Trip' : 'Add to Trip'}
          </button>
          {isSafeMapsUrl(place.mapsUrl) && (
            <a
              className="tm-icon-btn place-card__directions"
              href={place.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Directions to ${place.name} in Google Maps (opens in a new tab)`}
            >
              <ExternalLink size={18} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
