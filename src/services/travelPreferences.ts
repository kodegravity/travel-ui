import {
  MAX_CUSTOM_TIME_MINUTES,
  MIN_CUSTOM_TIME_MINUTES,
  type TravelPreferencesDraft,
  type TravelPreferencesErrors,
  type TravelerPreferences,
} from '../types/travel'

export const DEFAULT_TRAVEL_PREFERENCES_DRAFT: TravelPreferencesDraft = {
  interests: [],
  maxBudget: '',
  currency: 'EUR',
  timeChoice: 60,
  customTimeMinutes: '',
}

const INVALID_CUSTOM_TIME_MESSAGE = `Enter a whole number of minutes from ${MIN_CUSTOM_TIME_MINUTES} to ${MAX_CUSTOM_TIME_MINUTES}.`

/** Returns the parsed budget, or null if the input is not a non-negative number. */
function parseBudget(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** Returns the selected available time in minutes, or null if the custom input is invalid. */
function resolveAvailableTime(draft: TravelPreferencesDraft): number | null {
  if (draft.timeChoice !== 'custom') return draft.timeChoice

  const trimmed = draft.customTimeMinutes.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const minutes = Number(trimmed)
  return minutes >= MIN_CUSTOM_TIME_MINUTES && minutes <= MAX_CUSTOM_TIME_MINUTES
    ? minutes
    : null
}

export function validateTravelPreferences(
  draft: TravelPreferencesDraft,
): TravelPreferencesErrors {
  const errors: TravelPreferencesErrors = {}

  if (draft.interests.length === 0) {
    errors.interests = 'Select at least one interest.'
  }

  if (draft.maxBudget.trim() === '') {
    errors.maxBudget = 'Enter a maximum budget.'
  } else if (parseBudget(draft.maxBudget) === null) {
    errors.maxBudget =
      Number(draft.maxBudget) < 0
        ? 'Budget cannot be negative.'
        : 'Enter a valid budget amount.'
  }

  if (draft.timeChoice === 'custom' && resolveAvailableTime(draft) === null) {
    errors.availableTime = INVALID_CUSTOM_TIME_MESSAGE
  }

  return errors
}

/** Converts a draft into validated preferences. Returns null when the draft is invalid. */
export function toTravelerPreferences(
  draft: TravelPreferencesDraft,
): TravelerPreferences | null {
  if (Object.keys(validateTravelPreferences(draft)).length > 0) return null

  const maxBudget = parseBudget(draft.maxBudget)
  const availableTimeMinutes = resolveAvailableTime(draft)
  if (maxBudget === null || availableTimeMinutes === null) return null

  return {
    interests: [...draft.interests],
    maxBudget,
    currency: draft.currency,
    availableTimeMinutes,
  }
}
