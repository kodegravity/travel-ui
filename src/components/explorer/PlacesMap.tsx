import { useEffect, useRef, useState } from 'react'
import {
  GOOGLE_MAP_ID,
  GOOGLE_MAPS_CONFIGURED,
  googleMapsAuthFailed,
  loadGoogleMaps,
  onGoogleMapsAuthFailure,
} from '../../services/googleMaps'
import type { LocationRequest } from '../../types/api'

export interface MapPlace {
  id: string
  name: string
  latitude: number
  longitude: number
  /** 1-based number shown on the pin and on the matching card. */
  number: number
}

/** A line through the stops: Google encoded polylines per leg when known, else straight lines between points. */
export interface MapRoute {
  encodedLegs?: (string | undefined)[]
  points: LocationRequest[]
}

export interface PlacesMapProps {
  places: MapPlace[]
  /** Search centre or start point, shown as a dot. Null when unknown (for example Active Travel Mode). */
  center: LocationRequest | null
  selectedId: string | null
  onSelect: (id: string) => void
  /** False while the map is hidden (mobile list view); it refits when shown again. */
  visible: boolean
  route?: MapRoute
}

const FALLBACK_CENTER = { lat: 41.9028, lng: 12.4964 }
const SINGLE_POINT_ZOOM = 15
const ROUTE_COLOR = '#2563EB'

function pinElement(number: number, selected: boolean): HTMLElement {
  const pin = document.createElement('span')
  pin.className = `map-pin${selected ? ' map-pin--selected' : ''}`
  const label = document.createElement('span')
  label.textContent = String(number)
  pin.appendChild(label)
  return pin
}

function centerElement(): HTMLElement {
  const dot = document.createElement('span')
  dot.className = 'map-center'
  return dot
}

const latLng = (p: LocationRequest) => ({ lat: p.latitude, lng: p.longitude })

/** The route as one path: decoded street legs where Google gave them, straight segments elsewhere. */
function routePath(maps: typeof google.maps, route: MapRoute): { path: google.maps.LatLngLiteral[]; estimated: boolean } {
  const path: google.maps.LatLngLiteral[] = []
  let estimated = false
  for (let i = 1; i < route.points.length; i++) {
    const encoded = route.encodedLegs?.[i - 1]
    if (encoded) {
      path.push(...maps.geometry.encoding.decodePath(encoded).map((p) => p.toJSON()))
    } else {
      estimated = true
      path.push(latLng(route.points[i - 1]!), latLng(route.points[i]!))
    }
  }
  return { path, estimated }
}

type Status = 'loading' | 'ready' | 'unconfigured' | 'failed'

/** Google map with numbered pins, an optional route line, and a start dot. Loaded lazily. */
export default function PlacesMap({ places, center, selectedId, onSelect, visible, route }: PlacesMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const overlays = useRef<{ markers: google.maps.marker.AdvancedMarkerElement[]; line: google.maps.Polyline | null }>({
    markers: [],
    line: null,
  })
  const onSelectRef = useRef(onSelect)
  const [status, setStatus] = useState<Status>(() =>
    !GOOGLE_MAPS_CONFIGURED ? 'unconfigured' : googleMapsAuthFailed() ? 'failed' : 'loading',
  )

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Create the map once.
  useEffect(() => {
    if (!GOOGLE_MAPS_CONFIGURED) return
    let cancelled = false
    const unsubscribe = onGoogleMapsAuthFailure(() => setStatus('failed'))
    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !container.current || mapRef.current) return
        mapRef.current = new maps.Map(container.current, {
          center: center ? latLng(center) : places[0] ? latLng(places[0]) : FALLBACK_CENTER,
          zoom: 13,
          mapId: GOOGLE_MAP_ID,
          clickableIcons: false,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        })
        setStatus(googleMapsAuthFailed() ? 'failed' : 'ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
      unsubscribe()
    }
    // The initial centre only matters once; later changes are handled by the overlay effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw pins, the start dot, and the route; fit the view to them.
  const placesKey = places.map((p) => `${p.id}:${p.number}`).join('|')
  const centerKey = center ? `${center.latitude},${center.longitude}` : ''
  const routeKey = route
    ? `${route.points.map((p) => `${p.latitude},${p.longitude}`).join('|')}#${route.encodedLegs?.join('|') ?? ''}`
    : ''
  useEffect(() => {
    const map = mapRef.current
    if (status !== 'ready' || !map) return
    const maps = window.google.maps
    const current = overlays.current
    current.markers.forEach((marker) => (marker.map = null))
    current.line?.setMap(null)
    current.markers = []
    current.line = null

    const bounds = new maps.LatLngBounds()
    if (center) {
      current.markers.push(
        new maps.marker.AdvancedMarkerElement({ map, position: latLng(center), content: centerElement(), title: 'Start' }),
      )
      bounds.extend(latLng(center))
    }
    for (const place of places) {
      const marker = new maps.marker.AdvancedMarkerElement({
        map,
        position: latLng(place),
        content: pinElement(place.number, place.id === selectedId),
        title: `${place.number}. ${place.name}`,
        zIndex: place.id === selectedId ? 1000 : place.number,
        gmpClickable: true,
      })
      marker.addEventListener('gmp-click', () => onSelectRef.current(place.id))
      current.markers.push(marker)
      bounds.extend(latLng(place))
    }
    if (route && route.points.length > 1) {
      const { path, estimated } = routePath(maps, route)
      current.line = new maps.Polyline({
        map,
        path,
        strokeColor: ROUTE_COLOR,
        strokeOpacity: estimated ? 0 : 0.9,
        strokeWeight: 5,
        // Straight-line estimates are dashed so they do not pass for streets.
        icons: estimated
          ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: ROUTE_COLOR, scale: 3 }, offset: '0', repeat: '14px' }]
          : undefined,
      })
      path.forEach((point) => bounds.extend(point))
    }

    const count = places.length + (center ? 1 : 0)
    if (count === 1) {
      map.setCenter(bounds.getCenter())
      map.setZoom(SINGLE_POINT_ZOOM)
    } else if (count > 1) {
      map.fitBounds(bounds, 48)
    }
    // The keys capture every input that should redraw; selection is drawn here too so the pin restyles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, placesKey, centerKey, routeKey, selectedId, visible])

  // Bring the selected pin into view.
  useEffect(() => {
    const place = places.find((p) => p.id === selectedId)
    if (status === 'ready' && place) mapRef.current?.panTo(latLng(place))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, selectedId])

  if (status === 'unconfigured' || status === 'failed') {
    return (
      <div className="places-map places-map--loading" role="note">
        <span className="places-map__note">
          {status === 'unconfigured'
            ? 'Map not configured. Add VITE_GOOGLE_MAPS_API_KEY to show Google Maps.'
            : 'Google Maps could not load. Check the browser key and its allowed websites.'}
        </span>
      </div>
    )
  }

  // Google owns everything inside the map element, so React must not render children there.
  return (
    <div className="places-map places-map--google" aria-label="Map">
      <div className="places-map__canvas" ref={container} />
      {status === 'loading' && <span className="places-map__note places-map__note--overlay">Loading map…</span>}
    </div>
  )
}
