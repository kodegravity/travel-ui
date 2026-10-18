import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { LocationRequest } from '../../types/api'

export interface MapPlace {
  id: string
  name: string
  latitude: number
  longitude: number
  /** 1-based number shown on the pin and on the matching card. */
  number: number
}

export interface PlacesMapProps {
  places: MapPlace[]
  /** Search centre, shown as a dot. Null when unknown (for example Active Travel Mode). */
  center: LocationRequest | null
  selectedId: string | null
  onSelect: (id: string) => void
  /** False while the map is hidden (mobile list view); it re-measures itself when shown again. */
  visible: boolean
}

const FALLBACK_CENTER: [number, number] = [41.9028, 12.4964]
const SINGLE_POINT_ZOOM = 15

function pinIcon(number: number, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: 'map-pin-anchor',
    html: `<span class="map-pin${selected ? ' map-pin--selected' : ''}"><span>${number}</span></span>`,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
  })
}

const centerIcon = L.divIcon({
  className: 'map-pin-anchor',
  html: '<span class="map-center" aria-hidden="true"></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

/** Fits the view to the pins whenever the set of places or the centre changes. */
function FitToPlaces({ places, center }: { places: MapPlace[]; center: LocationRequest | null }) {
  const map = useMap()
  const key = places.map((p) => p.id).join('|') + (center ? `@${center.latitude},${center.longitude}` : '')
  useEffect(() => {
    // A running pan or zoom animation would swallow the new view.
    map.stop()
    if (places.length === 0) {
      // Results still loading: show the search centre now, fit the pins when they arrive.
      if (center) map.setView([center.latitude, center.longitude], SINGLE_POINT_ZOOM - 1, { animate: false })
      return
    }
    const points: [number, number][] = places.map((p) => [p.latitude, p.longitude])
    if (center) points.push([center.latitude, center.longitude])
    if (points.length === 1) {
      map.setView(points[0]!, SINGLE_POINT_ZOOM, { animate: false })
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16, animate: false })
    }
    // The key captures every input that should trigger a refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

function PanToSelected({ place }: { place: MapPlace | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (place) map.panTo([place.latitude, place.longitude], { animate: true })
  }, [map, place])
  return null
}

function ResizeWhenShown({ visible }: { visible: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (visible) map.invalidateSize()
  }, [map, visible])
  return null
}

/** OpenStreetMap map with numbered pins. Loaded lazily so the first screen does not wait for Leaflet. */
export default function PlacesMap({ places, center, selectedId, onSelect, visible }: PlacesMapProps) {
  const selected = useMemo(() => places.find((p) => p.id === selectedId), [places, selectedId])
  const initialCenter: [number, number] = center
    ? [center.latitude, center.longitude]
    : places[0]
      ? [places[0].latitude, places[0].longitude]
      : FALLBACK_CENTER

  return (
    <MapContainer className="places-map" center={initialCenter} zoom={13} scrollWheelZoom zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {center && (
        <Marker position={[center.latitude, center.longitude]} icon={centerIcon} title="Search centre" keyboard={false} />
      )}
      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.latitude, place.longitude]}
          icon={pinIcon(place.number, place.id === selectedId)}
          title={`${place.number}. ${place.name}`}
          alt={`${place.number}. ${place.name}`}
          zIndexOffset={place.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(place.id) }}
        />
      ))}
      <FitToPlaces places={places} center={center} />
      <PanToSelected place={selected} />
      <ResizeWhenShown visible={visible} />
    </MapContainer>
  )
}
