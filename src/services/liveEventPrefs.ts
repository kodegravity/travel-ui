import { useSyncExternalStore } from 'react'
import { EVENT_TYPES, type EventType } from '../types/api'

/** Kinds of live event the traveler wants alerts for, remembered on this device. Empty means alerts are off. */
const STORAGE_KEY = 'roam.liveEvents.v1'
export const DEFAULT_EVENT_TYPES: readonly EventType[] = ['SPORTS', 'MUSIC', 'ARTS', 'FAMILY']

function load(): EventType[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return [...DEFAULT_EVENT_TYPES]
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? EVENT_TYPES.filter((type) => parsed.includes(type)) : [...DEFAULT_EVENT_TYPES]
  } catch {
    return [...DEFAULT_EVENT_TYPES]
  }
}

let types: EventType[] = load()
const listeners = new Set<() => void>()

export function setLiveEventTypes(next: readonly EventType[]) {
  types = EVENT_TYPES.filter((type) => next.includes(type))
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
  } catch {
    // Storage blocked: keep the choice for this visit.
  }
  listeners.forEach((listener) => listener())
}

export function toggleLiveEventType(type: EventType) {
  setLiveEventTypes(types.includes(type) ? types.filter((t) => t !== type) : [...types, type])
}

export function useLiveEventTypes(): EventType[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => types,
    () => [...DEFAULT_EVENT_TYPES],
  )
}

/** Test helper. */
export function resetLiveEventTypes() {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  types = [...DEFAULT_EVENT_TYPES]
  listeners.forEach((listener) => listener())
}
