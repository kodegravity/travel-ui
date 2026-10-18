import { useSyncExternalStore } from 'react'
import type { RecommendationDto } from '../types/api'

/** A place the traveler picked, with just enough to list it again without a new search. */
export interface SavedPlace {
  placeId: string
  cityId: string
  name: string
  category: string
  latitude: number
  longitude: number
  estimatedDurationMinutes?: number
  mapsUrl?: string
}

interface TripState {
  /** One trip per city, in the order places were added. */
  trips: Record<string, SavedPlace[]>
  favorites: SavedPlace[]
}

const STORAGE_KEY = 'roam.trip.v1'
const EMPTY: TripState = { trips: {}, favorites: [] }

function isSavedPlace(value: unknown): value is SavedPlace {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.placeId === 'string' &&
    typeof v.cityId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.category === 'string' &&
    typeof v.latitude === 'number' &&
    typeof v.longitude === 'number'
  )
}

/** Reads saved state, dropping anything malformed. Storage can be unavailable (private mode), so it never throws. */
function load(): TripState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<TripState>
    const trips: Record<string, SavedPlace[]> = {}
    for (const [cityId, places] of Object.entries(parsed.trips ?? {})) {
      if (Array.isArray(places)) trips[cityId] = places.filter(isSavedPlace)
    }
    const favorites = Array.isArray(parsed.favorites) ? parsed.favorites.filter(isSavedPlace) : []
    return { trips, favorites }
  } catch {
    return EMPTY
  }
}

let state: TripState = load()
const listeners = new Set<() => void>()

function commit(next: TripState) {
  state = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage full or blocked: keep working in memory for this visit.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function toSavedPlace(cityId: string, place: RecommendationDto): SavedPlace {
  return {
    placeId: place.placeId,
    cityId,
    name: place.name,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    ...(place.estimatedDurationMinutes != null ? { estimatedDurationMinutes: place.estimatedDurationMinutes } : {}),
    ...(place.mapsUrl ? { mapsUrl: place.mapsUrl } : {}),
  }
}

export function toggleTripPlace(place: SavedPlace): boolean {
  const current = state.trips[place.cityId] ?? []
  const inTrip = current.some((p) => p.placeId === place.placeId)
  const next = inTrip ? current.filter((p) => p.placeId !== place.placeId) : [...current, place]
  commit({ ...state, trips: { ...state.trips, [place.cityId]: next } })
  return !inTrip
}

export function removeTripPlace(cityId: string, placeId: string) {
  const current = state.trips[cityId] ?? []
  commit({ ...state, trips: { ...state.trips, [cityId]: current.filter((p) => p.placeId !== placeId) } })
}

export function toggleFavorite(place: SavedPlace): boolean {
  const isFav = state.favorites.some((p) => p.placeId === place.placeId)
  const favorites = isFav ? state.favorites.filter((p) => p.placeId !== place.placeId) : [...state.favorites, place]
  commit({ ...state, favorites })
  return !isFav
}

/** Live trip and favorites; components re-render when either changes. */
export function useTripStore(): TripState {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY)
}

/** Total estimated visit time for places with a known duration. */
export function totalVisitMinutes(places: readonly SavedPlace[]): number {
  return places.reduce((sum, place) => sum + (place.estimatedDurationMinutes ?? 0), 0)
}

/** "2h 30m", "45 min". */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

/** Test helper: forget everything, in memory and in storage. */
export function resetTripStore() {
  commit(EMPTY)
}
