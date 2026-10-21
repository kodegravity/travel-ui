import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getItineraries, resetItineraries, saveItinerary, type Itinerary } from './itinerary'
import { localEntries, mergePlan, resetPlanSync, startPlanSync, SYNC_DEBOUNCE_MS, syncNow, type SyncMeta } from './planSync'
import type { TravelPlan } from './travelApi'
import { getTripState, resetTripStore, toggleTripPlace, type SavedPlace } from './tripStore'

const prado: SavedPlace = {
  placeId: 'prado', cityId: 'madrid', name: 'Prado', category: 'ART', latitude: 40.41, longitude: -3.69,
}
const retiro: SavedPlace = { ...prado, placeId: 'retiro', name: 'Retiro' }
const itinerary: Itinerary = {
  cityId: 'madrid', startDate: '2026-11-02', travelers: 2, mode: 'walk',
  start: { latitude: 40.4168, longitude: -3.7038 }, startName: 'Madrid centre', source: 'estimate',
  savedAt: '2026-10-20T10:00:00.000Z', days: [{ startMinutes: 540, stops: [] }],
}
const OWNER = 'a'.repeat(64)

function plan(version: number, entries: TravelPlan['entries'] = {}, ownerRef = OWNER): TravelPlan {
  return { ownerRef, version, entries }
}

function meta(partial: Partial<SyncMeta> = {}): SyncMeta {
  return { ownerRef: OWNER, version: 1, changedAt: {}, synced: {}, ...partial }
}

describe('mergePlan', () => {
  it('takes the account copy of a part unchanged here', () => {
    const remote = plan(2, { 'city:madrid': { updatedAt: '2026-10-20T10:00:00Z', data: { trip: [retiro] } } })
    const result = mergePlan({ 'city:madrid': { trip: [prado] } },
      meta({ synced: { 'city:madrid': JSON.stringify({ trip: [prado] }) } }), remote)

    expect(result.apply).toEqual({ 'city:madrid': { trip: [retiro] } })
    expect(result.upload).toBe(false)
  })

  it('keeps a newer change made here and uploads it', () => {
    const remote = plan(2, { 'city:madrid': { updatedAt: '2026-10-20T10:00:00Z', data: { trip: [retiro] } } })
    const result = mergePlan({ 'city:madrid': { trip: [prado] } },
      meta({ changedAt: { 'city:madrid': '2026-10-20T11:00:00.000Z' } }), remote)

    expect(result.apply).toEqual({})
    expect(result.upload).toBe(true)
    expect(result.entries['city:madrid']).toEqual({ updatedAt: '2026-10-20T11:00:00.000Z', data: { trip: [prado] } })
  })

  it('lets a newer change on the account beat an older one here', () => {
    const remote = plan(2, { 'city:madrid': { updatedAt: '2026-10-20T12:00:00Z', data: { trip: [retiro] } } })
    const result = mergePlan({ 'city:madrid': { trip: [prado] } },
      meta({ changedAt: { 'city:madrid': '2026-10-20T11:00:00.000Z' } }), remote)

    expect(result.apply).toEqual({ 'city:madrid': { trip: [retiro] } })
    expect(result.upload).toBe(false)
  })

  it('records a deletion made here so other devices remove the part too', () => {
    const remote = plan(2, { favorites: { updatedAt: '2026-10-20T10:00:00Z', data: [prado] } })
    const result = mergePlan({}, meta({
      synced: { favorites: JSON.stringify([prado]) },
      changedAt: { favorites: '2026-10-20T11:00:00.000Z' },
    }), remote)

    expect(result.entries.favorites).toEqual({ updatedAt: '2026-10-20T11:00:00.000Z', data: null })
    expect(result.upload).toBe(true)
  })
})

describe('plan sync', () => {
  let account: TravelPlan
  let puts: Array<{ baseVersion: number; entries: TravelPlan['entries'] }>
  let conflicts: number
  let stop: () => void = () => undefined

  beforeEach(() => {
    resetTripStore()
    resetItineraries()
    resetPlanSync()
    account = plan(0)
    puts = []
    conflicts = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      if (!String(url).endsWith('/api/v1/travel-plan')) return new Response(null, { status: 404 })
      if (init.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { baseVersion: number; entries: TravelPlan['entries'] }
        puts.push(body)
        if (conflicts > 0 || body.baseVersion !== account.version) {
          conflicts = Math.max(0, conflicts - 1)
          account = { ...account, version: account.version + 1 }
          return new Response(JSON.stringify({ title: 'Travel plan changed', status: 409 }), {
            status: 409, headers: { 'Content-Type': 'application/problem+json' },
          })
        }
        account = plan(account.version + 1, body.entries, account.ownerRef)
      }
      return new Response(JSON.stringify(account), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
  })

  afterEach(() => {
    stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uploads what is on this device when the account is empty', async () => {
    toggleTripPlace(prado)
    saveItinerary(itinerary)

    stop = startPlanSync()
    await syncNow()

    expect(puts).toHaveLength(1)
    expect(puts[0]!.baseVersion).toBe(0)
    expect(account.entries['city:madrid']?.data).toMatchObject({ trip: [prado], itinerary: { startDate: '2026-11-02' } })
  })

  it('brings trips and itineraries from the account onto this device', async () => {
    account = plan(3, {
      'city:madrid': { updatedAt: '2026-10-20T10:00:00Z', data: { trip: [prado], settings: null, itinerary } },
      favorites: { updatedAt: '2026-10-20T10:00:00Z', data: [retiro] },
    })

    stop = startPlanSync()
    await syncNow()

    expect(getTripState().trips.madrid).toEqual([prado])
    expect(getTripState().favorites).toEqual([retiro])
    expect(getItineraries().madrid?.startDate).toBe('2026-11-02')
    expect(puts).toHaveLength(0)
  })

  it('merges again and retries when another device saved first', async () => {
    toggleTripPlace(prado)
    conflicts = 1

    stop = startPlanSync()
    await syncNow()

    expect(puts).toHaveLength(2)
    expect(puts[1]!.baseVersion).toBe(1)
    expect(account.entries['city:madrid']).toBeDefined()
  })

  it('uploads a change made here shortly after it happens', async () => {
    vi.useFakeTimers()
    stop = startPlanSync()
    await vi.advanceTimersByTimeAsync(0)
    expect(puts).toHaveLength(0)

    toggleTripPlace(retiro)
    await vi.advanceTimersByTimeAsync(SYNC_DEBOUNCE_MS)

    expect(puts).toHaveLength(1)
    expect(account.entries['city:madrid']?.data).toMatchObject({ trip: [retiro] })
  })

  it("replaces another account's plan instead of uploading it", async () => {
    stop = startPlanSync()
    toggleTripPlace(prado)
    await syncNow()
    expect(localEntries()).toHaveProperty('city:madrid')
    stop()

    account = plan(5, { favorites: { updatedAt: '2026-10-20T10:00:00Z', data: [retiro] } }, 'b'.repeat(64))
    puts = []
    stop = startPlanSync()
    await syncNow()

    expect(getTripState().trips.madrid).toBeUndefined()
    expect(getTripState().favorites).toEqual([retiro])
    expect(puts).toHaveLength(0)
  })
})
