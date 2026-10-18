export interface BrowserCoordinates {
  latitude: number
  longitude: number
}

export type LocationErrorCode =
  | 'UNSUPPORTED'
  | 'INSECURE_CONTEXT'
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'INACCURATE'

export const MAX_LOCATION_ACCURACY_METERS = 250

function isUsablePosition(position: GeolocationPosition): boolean {
  const { latitude, longitude, accuracy } = position.coords
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180 &&
    (accuracy === undefined || (Number.isFinite(accuracy) && accuracy >= 0 &&
      accuracy <= MAX_LOCATION_ACCURACY_METERS))
}

/** Used only to suppress client-side GPS jitter; backend refresh eligibility stays authoritative. */
export function distanceBetweenLocations(a: BrowserCoordinates, b: BrowserCoordinates): number {
  const radians = Math.PI / 180
  const lat = Math.sin((b.latitude - a.latitude) * radians / 2)
  const lon = Math.sin((b.longitude - a.longitude) * radians / 2)
  const h = lat * lat + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * lon * lon
  return 6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Numeric codes from the Geolocation API, so mocks don't need the browser class. */
const GEOLOCATION_ERROR_CODE = {
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
} as const

export class LocationError extends Error {
  readonly code: LocationErrorCode

  constructor(code: LocationErrorCode) {
    super(describeLocationError(code))
    this.name = 'LocationError'
    this.code = code
  }
}

const POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15_000,
  maximumAge: 0,
}

export function describeLocationError(code: LocationErrorCode): string {
  switch (code) {
    case 'UNSUPPORTED':
      return "Your browser doesn't support location, so nearby discovery isn't available."
    case 'INSECURE_CONTEXT':
      return 'Location sharing requires a secure (HTTPS) connection.'
    case 'PERMISSION_DENIED':
      return 'Location permission was denied. Allow location access in your browser settings, then try again.'
    case 'POSITION_UNAVAILABLE':
      return "We couldn't determine your current location. Please try again."
    case 'TIMEOUT':
      return 'Finding your location took too long. Please try again.'
    case 'INACCURATE':
      return 'Your location is not accurate enough yet. Move to an open area and try again.'
  }
}

/** Requests the current position once. Continuous tracking uses watchLocation. */
export function getCurrentLocation(signal?: AbortSignal): Promise<BrowserCoordinates> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.reject(new LocationError('UNSUPPORTED'))
  }
  if (window.isSecureContext === false) {
    return Promise.reject(new LocationError('INSECURE_CONTEXT'))
  }

  return new Promise<BrowserCoordinates>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    navigator.geolocation.getCurrentPosition(
      (position) => {
        signal?.removeEventListener('abort', onAbort)
        if (!isUsablePosition(position)) {
          reject(new LocationError('INACCURATE'))
          return
        }
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        signal?.removeEventListener('abort', onAbort)
        reject(new LocationError(toLocationErrorCode(error.code)))
      },
      POSITION_OPTIONS,
    )
  })
}

function toLocationErrorCode(code: number): LocationErrorCode {
  switch (code) {
    case GEOLOCATION_ERROR_CODE.PERMISSION_DENIED:
      return 'PERMISSION_DENIED'
    case GEOLOCATION_ERROR_CODE.TIMEOUT:
      return 'TIMEOUT'
    default:
      return 'POSITION_UNAVAILABLE'
  }
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 30_000,
  maximumAge: 60_000,
}

/**
 * Keeps the latest position in memory while a travel session is active.
 * Returns a function that stops watching. Unsupported or insecure contexts report an error and watch nothing.
 */
export function watchLocation(
  onLocation: (coordinates: BrowserCoordinates) => void,
  onError: (error: LocationError) => void,
): () => void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onError(new LocationError('UNSUPPORTED'))
    return () => undefined
  }
  if (window.isSecureContext === false) {
    onError(new LocationError('INSECURE_CONTEXT'))
    return () => undefined
  }

  const geolocation = navigator.geolocation
  const watchId = geolocation.watchPosition(
    (position) => {
      if (!isUsablePosition(position)) {
        onError(new LocationError('INACCURATE'))
        return
      }
      onLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
    },
    (error) => {
      onError(new LocationError(toLocationErrorCode(error.code)))
    },
    WATCH_OPTIONS,
  )
  return () => geolocation.clearWatch(watchId)
}
