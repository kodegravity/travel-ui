import { describe, expect, it } from 'vitest'
import { ALL_CITIES, findCity, findCountry } from './destinations'

describe('destinations', () => {
  it('includes the Indian cities, priced in rupees', () => {
    expect(findCountry('India')?.currency).toBe('INR')
    for (const id of ['new-delhi', 'chandigarh', 'mohali', 'jammu']) {
      expect(findCity(id)).toMatchObject({ country: 'India', ianaTimeZone: 'Asia/Kolkata' })
    }
  })

  it('gives every city a real IANA time zone and a unique id', () => {
    for (const city of ALL_CITIES) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: city.ianaTimeZone })).not.toThrow()
    }
    expect(new Set(ALL_CITIES.map((city) => city.id)).size).toBe(ALL_CITIES.length)
    expect(findCity('new-york')?.ianaTimeZone).toBe('America/New_York')
  })
})
