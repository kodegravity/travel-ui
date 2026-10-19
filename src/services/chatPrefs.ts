import { useSyncExternalStore } from 'react'
import { INTERESTS, type Interest } from '../types/travel'

/** What "Ask ROAM" knows about the traveler's plans, remembered on this device. */
export interface ChatPrefs {
  interests: Interest[]
  /** Spending limit in the city's currency; null when not set. */
  budget: number | null
  /** Hours available; null when not set. */
  hours: number | null
}

const STORAGE_KEY = 'roam.chatPrefs.v1'
const DEFAULTS: ChatPrefs = { interests: [], budget: null, hours: null }

function load(): ChatPrefs {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ChatPrefs> | null
    if (!parsed) return DEFAULTS
    return {
      interests: Array.isArray(parsed.interests) ? INTERESTS.filter((i) => parsed.interests!.includes(i)) : [],
      budget: typeof parsed.budget === 'number' && parsed.budget >= 0 ? parsed.budget : null,
      hours: typeof parsed.hours === 'number' && parsed.hours > 0 && parsed.hours <= 12 ? parsed.hours : null,
    }
  } catch {
    return DEFAULTS
  }
}

let prefs: ChatPrefs = load()
const listeners = new Set<() => void>()

export function updateChatPrefs(change: Partial<ChatPrefs>) {
  prefs = { ...prefs, ...change }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage blocked: keep the choice for this visit.
  }
  listeners.forEach((listener) => listener())
}

export function useChatPrefs(): ChatPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => prefs,
    () => DEFAULTS,
  )
}

/** Test helper. */
export function resetChatPrefs() {
  prefs = DEFAULTS
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  listeners.forEach((listener) => listener())
}

/** "2026-10-19T14:30" in a time zone, or in the device's own zone when none is given. */
export function localDateTime(now: Date, timeZone?: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
