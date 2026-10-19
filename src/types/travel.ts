export const INTERESTS = [
  'HISTORY',
  'FOOD',
  'ART',
  'NATURE',
  'SHOPPING',
  'LOCAL_EXPERIENCES',
] as const

export type Interest = (typeof INTERESTS)[number]

export const CURRENCIES = ['EUR', 'USD', 'CAD', 'GBP', 'JPY', 'INR'] as const

export type Currency = (typeof CURRENCIES)[number]

export const PRESET_TIME_OPTIONS_MINUTES = [30, 60, 90, 120, 180] as const

export type PresetTimeMinutes = (typeof PRESET_TIME_OPTIONS_MINUTES)[number]

export const MIN_CUSTOM_TIME_MINUTES = 15
export const MAX_CUSTOM_TIME_MINUTES = 720

/** Validated preferences, aligned with the traveler request fields. */
export interface TravelerPreferences {
  interests: Interest[]
  maxBudget: number
  currency: Currency
  availableTimeMinutes: number
}

/** Raw form state. Numeric inputs stay as strings until validated. */
export type TimeChoice = PresetTimeMinutes | 'custom'

export interface TravelPreferencesDraft {
  interests: Interest[]
  maxBudget: string
  currency: Currency
  timeChoice: TimeChoice
  customTimeMinutes: string
}

export type TravelPreferencesField = 'interests' | 'maxBudget' | 'availableTime'

export type TravelPreferencesErrors = Partial<Record<TravelPreferencesField, string>>
