import {
  CURRENCIES,
  MAX_CUSTOM_TIME_MINUTES,
  MIN_CUSTOM_TIME_MINUTES,
  PRESET_TIME_OPTIONS_MINUTES,
} from '../../types/travel'
import type { Currency, TimeChoice } from '../../types/travel'
import type { UseTravelPreferencesResult } from '../../hooks/useTravelPreferences'
import { Button } from '../common/Button'
import { InterestSelector } from './InterestSelector'

const TIME_ERROR_ID = 'available-time-error'
const BUDGET_ERROR_ID = 'max-budget-error'

/** Parses a radio value into a TimeChoice. Returns null for unknown values. */
function parseTimeChoice(value: string): TimeChoice | null {
  if (value === 'custom') return 'custom'
  const preset = PRESET_TIME_OPTIONS_MINUTES.find((minutes) => String(minutes) === value)
  return preset ?? null
}

function parseCurrency(value: string): Currency | null {
  return CURRENCIES.find((currency) => currency === value) ?? null
}

export interface TravelPreferencesFormProps {
  preferences: UseTravelPreferencesResult
}

export function TravelPreferencesForm({ preferences }: TravelPreferencesFormProps) {
  const {
    draft,
    visibleErrors,
    savedPreferences,
    updateDraft,
    toggleInterest,
    handleSubmit,
  } = preferences

  const isCustomTime = draft.timeChoice === 'custom'

  return (
    <section className="card preferences" aria-labelledby="preferences-title">
      <div className="card__header">
        <h2 id="preferences-title" className="card__title">
          Plan your experience
        </h2>
      </div>
      <p className="card__intro">Tell us what you enjoy, how long you have, and what you want to spend.</p>

      <form className="preferences-form" noValidate onSubmit={handleSubmit}>
        <InterestSelector
          selected={draft.interests}
          onToggle={toggleInterest}
          error={visibleErrors.interests}
        />

        <div className="form-row">
          <div className="field">
            <label htmlFor="max-budget" className="field__label">
              Maximum budget
            </label>
            <input
              id="max-budget"
              className="input"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="e.g. 50"
              value={draft.maxBudget}
              aria-invalid={visibleErrors.maxBudget ? true : undefined}
              aria-describedby={visibleErrors.maxBudget ? BUDGET_ERROR_ID : undefined}
              onChange={(event) => updateDraft('maxBudget', event.target.value, 'maxBudget')}
            />
            {visibleErrors.maxBudget && (
              <p id={BUDGET_ERROR_ID} className="field-error">
                {visibleErrors.maxBudget}
              </p>
            )}
          </div>

          <div className="field field--currency">
            <label htmlFor="currency" className="field__label">
              Currency
            </label>
            <select
              id="currency"
              className="input"
              value={draft.currency}
              onChange={(event) => {
                const currency = parseCurrency(event.target.value)
                if (currency) updateDraft('currency', currency)
              }}
            >
              {CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
        </div>

        <fieldset
          className="field-group"
          aria-describedby={visibleErrors.availableTime ? TIME_ERROR_ID : undefined}
        >
          <legend className="field-group__legend">Available time</legend>
          <div className="choice-grid choice-grid--time">
            {PRESET_TIME_OPTIONS_MINUTES.map((minutes) => (
              <label key={minutes} className="choice">
                <input
                  type="radio"
                  name="available-time"
                  value={minutes}
                  checked={draft.timeChoice === minutes}
                  onChange={(event) => {
                    const choice = parseTimeChoice(event.target.value)
                    if (choice !== null) updateDraft('timeChoice', choice)
                  }}
                />
                <span>{minutes} min</span>
              </label>
            ))}
            <label className="choice">
              <input
                type="radio"
                name="available-time"
                value="custom"
                checked={isCustomTime}
                onChange={() => updateDraft('timeChoice', 'custom')}
              />
              <span>Custom</span>
            </label>
          </div>

          {isCustomTime && (
            <div className="field field--custom-time">
              <label htmlFor="custom-time" className="field__label">
                Custom time (minutes)
              </label>
              <input
                id="custom-time"
                className="input"
                type="number"
                inputMode="numeric"
                min={MIN_CUSTOM_TIME_MINUTES}
                max={MAX_CUSTOM_TIME_MINUTES}
                step={1}
                placeholder={`${MIN_CUSTOM_TIME_MINUTES}–${MAX_CUSTOM_TIME_MINUTES}`}
                value={draft.customTimeMinutes}
                aria-invalid={visibleErrors.availableTime ? true : undefined}
                aria-describedby={visibleErrors.availableTime ? TIME_ERROR_ID : undefined}
                onChange={(event) =>
                  updateDraft('customTimeMinutes', event.target.value, 'availableTime')
                }
              />
            </div>
          )}

          {visibleErrors.availableTime && (
            <p id={TIME_ERROR_ID} className="field-error">
              {visibleErrors.availableTime}
            </p>
          )}
        </fieldset>

        <div className="form-actions">
          <Button type="submit">Save preferences</Button>
          {savedPreferences && (
            <p className="form-status" role="status">
              Preferences look good. Press Start Exploring when you're ready.
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
