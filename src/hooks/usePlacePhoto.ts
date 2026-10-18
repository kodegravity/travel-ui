import { useEffect, useRef, useState } from 'react'
import { loadPlacePhoto } from '../services/placePhotos'
import type { PlacePhoto } from '../types/api'

/**
 * The card photo for a place, asked for only once the element is near the screen, so a long list of results
 * does not spend the daily photo allowance on cards nobody scrolls to.
 */
export function usePlacePhoto<T extends Element>(placeId: string) {
  const ref = useRef<T>(null)
  const [photo, setPhoto] = useState<{ placeId: string; photo: PlacePhoto } | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    let cancelled = false
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        void loadPlacePhoto(placeId).then((found) => {
          if (!cancelled && found) setPhoto({ placeId, photo: found })
        })
      },
      { rootMargin: '200px' },
    )
    observer.observe(element)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [placeId])

  return { ref, photo: photo?.placeId === placeId ? photo.photo : null }
}
