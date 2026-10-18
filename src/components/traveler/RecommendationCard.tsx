import { Clock, ExternalLink, Wallet } from 'lucide-react'
import type { RecommendationDto } from '../../types/api'
import { formatCategory, formatCost, isSafeMapsUrl } from '../../services/recommendationFormat'

export interface RecommendationCardProps {
  recommendation: RecommendationDto
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const { name, category, description, estimatedCost, currencyCode, estimatedDurationMinutes, mapsUrl } =
    recommendation

  return (
    <article className="recommendation-card">
      <p className="recommendation-card__category">{formatCategory(category)}</p>
      <h3 className="recommendation-card__name">{name}</h3>
      {description && <p className="recommendation-card__description">{description}</p>}

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
