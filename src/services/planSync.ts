import { getItineraries, replaceItinerary, subscribeItineraries } from './itinerary'
import { getTravelPlan, saveTravelPlan, TravelApiError, type TravelPlan, type TravelPlanEntry } from './travelApi'
import { getTripState, replaceCityTrip, replaceFavorites, subscribeTripStore } from './tripStore'

/**
 * Keeps trips, favorites, and itineraries in step with the traveler's account, so they follow them across devices.
 * Browser storage stays the working copy and works offline; this module pulls the account copy, merges, and pushes.
 *
 * The plan is split into parts ("city:<id>" with that city's trip, settings, and itinerary, plus "favorites"). For
 * each part, whichever side changed it last wins. Saves name the version they were merged from, so if another
 * device saved in between, the save is refused (409) and the merge runs again.
 */

const META_KEY = 'roam.planSync.v1'
const FAVORITES = 'favorites'
const CITY = 'city:'
/** Matches the backend's key rule; other city IDs stay on this device. */
const SYNCABLE_CITY = /^[A-Za-z0-9_-]{1,64}$/
/** Changes made before sync existed, or while signed out, lose to any change saved to the account. */
const NEVER = '1970-01-01T00:00:00.000Z'
export const SYNC_DEBOUNCE_MS = 2000
const MAX_ATTEMPTS = 3

export interface SyncMeta {
  /** The account this device last synced with. */
  ownerRef: string | null
  version: number
  /** When each part last changed on this device. */
  changedAt: Record<string, string>
  /** Each part as last agreed with the account (JSON), to tell what changed here since. */
  synced: Record<string, string>
}

interface CityPart {
  trip: unknown[]
  settings: unknown
  itinerary: unknown
}

const EMPTY_META: SyncMeta = { ownerRef: null, version: 0, changedAt: {}, synced: {} }

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function loadMeta(): SyncMeta {
  try {
    const raw = window.localStorage.getItem(META_KEY)
    if (!raw) return EMPTY_META
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      ownerRef: typeof parsed.ownerRef === 'string' ? parsed.ownerRef : null,
      version: typeof parsed.version === 'number' ? parsed.version : 0,
      changedAt: parsed.changedAt ?? {},
      synced: parsed.synced ?? {},
    }
  } catch {
    return EMPTY_META
  }
}

function saveMeta() {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta))
  } catch {
    // Storage blocked: sync still works for this visit.
  }
}

/** Every part of the plan on this device. Cities with nothing in them are left out. */
export function localEntries(): Record<string, unknown> {
  const trips = getTripState()
  const itineraries = getItineraries()
  const entries: Record<string, unknown> = {}
  const cities = new Set([...Object.keys(trips.trips), ...Object.keys(trips.settings), ...Object.keys(itineraries)])
  for (const cityId of cities) {
    if (!SYNCABLE_CITY.test(cityId)) continue
    const part: CityPart = {
      trip: trips.trips[cityId] ?? [],
      settings: trips.settings[cityId] ?? null,
      itinerary: itineraries[cityId] ?? null,
    }
    if (part.trip.length === 0 && part.settings === null && part.itinerary === null) continue
    entries[CITY + cityId] = part
  }
  if (trips.favorites.length > 0) entries[FAVORITES] = trips.favorites
  return entries
}

export interface MergeResult {
  /** The merged plan, to save when upload is true. */
  entries: Record<string, TravelPlanEntry>
  /** Parts the account wins, to write to this device; null removes the part. */
  apply: Record<string, unknown>
  upload: boolean
}

/** Per part, the side that changed it last wins. A part unchanged here since the last sync always takes the account's. */
export function mergePlan(local: Record<string, unknown>, syncMeta: SyncMeta, remote: TravelPlan): MergeResult {
  const entries: Record<string, TravelPlanEntry> = {}
  const apply: Record<string, unknown> = {}
  let upload = false
  const keys = new Set([...Object.keys(local), ...Object.keys(remote.entries), ...Object.keys(syncMeta.synced)])
  for (const key of keys) {
    const localJson = json(local[key])
    const changedHere = localJson !== (syncMeta.synced[key] ?? 'null')
    const localAt = syncMeta.changedAt[key] ?? NEVER
    const theirs = remote.entries[key]
    if (theirs && !(changedHere && Date.parse(localAt) > Date.parse(theirs.updatedAt))) {
      entries[key] = theirs
      if (json(theirs.data) !== localJson) apply[key] = theirs.data ?? null
    } else if (local[key] !== undefined || theirs) {
      // Ours: newer than the account's, or something the account has never seen.
      entries[key] = { updatedAt: changedHere ? localAt : new Date().toISOString(), data: local[key] ?? null }
      if (!theirs || json(theirs.data) !== localJson) upload = true
    }
  }
  return { entries, apply, upload }
}

