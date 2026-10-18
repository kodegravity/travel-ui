import type { LocationRequest } from '../types/api'

/** Where a one-off search is centred. */
export type SearchLocationMode = 'current' | 'city' | 'coordinates'

export interface CityPreset {
  id: string
  label: string
  location: LocationRequest
}

/** City centres for trying the app without travelling. */
export const CITY_PRESETS: readonly CityPreset[] = [
  { id: 'rome', label: 'Rome', location: { latitude: 41.9028, longitude: 12.4964 } },
  { id: 'paris', label: 'Paris', location: { latitude: 48.8566, longitude: 2.3522 } },
  { id: 'london', label: 'London', location: { latitude: 51.5074, longitude: -0.1278 } },
  { id: 'new-york', label: 'New York', location: { latitude: 40.758, longitude: -73.9855 } },
  { id: 'toronto', label: 'Toronto', location: { latitude: 43.6532, longitude: -79.3832 } },
  { id: 'tokyo', label: 'Tokyo', location: { latitude: 35.6812, longitude: 139.7671 } },
]

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
