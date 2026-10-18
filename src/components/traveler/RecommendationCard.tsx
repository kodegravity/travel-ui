import { Clock, ExternalLink, Wallet } from 'lucide-react'
import type { RecommendationDto } from '../../types/api'
import { formatCategory, formatCost, isSafeMapsUrl } from '../../services/recommendationFormat'

export interface RecommendationCardProps {
  recommendation: RecommendationDto
  /** 1-based number matching the map pin. Omitted when the card is shown without a map. */
  number?: number
  selected?: boolean
  onSelect?: (placeId: string) => void
}

export function RecommendationCard({ recommendation, number, selected = false, onSelect }: RecommendationCardProps) {
  const { placeId, name, category, description, estimatedCost, currencyCode, estimatedDurationMinutes, mapsUrl } =
    recommendation

  return (
    <article
      className={`recommendation-card${selected ? ' recommendation-card--selected' : ''}`}
      data-place-id={placeId}
    >
      <div className="recommendation-card__top">
        {number != null && (
          <button
            type="button"
            className="recommendation-card__number"
            aria-label={`Show ${name} on the map`}
            aria-pressed={selected}
            onClick={() => onSelect?.(placeId)}
          >
            {number}
          </button>
        )}
        <div className="recommendation-card__heading">
          <p className="recommendation-card__category">{formatCategory(category)}</p>
          <h3 className="recommendation-card__name">{name}</h3>
        </div>
      </div>

      <ul className="recommendation-card__facts">
        <li>
          <Clock size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            {estimatedDurationMinutes != null
              ? `About ${estimatedDurationMinutes} min`
              : 'Duration unavailable'}
          </span>
        </li>
        <li>
          <Wallet size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            {estimatedCost != null ? formatCost(estimatedCost, currencyCode) : 'Price unavailable'}
          </span>
        </li>
      </ul>

      {description && <p className="recommendation-card__description">{description}</p>}

      {isSafeMapsUrl(mapsUrl) && (
        <a
          className="btn btn--secondary recommendation-card__directions"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get directions to ${name} in Google Maps (opens in a new tab)`}
        >
          <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
          Get directions
        </a>
      )}
    </article>
  )
}
