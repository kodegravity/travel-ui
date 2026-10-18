import { ChevronLeft, ChevronRight, Compass, Search } from 'lucide-react'
import { Button } from '../common/Button'
import { CardSkeletons } from '../common/CardSkeletons'
import { EmptyState } from '../common/EmptyState'
import type { NearbySearchState } from '../../hooks/useNearbySearch'
import { RecommendationCard } from './RecommendationCard'

export interface SearchResultsProps {
  state: NearbySearchState
  isBusy: boolean
  onPageChange: (page: number) => void
  selectedId: string | null
  onSelect: (placeId: string) => void
}

const PROGRESS: Partial<Record<NearbySearchState['status'], string>> = {
  LOCATING: 'Getting your location...',
  LOADING: 'Searching nearby places...',
}

/** Paged results of a one-off search, numbered to match the map pins. */
export function SearchResults({ state, isBusy, onPageChange, selectedId, onSelect }: SearchResultsProps) {
  const { status, result, errorMessage, locationLabel } = state
  if (status === 'IDLE') {
    return (
      <div className="card results-card">
        <EmptyState
          icon={Search}
          title="Search any place."
          description="Pick a city, coordinates, or your location, then press Search nearby."
        />
      </div>
    )
  }

  const progress = PROGRESS[status]
  const items = result?.recommendations ?? []
  const first = result && items.length > 0 ? result.page * result.size + 1 : 0
  const last = result ? result.page * result.size + items.length : 0
  const hasPrevious = Boolean(result && result.page > 0)
  const hasNext = Boolean(result && result.page + 1 < result.totalPages)

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
        </div>
      )}

      {result && result.totalElements > 0 && (
        <p className="search-summary" aria-live="polite">
          Showing {first}–{last} of {result.totalElements} places
          {locationLabel ? ` near ${locationLabel}` : ''}
        </p>
      )}

      {isBusy && items.length === 0 && <CardSkeletons />}

      {items.length > 0 && (
        <ul
          className={`recommendation-list${isBusy ? ' recommendation-list--stale' : ''}`}
          aria-label="Search results"
          aria-busy={isBusy}
        >
          {items.map((recommendation, index) => (
            <li key={recommendation.placeId}>
              <RecommendationCard
                recommendation={recommendation}
                number={(result ? result.page * result.size : 0) + index + 1}
                selected={recommendation.placeId === selectedId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}

      {result && result.totalElements === 0 && !isBusy && (
        <EmptyState
          icon={Compass}
          title="No places matched here."
          description="Try more interests, more available time, or another location."
        />
      )}

      {result && result.totalPages > 1 && (
        <nav className="pagination" aria-label="Search results pages">
          <Button
            variant="secondary"
            onClick={() => onPageChange(result.page - 1)}
            disabled={!hasPrevious || isBusy}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </Button>
          <span className="pagination__status">
            Page {result.page + 1} of {result.totalPages}
          </span>
          <Button variant="secondary" onClick={() => onPageChange(result.page + 1)} disabled={!hasNext || isBusy}>
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  )
}
