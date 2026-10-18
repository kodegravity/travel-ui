import { getPlacePhoto, TravelApiError } from './travelApi'
import type { PlacePhoto } from '../types/api'

/**
 * Card photos, one lookup per place per page session. Every lookup can cost a Google photo call and the backend
 * allows only a few a day, so answers (including "no photo") are kept in memory, and once the backend refuses
 * (daily cap reached or Google down) no more are asked for until the page reloads.
 */
const photos = new Map<string, Promise<PlacePhoto | null>>()
let refused = false

export function loadPlacePhoto(placeId: string): Promise<PlacePhoto | null> {
  if (refused) return Promise.resolve(null)
  let photo = photos.get(placeId)
  if (!photo) {
    photo = getPlacePhoto(placeId).catch((error: unknown) => {
      if (error instanceof TravelApiError && error.status === 503) {
        refused = true
      } else if (!(error instanceof TravelApiError && error.status === 404)) {
        // Network blips and the like may be retried by a later card.
        photos.delete(placeId)
      }
      return null
    })
    photos.set(placeId, photo)
  }
  return photo
}

/** The details page already has the place's photo; cards reuse it instead of asking again. */
export function rememberPlacePhoto(placeId: string, photo: PlacePhoto) {
  photos.set(placeId, Promise.resolve(photo))
}

/** Test helper. */
export function resetPlacePhotos() {
  photos.clear()
  refused = false
}
