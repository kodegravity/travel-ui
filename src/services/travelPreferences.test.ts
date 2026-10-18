import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRAVEL_PREFERENCES_DRAFT,
  toTravelerPreferences,
  validateTravelPreferences,
} from './travelPreferences'
import type { TravelPreferencesDraft } from '../types/travel'

const validDraft: TravelPreferencesDraft = {
  ...DEFAULT_TRAVEL_PREFERENCES_DRAFT,
  interests: ['FOOD'],
  maxBudget: '40',
}

describe('validateTravelPreferences', () => {
  it('requires at least one interest', () => {
    expect(validateTravelPreferences({ ...validDraft, interests: [] })).toEqual({
      interests: 'Select at least one interest.',
    })
  })

  it('rejects negative budgets', () => {
    expect(validateTravelPreferences({ ...validDraft, maxBudget: '-5' })).toEqual({
      maxBudget: 'Budget cannot be negative.',
    })
  })

  it('rejects empty and non-numeric budgets', () => {
    expect(validateTravelPreferences({ ...validDraft, maxBudget: '  ' }).maxBudget).toBe(
      'Enter a maximum budget.',
    )
    expect(validateTravelPreferences({ ...validDraft, maxBudget: 'abc' }).maxBudget).toBe(
      'Enter a valid budget amount.',
    )
  })

  it('accepts a zero budget', () => {
    expect(validateTravelPreferences({ ...validDraft, maxBudget: '0' })).toEqual({})
  })

  it('ignores the custom time input unless custom is selected', () => {
    expect(
      validateTravelPreferences({ ...validDraft, timeChoice: 90, customTimeMinutes: '5' }),
    ).toEqual({})
  })

  it.each(['', '5', '14', '721', '12.5', '-20', '45m'])(
    'rejects custom time "%s"',
    (customTimeMinutes) => {
      expect(
        validateTravelPreferences({ ...validDraft, timeChoice: 'custom', customTimeMinutes })
          .availableTime,
      ).toBe('Enter a whole number of minutes from 15 to 720.')
    },
  )

  it.each(['15', '45', '720'])('accepts custom time "%s"', (customTimeMinutes) => {
    expect(
      validateTravelPreferences({ ...validDraft, timeChoice: 'custom', customTimeMinutes }),
    ).toEqual({})
  })
})

describe('toTravelerPreferences', () => {
  it('returns typed preferences for a valid draft', () => {
    expect(
      toTravelerPreferences({
        ...validDraft,
        interests: ['FOOD', 'ART'],
        maxBudget: '25.5',
        currency: 'GBP',
        timeChoice: 'custom',
        customTimeMinutes: '45',
      }),
    ).toEqual({
      interests: ['FOOD', 'ART'],
      maxBudget: 25.5,
      currency: 'GBP',
      availableTimeMinutes: 45,
    })
  })

  it('returns null for an invalid draft', () => {
    expect(toTravelerPreferences({ ...validDraft, maxBudget: '-1' })).toBeNull()
  })
})
