import { useState } from 'react'
import type { FormEvent } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../common/Button'
import type { SearchTarget } from '../../hooks/useNearbySearch'
import {
  CITY_PRESETS,
  DEFAULT_CITY_ID,
  findCityPreset,
  parseCoordinates,
  type CoordinateErrors,
  type SearchLocationMode,
} from '../../services/searchLocations'
import { SEARCH_PAGE_SIZES, type SearchPageSize } from '../../types/api'

export interface NearbySearchCardProps {
  isBusy: boolean
  onSearch: (target: SearchTarget, size: SearchPageSize) => void
}

const MODES: { value: SearchLocationMode; label: string }[] = [
  { value: 'current', label: 'My location' },
  { value: 'city', label: 'A city' },
  { value: 'coordinates', label: 'Coordinates' },
]

export function NearbySearchCard({ isBusy, onSearch }: NearbySearchCardProps) {
  const [mode, setMode] = useState<SearchLocationMode>('city')
  const [cityId, setCityId] = useState(DEFAULT_CITY_ID)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [coordinateErrors, setCoordinateErrors] = useState<CoordinateErrors>({})
  const [size, setSize] = useState<SearchPageSize>(10)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'current') {
      onSearch({ kind: 'current' }, size)
      return
    }
    if (mode === 'city') {
      const city = findCityPreset(cityId)
      if (city) onSearch({ kind: 'fixed', location: city.location, label: city.label }, size)
      return
    }
    const parsed = parseCoordinates(latitude, longitude)
    if ('errors' in parsed) {
      setCoordinateErrors(parsed.errors)
      return
    }
    setCoordinateErrors({})
    const { location } = parsed
    onSearch({ kind: 'fixed', location, label: `${location.latitude}, ${location.longitude}` }, size)
  }

  return (
    <section className="card nearby-search" aria-labelledby="nearby-search-title">
      <div className="card__header">
        <span className="card__icon">
          <Search size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 id="nearby-search-title" className="card__title">
          Search nearby
        </h2>
      </div>
      <p className="card__intro">
        Find places that fit your preferences around any location, without starting Active Travel Mode.
      </p>

      <form className="nearby-search__form" onSubmit={handleSubmit} noValidate>
        <fieldset className="field-group">
          <legend className="field-group__legend">Search around</legend>
          <div className="segmented" role="radiogroup" aria-label="Search around">
            {MODES.map((option) => (
              <label key={option.value} className="segmented__option">
                <input
                  type="radio"
                  name="search-location-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === 'city' && (
          <div className="field">
            <label className="field__label" htmlFor="search-city">
              City
            </label>
            <select id="search-city" className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
              {CITY_PRESETS.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === 'coordinates' && (
          <div className="nearby-search__coordinates">
            <div className="field">
              <label className="field__label" htmlFor="search-latitude">
                Latitude
              </label>
              <input
                id="search-latitude"
                className="input"
                inputMode="decimal"
                placeholder="41.9028"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                aria-invalid={coordinateErrors.latitude ? 'true' : undefined}
                aria-describedby={coordinateErrors.latitude ? 'search-latitude-error' : undefined}
              />
              {coordinateErrors.latitude && (
                <p id="search-latitude-error" className="field-error">
                  {coordinateErrors.latitude}
                </p>
              )}
            </div>
            <div className="field">
              <label className="field__label" htmlFor="search-longitude">
                Longitude
              </label>
              <input
                id="search-longitude"
                className="input"
                inputMode="decimal"
                placeholder="12.4964"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                aria-invalid={coordinateErrors.longitude ? 'true' : undefined}
                aria-describedby={coordinateErrors.longitude ? 'search-longitude-error' : undefined}
              />
              {coordinateErrors.longitude && (
                <p id="search-longitude-error" className="field-error">
                  {coordinateErrors.longitude}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label className="field__label" htmlFor="search-page-size">
            Results per page
          </label>
          <select
            id="search-page-size"
            className="input"
            value={size}
            onChange={(e) => setSize(Number(e.target.value) as SearchPageSize)}
          >
            {SEARCH_PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <p className="field-hint">Each page is a fresh search, so larger pages mean fewer lookups.</p>
        </div>

        <Button type="submit" className="btn--block" disabled={isBusy}>
          {isBusy ? 'Searching...' : 'Search nearby'}
        </Button>
      </form>
    </section>
  )
}
