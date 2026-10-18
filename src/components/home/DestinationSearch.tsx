import { useState } from 'react'
import type { FormEvent } from 'react'
import { Globe, MapPin, Minus, Plus, Search } from 'lucide-react'
import { COUNTRIES, findCountry } from '../../data/destinations'
import { addDays, isoDate, MAX_TRAVELERS, MIN_TRAVELERS } from '../../services/tripDates'
import { Combobox } from './Combobox'

export interface DestinationSelection {
  country: string | null
  cityId: string | null
}

export interface TripRequest {
  country: string
  cityId: string
  arrive: string
  depart: string
  travelers: number
}

export interface DestinationSearchProps {
  selection: DestinationSelection
  onSelectionChange: (selection: DestinationSelection) => void
  onSubmit: (trip: TripRequest) => void
}

export function DestinationSearch({ selection, onSelectionChange, onSubmit }: DestinationSearchProps) {
  const [arrive, setArrive] = useState(() => isoDate(new Date()))
  const [depart, setDepart] = useState(() => isoDate(addDays(new Date(), 2)))
  const [travelers, setTravelers] = useState(2)
  const [submitted, setSubmitted] = useState(false)

  const country = selection.country ? findCountry(selection.country) : undefined
  const datesMissing = !arrive || !depart
  const datesReversed = !datesMissing && depart < arrive
  const countryError = submitted && !selection.country ? 'Choose a country' : null
  const cityError = submitted && !selection.cityId ? 'Choose a city' : null
  const dateError =
    submitted && datesMissing
      ? 'Choose arrival and departure dates'
      : datesReversed
        ? 'Departure must be on or after arrival'
        : null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(true)
    if (!selection.country || !selection.cityId || datesMissing || datesReversed) return
    onSubmit({ country: selection.country, cityId: selection.cityId, arrive, depart, travelers })
  }

  return (
    <form className="tm-card destination-search" onSubmit={handleSubmit} noValidate aria-labelledby="search-title">
      <div className="destination-search__head">
        <h2 id="search-title" className="destination-search__title">
          Where are you headed?
        </h2>
        <span className="destination-search__hint">All fields required</span>
      </div>

      <div className="destination-search__grid">
        <Combobox
          id="country"
          label="Country"
          icon={<Globe size={18} />}
          placeholder="Search countries"
          options={COUNTRIES.map((c) => ({ value: c.name, label: c.name, meta: `${c.cities.length} cities` }))}
          value={selection.country}
          onChange={(name) =>
            onSelectionChange({ country: name, cityId: name === selection.country ? selection.cityId : null })
          }
          error={countryError}
          emptyMessage="No matching countries"
        />

        <Combobox
          id="city"
          label="City"
          icon={<MapPin size={18} />}
          placeholder={country ? `Search cities in ${country.name}` : 'Select a country first'}
          options={(country?.cities ?? []).map((c) => ({ value: c.id, label: c.name, meta: c.country }))}
          value={selection.cityId}
          onChange={(cityId) => onSelectionChange({ country: selection.country, cityId })}
          disabled={!country}
          error={cityError}
          emptyMessage="No matching cities"
        />

        <fieldset className="destination-search__dates">
          <legend className="tm-label">Travel dates</legend>
          <div className="destination-search__date-pair">
            <label className="date-field">
              <span className="date-field__label">Arrive</span>
              <input
                type="date"
                className={`tm-input date-field__input${dateError ? ' tm-input--error' : ''}`}
                value={arrive}
                onChange={(event) => setArrive(event.target.value)}
              />
            </label>
            <label className="date-field">
              <span className="date-field__label">Depart</span>
              <input
                type="date"
                className={`tm-input date-field__input${dateError ? ' tm-input--error' : ''}`}
                value={depart}
                min={arrive || undefined}
                onChange={(event) => setDepart(event.target.value)}
              />
            </label>
          </div>
          {dateError && <p className="tm-error">{dateError}</p>}
        </fieldset>

        <div className="destination-search__travelers">
          <span className="tm-label" id="travelers-label">
            Travelers
          </span>
          <div className="stepper" role="group" aria-labelledby="travelers-label">
            <button
              type="button"
              className="stepper__btn"
              aria-label="Remove traveler"
              disabled={travelers <= MIN_TRAVELERS}
              onClick={() => setTravelers((n) => Math.max(MIN_TRAVELERS, n - 1))}
            >
              <Minus size={18} aria-hidden="true" />
            </button>
            <span className="stepper__value" aria-live="polite">
              {travelers}
            </span>
            <button
              type="button"
              className="stepper__btn"
              aria-label="Add traveler"
              disabled={travelers >= MAX_TRAVELERS}
              onClick={() => setTravelers((n) => Math.min(MAX_TRAVELERS, n + 1))}
            >
              <Plus size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="destination-search__cta">
          <button type="submit" className="tm-btn tm-btn--accent tm-btn--tall">
            <Search size={18} aria-hidden="true" />
            Explore Destination
          </button>
        </div>
      </div>
    </form>
  )
}
