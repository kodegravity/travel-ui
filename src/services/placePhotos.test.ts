import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadPlacePhoto, rememberPlacePhoto, resetPlacePhotos } from './placePhotos'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const PHOTO = { url: 'https://lh3.googleusercontent.com/p/x', attributions: [{ displayName: 'Luis' }] }

beforeEach(() => resetPlacePhotos())
afterEach(() => vi.unstubAllGlobals())

describe('placePhotos', () => {
  it('asks once per place, including when the place has no photo', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.includes('/a/') ? json(200, PHOTO) : json(404, { title: 'No photo' })))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadPlacePhoto('a')).toEqual(PHOTO)
    expect(await loadPlacePhoto('a')).toEqual(PHOTO)
    expect(await loadPlacePhoto('b')).toBeNull()
    expect(await loadPlacePhoto('b')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops asking for the rest of the session once the backend refuses', async () => {
    const fetchMock = vi.fn(async () => json(503, { title: 'Attraction provider unavailable' }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadPlacePhoto('a')).toBeNull()
    expect(await loadPlacePhoto('b')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reuses a photo the details page already has', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    rememberPlacePhoto('a', PHOTO)

    expect(await loadPlacePhoto('a')).toEqual(PHOTO)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
