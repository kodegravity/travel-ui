import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripBuilderPage } from './TripBuilderPage'
import { resetTripStore, toggleTripPlace, type SavedPlace } from '../services/tripStore'

function stop(id: string, name: string, latitude: number, longitude: number, minutes?: number): SavedPlace {
  return {
    placeId: id,
    cityId: 'madrid',
    name,
    category: 'HISTORY',
    latitude,
    longitude,
    ...(minutes != null ? { estimatedDurationMinutes: minutes } : {}),
  }
}

const PALACE = stop('palace', 'Royal Palace', 40.4179, -3.7143, 90)
const PRADO = stop('prado', 'Prado Museum', 40.4138, -3.6921, 120)
const RETIRO = stop('retiro', 'El Retiro Park', 40.4153, -3.6844, 60)

function seed(...places: SavedPlace[]) {
  places.forEach((place) => toggleTripPlace(place))
}

function renderTrip(path = '/trip/madrid') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/trip/:cityId" element={<TripBuilderPage />} />
        <Route path="/explore/:cityId" element={<p>Explore page</p>} />
        <Route path="/places/:cityId/:placeId" element={<p>Place page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function stopNames() {
  return within(screen.getByRole('region', { name: 'Selected attractions' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('link').textContent)
}

function savedOrder(): string[] {
  return JSON.parse(window.localStorage.getItem('roam.trip.v1')!).trips.madrid.map((p: SavedPlace) => p.placeId)
}

beforeEach(() => {
  window.localStorage.clear()
  resetTripStore()
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('TripBuilderPage', () => {
  it('lists the trip in order with the summary', () => {
    seed(PALACE, PRADO, RETIRO)
    renderTrip()

    expect(screen.getByRole('heading', { level: 1, name: 'Build Your Madrid Itinerary' })).toBeInTheDocument()
    expect(stopNames()).toEqual(['Royal Palace', 'Prado Museum', 'El Retiro Park'])
    const summary = screen.getByRole('complementary', { name: 'Trip summary' })
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('4h 30m')).toBeInTheDocument()
    expect(within(summary).getByText(/Est\. travel time · walking/)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Organize')
  })

  it('reorders with the arrow buttons and saves the order', async () => {
    seed(PALACE, PRADO, RETIRO)
    const user = renderTrip()

    await user.click(screen.getByRole('button', { name: 'Move El Retiro Park up' }))
    expect(stopNames()).toEqual(['Royal Palace', 'El Retiro Park', 'Prado Museum'])
    expect(savedOrder()).toEqual(['palace', 'retiro', 'prado'])

    expect(screen.getByRole('button', { name: 'Move Royal Palace up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Prado Museum down' })).toBeDisabled()
  })

  it('removes a stop and undoes it', async () => {
    seed(PALACE, PRADO, RETIRO)
    const user = renderTrip()

    await user.click(screen.getByRole('button', { name: 'Remove Prado Museum' }))
    expect(stopNames()).toEqual(['Royal Palace', 'El Retiro Park'])
    expect(screen.getByRole('status')).toHaveTextContent('Prado Museum removed')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stopNames()).toEqual(['Royal Palace', 'Prado Museum', 'El Retiro Park'])
  })

  it('clears the selection, shows the empty state, and undoes it', async () => {
    seed(PALACE, PRADO)
    const user = renderTrip()

    await user.click(screen.getByRole('button', { name: 'Clear Selection' }))
    expect(screen.getByRole('heading', { name: 'Your trip is empty' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Madrid' })).toHaveAttribute('href', '/explore/madrid')

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stopNames()).toEqual(['Royal Palace', 'Prado Museum'])
  })

  it('updates the travel estimate when the mode changes and remembers it', async () => {
    seed(PALACE, PRADO, RETIRO)
    const user = renderTrip()
    const summary = screen.getByRole('complementary', { name: 'Trip summary' })
    const walking = within(summary).getByText(/Est\. travel time/).nextSibling!.textContent

    await user.click(screen.getByRole('button', { name: 'Driving' }))

    expect(screen.getByRole('button', { name: 'Driving' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(summary).getByText(/Est\. travel time · driving/).nextSibling!.textContent).not.toEqual(walking)
    expect(JSON.parse(window.localStorage.getItem('roam.trip.v1')!).settings.madrid.mode).toBe('drive')
  })

  it('starts from the device location when allowed, and falls back to the centre when not', async () => {
    seed(PALACE, PRADO)
    let allow = true
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((ok: PositionCallback, fail: PositionErrorCallback) =>
          allow
            ? ok({ coords: { latitude: 40.42, longitude: -3.70, accuracy: 10 } as GeolocationCoordinates, timestamp: 0 } as GeolocationPosition)
            : fail({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError),
        ),
      },
    })
    const user = renderTrip()

    await user.click(screen.getByRole('radio', { name: /Current Location/ }))
    expect(await screen.findByText('Using your device location')).toBeInTheDocument()
    expect(screen.getByText(/from your location/)).toBeInTheDocument()

    allow = false
    await user.click(screen.getByRole('radio', { name: /City Center/ }))
    await user.click(screen.getByRole('radio', { name: /Current Location/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Location permission was denied/)
    expect(screen.getByRole('radio', { name: /City Center/ })).toBeChecked()
  })

  it('needs two places before optimizing, and the optimizer is not live yet', () => {
    seed(PALACE)
    renderTrip()

    const summary = screen.getByRole('complementary', { name: 'Trip summary' })
    expect(within(summary).getByRole('button', { name: 'Optimize My Route' })).toBeDisabled()
    expect(within(summary).getByText('Add at least 2 places to optimize.')).toBeInTheDocument()
  })

  it('counts unknown visit times honestly', () => {
    seed(PALACE, stop('cafe', 'Corner Café', 40.416, -3.703))
    renderTrip()

    expect(screen.getByText('1 place has no visit estimate and is not counted in sightseeing time.')).toBeInTheDocument()
  })

  it('links each stop to its details page', async () => {
    seed(PALACE)
    const user = renderTrip()

    await user.click(screen.getByRole('link', { name: 'Stop 1: Royal Palace' }))
    expect(screen.getByText('Place page')).toBeInTheDocument()
  })
})
