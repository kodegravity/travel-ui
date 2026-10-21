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

export type TravelMode = 'walk' | 'transit' | 'drive'
export type StartPoint = 'center' | 'current'

/** How the traveler wants to get around a city; used by the Trip Builder's estimate and later the optimizer. */
export interface TripSettings {
  mode: TravelMode
  start: StartPoint
}

export const DEFAULT_TRIP_SETTINGS: TripSettings = { mode: 'walk', start: 'center' }

export interface TripState {
  /** One trip per city, in the traveler's chosen visiting order. */
  trips: Record<string, SavedPlace[]>
  favorites: SavedPlace[]
  settings: Record<string, TripSettings>
}

const STORAGE_KEY = 'roam.trip.v1'
const EMPTY: TripState = { trips: {}, favorites: [], settings: {} }

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

function isTripSettings(value: unknown): value is TripSettings {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return ['walk', 'transit', 'drive'].includes(v.mode as string) && ['center', 'current'].includes(v.start as string)
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
    const settings: Record<string, TripSettings> = {}
    for (const [cityId, value] of Object.entries(parsed.settings ?? {})) {
      if (isTripSettings(value)) settings[cityId] = value
    }
    return { trips, favorites, settings }
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

/** Replaces a city's whole trip, for Clear and Undo. */
export function setTripPlaces(cityId: string, places: readonly SavedPlace[]) {
  commit({ ...state, trips: { ...state.trips, [cityId]: [...places] } })
}

/** Moves one stop to a new position in the visiting order. Out-of-range moves are ignored. */
export function moveTripPlace(cityId: string, from: number, to: number) {
  const current = [...(state.trips[cityId] ?? [])]
  if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return
  const [moved] = current.splice(from, 1)
  current.splice(to, 0, moved!)
  commit({ ...state, trips: { ...state.trips, [cityId]: current } })
}

export function tripSettings(cityId: string, current: TripState = state): TripSettings {
  return current.settings[cityId] ?? DEFAULT_TRIP_SETTINGS
}

export function updateTripSettings(cityId: string, change: Partial<TripSettings>) {
  commit({ ...state, settings: { ...state.settings, [cityId]: { ...tripSettings(cityId), ...change } } })
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

// --- Sync ---------------------------------------------------------------------------------------------------------

/** The current state, for sync. */
export function getTripState(): TripState {
  return state
}

export function subscribeTripStore(listener: () => void): () => void {
  return subscribe(listener)
}

/** Replaces a city's trip and settings with a synced copy. Malformed places and settings are dropped. */
export function replaceCityTrip(cityId: string, places: unknown, settings: unknown) {
  const trips = { ...state.trips }
  const valid = Array.isArray(places) ? places.filter(isSavedPlace) : []
  if (valid.length > 0) trips[cityId] = valid
  else delete trips[cityId]
  const nextSettings = { ...state.settings }
  if (isTripSettings(settings)) nextSettings[cityId] = settings
  else delete nextSettings[cityId]
  commit({ ...state, trips, settings: nextSettings })
}

/** Replaces the favorites with a synced copy. */
export function replaceFavorites(places: unknown) {
  commit({ ...state, favorites: Array.isArray(places) ? places.filter(isSavedPlace) : [] })
}

/** Test helper: forget everything, in memory and in storage. */
export function resetTripStore() {
  commit(EMPTY)
}
