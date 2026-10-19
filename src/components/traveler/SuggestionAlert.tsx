import { X } from 'lucide-react'
import type { RecommendationDto } from '../../types/api'
import { formatCategory } from '../../services/recommendationFormat'

export interface SuggestionAlertProps {
  suggestion: RecommendationDto | null
  onDismiss: () => void
}

/** Non-blocking in-app notice for one new nearby suggestion. Rendered politely so screen readers announce it without interrupting. */
export function SuggestionAlert({ suggestion, onDismiss }: SuggestionAlertProps) {
  if (!suggestion) return null

  return (
    <div className="suggestion-alert" role="status" aria-live="polite">
      <div className="suggestion-alert__body">
        <p className="suggestion-alert__eyebrow">New nearby suggestion</p>
        <p className="suggestion-alert__title">{suggestion.name}</p>
        <p className="suggestion-alert__meta">{formatCategory(suggestion.category)}</p>
      </div>
      <button
        type="button"
        className="suggestion-alert__dismiss"
        onClick={onDismiss}
        aria-label="Dismiss suggestion"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
