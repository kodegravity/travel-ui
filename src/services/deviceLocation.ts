import type { LocationRequest } from '../types/api'

/**
 * The traveller's position for "Current Location" starts, shared by the trip pages. Memory only: a location is
 * sensitive, so it is never written to storage and is forgotten on reload.
 */
let current: LocationRequest | null = null

export function deviceLocation(): LocationRequest | null {
  return current
}

export function rememberDeviceLocation(location: LocationRequest | null) {
  current = location
}
