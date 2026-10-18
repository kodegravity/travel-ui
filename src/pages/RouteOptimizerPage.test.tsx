import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RouteOptimizerPage } from './RouteOptimizerPage'
import { resetTripStore, toggleTripPlace, type SavedPlace } from '../services/tripStore'

function stop(id: string, name: string, latitude: number, longitude: number, minutes: number): SavedPlace {
  return { placeId: id, cityId: 'madrid', name, category: 'HISTORY', latitude, longitude, estimatedDurationMinutes: minutes }
}

const PALACE = stop('palace', 'Royal Palace', 40.4179, -3.7143, 90)
const PRADO = stop('prado', 'Prado Museum', 40.4138, -3.6921, 120)
const RETIRO = stop('retiro', 'El Retiro Park', 40.4153, -3.6844, 60)

const GOOGLE_ROUTE = {
  order: ['palace', 'prado', 'retiro'],
  legs: [
    { distanceMeters: 1200, durationSeconds: 900, polyline: 'a' },
    { distanceMeters: 2300, durationSeconds: 1800, polyline: 'b' },
    { distanceMeters: 800, durationSeconds: 600, polyline: 'c' },
  ],
  distanceMeters: 4300,
  durationSeconds: 3300,
  source: 'google',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockBackend(...responses: Array<() => Response>) {
  const queue = [...responses]
  const fetchMock = vi.fn(async () => (queue.shift() ?? (() => json(200, GOOGLE_ROUTE)))())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderRoute() {
  render(
    <MemoryRouter initialEntries={['/trip/madrid/route']}>
      <Routes>
        <Route path="/trip/:cityId/route" element={<RouteOptimizerPage />} />
        <Route path="/trip/:cityId" element={<p>Trip builder</p>} />
        <Route path="/explore/:cityId" element={<p>Explore page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function timelineNames() {
  return within(screen.getByRole('region', { name: 'Optimized route' }))
    .getAllByRole('button', { pressed: false })
    .flatMap((button) => button.querySelector('strong')?.textContent ?? [])
}

beforeEach(() => {
  window.localStorage.clear()
  resetTripStore()
  ;[RETIRO, PALACE, PRADO].forEach((place) => toggleTripPlace(place))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('RouteOptimizerPage', () => {
  it("shows Google's order with arrival times and street distances", async () => {
    const fetchMock = mockBackend()
    renderRoute()

    expect(await screen.findByText('Street routes by Google')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Your optimized Madrid route' })).toBeInTheDocument()
    expect(timelineNames()).toEqual(['Royal Palace', 'Prado Museum', 'El Retiro Park'])
    expect(screen.getByText('9:15 AM')).toBeInTheDocument()
    expect(screen.getByText(/1\.2 km · 15 min walking/)).toBeInTheDocument()
    expect(screen.getByText('Finish · El Retiro Park')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Optimize route')
  })

  it('uses its own estimate, and says why, when Google refuses', async () => {
    mockBackend(() => json(503, { title: 'Attraction provider unavailable' }))
    renderRoute()

    expect(await screen.findByText('Estimated from straight-line distances')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/daily limit/)
    expect(timelineNames()).toHaveLength(3)
  })

  it('estimates transit without calling Google', async () => {
    const fetchMock = mockBackend()
    const user = renderRoute()
    await screen.findByText('Street routes by Google')

    await user.click(screen.getByRole('button', { name: 'Transit' }))

    expect(await screen.findByText('Transit times are estimates')).toBeInTheDocument()
    expect(screen.getByText(/doesn't optimize public transport/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('recalculates on request with a fresh call', async () => {
    const fetchMock = mockBackend()
    const user = renderRoute()
    await screen.findByText('Street routes by Google')

    await user.click(screen.getAllByRole('button', { name: 'Recalculate route' })[0]!)

    await screen.findByText('Street routes by Google')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('saves the optimized order to the trip', async () => {
    mockBackend()
    const user = renderRoute()
    await screen.findByText('Street routes by Google')

    await user.click(screen.getAllByRole('button', { name: 'Save My Itinerary' })[0]!)

    const saved = JSON.parse(window.localStorage.getItem('roam.trip.v1')!).trips.madrid.map((p: SavedPlace) => p.placeId)
    expect(saved).toEqual(['palace', 'prado', 'retiro'])
    expect(screen.getByText('Saved. Your trip now follows this order.')).toBeInTheDocument()
  })

  it('suggests splitting a long day and splits it', async () => {
    resetTripStore()
    window.localStorage.clear()
    ;[stop('palace', 'Royal Palace', 40.4179, -3.7143, 300), stop('prado', 'Prado Museum', 40.4138, -3.6921, 300), RETIRO].forEach(
      (place) => toggleTripPlace(place),
    )
    mockBackend()
    const user = renderRoute()

    expect(await screen.findByText('This itinerary may be too long for one day.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Split Into 2 Days' }))

    expect(screen.getByText(/Day 2 · starts 10:00 AM/)).toBeInTheDocument()
    expect(screen.getByText('Split into 2 days')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep as 1 day' }))
    expect(screen.queryByText(/Day 2 · starts/)).not.toBeInTheDocument()
  })

  it('asks for two places first', () => {
    resetTripStore()
    window.localStorage.clear()
    toggleTripPlace(PALACE)
    const fetchMock = mockBackend()
    renderRoute()

    expect(screen.getByRole('heading', { name: 'Add at least 2 places first' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
