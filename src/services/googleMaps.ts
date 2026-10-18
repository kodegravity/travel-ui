const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
const CALLBACK = '__roamGoogleMapsReady'

export const GOOGLE_MAPS_CONFIGURED = API_KEY.trim() !== ''
export const GOOGLE_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

declare global {
  interface Window {
    [CALLBACK]?: () => void
    gm_authFailure?: () => void
  }
}

let loading: Promise<typeof google.maps> | null = null
let authFailed = false
const authListeners = new Set<() => void>()

/** Google calls this when the key is rejected (wrong referrer, API not enabled, billing off). */
function onAuthFailure() {
  authFailed = true
  authListeners.forEach((listener) => listener())
}

export function googleMapsAuthFailed() {
  return authFailed
}

export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authListeners.add(listener)
  return () => authListeners.delete(listener)
}

/** Loads the Maps JavaScript API once per page, with the marker and geometry libraries. */
export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (!GOOGLE_MAPS_CONFIGURED) return Promise.reject(new Error('Google Maps is not configured'))
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  loading ??= new Promise((resolve, reject) => {
    window[CALLBACK] = () => resolve(window.google.maps)
    window.gm_authFailure = onAuthFailure
    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: API_KEY,
      v: 'weekly',
      loading: 'async',
      libraries: 'marker,geometry',
      callback: CALLBACK,
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google Maps could not be loaded'))
    }
    document.head.appendChild(script)
  })
  return loading
}
