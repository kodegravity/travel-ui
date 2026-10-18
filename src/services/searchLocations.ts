import { ALL_CITIES } from '../data/destinations'
import type { LocationRequest } from '../types/api'

/** Where a one-off search is centred. */
export type SearchLocationMode = 'current' | 'city' | 'coordinates'

export interface CityPreset {
  id: string
  label: string
  country: string
  location: LocationRequest
}

/** Every catalogue city, so Home and the explorer offer the same places. */
export const CITY_PRESETS: readonly CityPreset[] = ALL_CITIES.map((city) => ({
  id: city.id,
  label: city.name,
  country: city.country,
  location: city.location,
}))

export const DEFAULT_CITY_ID = 'rome'

export function findCityPreset(id: string): CityPreset | undefined {
  return CITY_PRESETS.find((city) => city.id === id)
}

export interface CoordinateErrors {
  latitude?: string
  longitude?: string
}

function parseCoordinate(raw: string, limit: number): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null
}

/** Validates typed coordinates with the same ranges as the backend. */
export function parseCoordinates(
  latitude: string,
  longitude: string,
): { location: LocationRequest } | { errors: CoordinateErrors } {
  const lat = parseCoordinate(latitude, 90)
  const lon = parseCoordinate(longitude, 180)
  const errors: CoordinateErrors = {}
  if (lat === null) errors.latitude = 'Enter a latitude between -90 and 90.'
  if (lon === null) errors.longitude = 'Enter a longitude between -180 and 180.'
  if (lat === null || lon === null) return { errors }
  return { location: { latitude: lat, longitude: lon } }
}
