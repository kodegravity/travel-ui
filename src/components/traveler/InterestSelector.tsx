import { Landmark, Palette, ShoppingBag, Trees, UtensilsCrossed, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Interest } from '../../types/travel'

interface InterestOption {
  value: Interest
  label: string
  Icon: LucideIcon
}

const INTEREST_OPTIONS: InterestOption[] = [
  { value: 'HISTORY', label: 'History', Icon: Landmark },
  { value: 'FOOD', label: 'Food', Icon: UtensilsCrossed },
  { value: 'ART', label: 'Art', Icon: Palette },
  { value: 'NATURE', label: 'Nature', Icon: Trees },
  { value: 'SHOPPING', label: 'Shopping', Icon: ShoppingBag },
  { value: 'LOCAL_EXPERIENCES', label: 'Local experiences', Icon: Users },
]

export interface InterestSelectorProps {
  selected: Interest[]
  onToggle: (interest: Interest) => void
  error?: string
}

export function InterestSelector({ selected, onToggle, error }: InterestSelectorProps) {
  const errorId = 'interests-error'

  return (
    <fieldset className="field-group" aria-describedby={error ? errorId : undefined}>
      <legend className="field-group__legend">Interests</legend>
      <p className="field-hint">Select all that apply.</p>
      <div className="choice-grid">
        {INTEREST_OPTIONS.map(({ value, label, Icon }) => (
          <label key={value} className="choice choice--interest">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
            />
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