// --- Runtime ----------------------------------------------------------------------------------------------------

let meta: SyncMeta = loadMeta()
let lastSeen: Record<string, string> = {}
let active = false
let applying = false
let timer: number | undefined
let running: Promise<void> | null = null
let again = false

function jsonRecord(entries: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, json(value)]))
}

/** Stamps the parts that changed on this device, then schedules a sync. */
function onLocalChange() {
  const current = jsonRecord(localEntries())
  if (!applying) {
    const now = new Date().toISOString()
    for (const key of new Set([...Object.keys(current), ...Object.keys(lastSeen)])) {
      if ((current[key] ?? 'null') !== (lastSeen[key] ?? 'null')) meta.changedAt[key] = now
    }
    saveMeta()
  }
  lastSeen = current
  if (!applying && active) {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS)
  }
}

function applyPart(key: string, data: unknown) {
  if (key === FAVORITES) {
    replaceFavorites(data ?? [])
    return
  }
  const cityId = key.slice(CITY.length)
  const part = (data ?? {}) as Partial<CityPart>
  replaceCityTrip(cityId, part.trip ?? [], part.settings ?? null)
  replaceItinerary(cityId, part.itinerary ?? null)
}

function applyParts(parts: Record<string, unknown>) {
  applying = true
  try {
    Object.entries(parts).forEach(([key, data]) => applyPart(key, data))
  } finally {
    applying = false
  }
}

async function syncOnce() {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remote = await getTravelPlan()
    if (meta.ownerRef !== null && meta.ownerRef !== remote.ownerRef) {
      // A different account signed in on this browser: its plan replaces what is here, nothing is uploaded.
      const leftovers = Object.fromEntries(Object.keys(localEntries()).map((key) => [key, null]))
      applyParts(leftovers)
      meta = { ...EMPTY_META, changedAt: {}, synced: {} }
    }
    const { entries, apply, upload } = mergePlan(localEntries(), meta, remote)
    applyParts(apply)
    let saved = remote
    if (upload) {
      try {
        saved = await saveTravelPlan(remote.version, entries)
      } catch (error) {
        if (error instanceof TravelApiError && error.status === 409) continue
        throw error
      }
    }
    const keys = Object.keys(entries)
    meta = {
      ownerRef: saved.ownerRef,
      version: saved.version,
      changedAt: Object.fromEntries(keys.filter((key) => key in meta.changedAt).map((key) => [key, meta.changedAt[key]!])),
      synced: Object.fromEntries(keys.map((key) => [key, json(entries[key]!.data)])),
    }
    saveMeta()
    return
  }
}

/** Pulls, merges, and pushes now. Runs one at a time; a request during a run starts one more run after it. */
export function syncNow(): Promise<void> {
  if (!active) return Promise.resolve()
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await syncOnce()
      } while (again && active)
    } catch {
      // Offline, signed out, or the service is down: local work is kept and the next change or visit retries.
    } finally {
      running = null
    }
  })()
  return running
}

/** Starts syncing for the signed-in traveler; returns a function that stops it. */
export function startPlanSync(): () => void {
  active = true
  lastSeen = jsonRecord(localEntries())
  const unsubscribe = [subscribeTripStore(onLocalChange), subscribeItineraries(onLocalChange)]
  const onVisible = () => {
    if (!document.hidden) void syncNow()
  }
  const onOnline = () => void syncNow()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  void syncNow()
  return () => {
    active = false
    window.clearTimeout(timer)
    unsubscribe.forEach((stop) => stop())
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
  }
}

/** Test helper: forget sync state, in memory and in storage. */
export function resetPlanSync() {
  meta = { ...EMPTY_META, changedAt: {}, synced: {} }
  lastSeen = {}
  saveMeta()
}
