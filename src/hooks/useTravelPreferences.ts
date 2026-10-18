import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  Interest,
  TravelPreferencesDraft,
  TravelPreferencesErrors,
  TravelPreferencesField,
  TravelerPreferences,
} from '../types/travel'
import {
  DEFAULT_TRAVEL_PREFERENCES_DRAFT,
  toTravelerPreferences,
  validateTravelPreferences,
} from '../services/travelPreferences'

export interface UseTravelPreferencesResult {
  draft: TravelPreferencesDraft
  /** Errors for fields the user has touched or after a submit attempt. */
  visibleErrors: TravelPreferencesErrors
  savedPreferences: TravelerPreferences | null
  updateDraft: <K extends keyof TravelPreferencesDraft>(
    key: K,
    value: TravelPreferencesDraft[K],
    field?: TravelPreferencesField,
  ) => void
  toggleInterest: (interest: Interest) => void
  /** Shows all errors and returns validated preferences, or null when the draft is invalid. */
  validate: () => TravelerPreferences | null
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void
}

export function useTravelPreferences(): UseTravelPreferencesResult {
  const [draft, setDraft] = useState<TravelPreferencesDraft>(
    DEFAULT_TRAVEL_PREFERENCES_DRAFT,
  )
  const [touched, setTouched] = useState<Partial<Record<TravelPreferencesField, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [savedPreferences, setSavedPreferences] = useState<TravelerPreferences | null>(null)

  const allErrors = useMemo(() => validateTravelPreferences(draft), [draft])

  const visibleErrors = useMemo<TravelPreferencesErrors>(() => {
    const result: TravelPreferencesErrors = {}
    for (const field of Object.keys(allErrors) as TravelPreferencesField[]) {
      if (submitAttempted || touched[field]) {
        result[field] = allErrors[field]
      }
    }
    return result
  }, [allErrors, submitAttempted, touched])

  function updateDraft<K extends keyof TravelPreferencesDraft>(
    key: K,
    value: TravelPreferencesDraft[K],
    field?: TravelPreferencesField,
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setSavedPreferences(null)
    if (field) {
      setTouched((previous) => ({ ...previous, [field]: true }))
    }
  }

  function toggleInterest(interest: Interest) {
    const isSelected = draft.interests.includes(interest)
    const interests = isSelected
      ? draft.interests.filter((item) => item !== interest)
      : [...draft.interests, interest]
    updateDraft('interests', interests, 'interests')
  }

  function validate(): TravelerPreferences | null {
    setSubmitAttempted(true)
    const preferences = toTravelerPreferences(draft)
    setSavedPreferences(preferences)
    return preferences
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    validate()
  }

  return {
    draft,
    visibleErrors,
    savedPreferences,
    updateDraft,
    toggleInterest,
    validate,
    handleSubmit,
  }
}
