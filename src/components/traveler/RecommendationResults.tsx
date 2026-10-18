import { Compass } from 'lucide-react'
import { Button } from '../common/Button'
import { CardSkeletons } from '../common/CardSkeletons'
import { EmptyState } from '../common/EmptyState'
import type { TravelSessionPhase, TravelSessionState } from '../../hooks/useTravelSession'
import { RecommendationCard } from './RecommendationCard'

export interface RecommendationResultsProps {
  state: TravelSessionState
  isBusy: boolean
  canRefresh: boolean
  onRefresh: () => void
  selectedId?: string | null
  onSelect?: (placeId: string) => void
}

const PROGRESS_MESSAGES: Partial<Record<TravelSessionPhase, string>> = {
  REQUESTING_LOCATION: 'Getting your location...',
  STARTING_SESSION: 'Starting your travel session...',
  LOADING_RECOMMENDATIONS: 'Discovering nearby experiences...',
  STOPPING_SESSION: 'Stopping your travel session...',
}

export function RecommendationResults({
  state,
  isBusy,
  canRefresh,
  onRefresh,
  selectedId = null,
  onSelect,
}: RecommendationResultsProps) {
  const { phase, sessionId, recommendations, notice, errorMessage, failedAction } = state
  const progress = isBusy ? PROGRESS_MESSAGES[phase] : undefined
  const hasCards = recommendations.length > 0
  const showIdleEmpty = !hasCards && !isBusy && (phase === 'IDLE' || (phase === 'ERROR' && !sessionId))

  return (
    <div className="card results-card">
      {progress && (
        <p className="results-progress" role="status">
          <span className="results-progress__dot" aria-hidden="true" />
          {progress}
        </p>
      )}

      {errorMessage && (
        <div className="alert alert--error" role="alert">
          <p>{errorMessage}</p>
          {failedAction === 'refresh' && canRefresh && (
            <Button variant="secondary" onClick={onRefresh}>
              Try again
            </Button>
          )}
        </div>
      )}

      {notice && !errorMessage && (
        <p className="alert alert--info" role="status">
          {notice}
        </p>
      )}

      {!hasCards && isBusy && phase !== 'STOPPING_SESSION' && <CardSkeletons />}

      {hasCards && (
        <ul className="recommendation-list" aria-label="Nearby recommendations">
          {recommendations.map((recommendation, index) => (
            <li key={recommendation.placeId}>
              <RecommendationCard
                recommendation={recommendation}
                number={onSelect ? index + 1 : undefined}
                selected={recommendation.placeId === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}

      {!hasCards && phase === 'EMPTY_RESULTS' && (
        <EmptyState
          icon={Compass}
          title="No new places found nearby."
          description="Try again after you've moved to a new area, or check back later."
        />
      )}

      {showIdleEmpty && (
        <EmptyState
          icon={Compass}
          title="Your next adventure starts here."
          description="Choose your interests and start exploring to discover nearby experiences."
        />
      )}

      {sessionId !== null && phase !== 'ERROR' && (
        <div className="results-actions">
          <Button variant="secondary" onClick={onRefresh} disabled={!canRefresh}>
            Check for new places
          </Button>
        </div>
      )}
    </div>
  )
}
