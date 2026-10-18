const KEY = 'roam.lastCity'

/** Remembers the city last explored so the navbar's Explore link can return to it. */
export function rememberExploredCity(cityId: string) {
  try {
    window.localStorage.setItem(KEY, cityId)
  } catch {
    // Storage unavailable: Explore falls back to the default city.
  }
}

export function lastExploredCity(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}
