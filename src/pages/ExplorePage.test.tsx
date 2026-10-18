import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ExplorePage } from './ExplorePage'
import { resetTripStore } from '../services/tripStore'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function place(id: string, name: string, category: string, minutes?: number) {
  return {
    placeId: id,
    name,
    category,
    description: `${name} description`,
    latitude: 40.41,
    longitude: -3.7,
    ...(minutes != null ? { estimatedDurationMinutes: minutes } : {}),
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=40.41,-3.7&p=${id}`,
  }
}

const MADRID_PLACES = [
  place('palace', 'Royal Palace', 'HISTORY', 90),
  place('prado', 'Prado Museum', 'ART', 120),
  place('market', 'San Miguel Market', 'FOOD, LOCAL_EXPERIENCES', 45),
  place('retiro', 'El Retiro Park', 'NATURE', 60),
]

function mockBackend(responses: Array<() => Response>) {
  const queue = [...responses]
  const fetchMock = vi.fn(async () => (queue.shift() ?? (() => json(200, page(MADRID_PLACES))))())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function page(recommendations: unknown[]) {
  return { recommendations, page: 0, size: 20, totalElements: recommendations.length, totalPages: 1 }
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/explore/:cityId" element={<ExplorePage />} />
        <Route path="/" element={<p>Home page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function resultCards() {
  return within(screen.getByRole('region', { name: 'Places' })).getAllByRole('article')
}

beforeEach(() => {
  window.localStorage.clear()
  resetTripStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ExplorePage', () => {
  it('shows the city banner with the trip details from Home', async () => {
    mockBackend([() => json(200, page(MADRID_PLACES))])
    renderAt('/explore/madrid?arrive=2026-11-14&depart=2026-11-16&travelers=2')

    expect(screen.getByRole('heading', { level: 1, name: 'Explore Madrid' })).toBeInTheDocument()
    expect(screen.getByText('14–16 Nov 2026 · 2 travelers')).toBeInTheDocument()
    expect(screen.getByText('Currency · EUR')).toBeInTheDocument()
    expect(screen.getByText('Language · Spanish')).toBeInTheDocument()
    expect(screen.getByText('Time zone · CET')).toBeInTheDocument()
    await screen.findByText('Royal Palace')
  })

  it('loads every category in one request around the city centre', async () => {
    const fetchMock = mockBackend([() => json(200, page(MADRID_PLACES))])
    renderAt('/explore/madrid')

    expect(screen.getByLabelText('Loading places')).toBeInTheDocument()
    await screen.findByText('Royal Palace')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new URL(url).searchParams.get('size')).toBe('20')
    const body = JSON.parse(String(init.body))
    expect(body.location).toEqual({ latitude: 40.4168, longitude: -3.7038 })
    expect(body.interests).toEqual(['HISTORY', 'FOOD', 'ART', 'NATURE', 'SHOPPING', 'LOCAL_EXPERIENCES'])
    expect(body.currencyCode).toBe('EUR')
    expect(screen.getByRole('heading', { name: '4 places' })).toBeInTheDocument()
  })

  it('filters by category and text without another request', async () => {
    const fetchMock = mockBackend([() => json(200, page(MADRID_PLACES))])
    const user = renderAt('/explore/madrid')
    await screen.findByText('Royal Palace')

    await user.click(screen.getByRole('button', { name: 'Food & Drink' }))
    expect(resultCards()).toHaveLength(1)
    expect(screen.getByText('San Miguel Market')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.type(screen.getByLabelText('Filter places in Madrid'), 'prado')
    expect(resultCards()).toHaveLength(1)

    await user.clear(screen.getByLabelText('Filter places in Madrid'))
    await user.type(screen.getByLabelText('Filter places in Madrid'), 'zzz')
    expect(screen.getByRole('heading', { name: 'No places match “zzz”' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search & filters' }))
    expect(resultCards()).toHaveLength(4)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sorts by shortest visit', async () => {
    mockBackend([() => json(200, page(MADRID_PLACES))])
    const user = renderAt('/explore/madrid')
    await screen.findByText('Royal Palace')

    await user.selectOptions(screen.getByLabelText('Sort'), 'shortest')

    const names = resultCards().map((card) => within(card).getByRole('heading').textContent)
    expect(names).toEqual(['San Miguel Market', 'El Retiro Park', 'Royal Palace', 'Prado Museum'])
  })

  it('adds places to the trip panel, totals the time, and saves them', async () => {
    mockBackend([() => json(200, page(MADRID_PLACES))])
    const user = renderAt('/explore/madrid')
    await screen.findByText('Royal Palace')
    const panel = screen.getByRole('complementary', { name: 'Your Madrid trip' })
    expect(within(panel).getByText(/No places yet/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add Royal Palace to trip' }))
    expect(screen.getByRole('status')).toHaveTextContent('Royal Palace added to your trip')
    await user.click(screen.getByRole('button', { name: 'Add Prado Museum to trip' }))

    expect(within(panel).getByText('2 places')).toBeInTheDocument()
    expect(within(panel).getByText('3h 30m')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Royal Palace from trip' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByRole('link', { name: 'Optimize My Route' })).toHaveAttribute('href', '/trip/madrid/route')

    const saved = JSON.parse(window.localStorage.getItem('roam.trip.v1')!)
    expect(saved.trips.madrid.map((p: { placeId: string }) => p.placeId)).toEqual(['palace', 'prado'])

    await user.click(within(panel).getByRole('button', { name: 'Remove Royal Palace' }))
    expect(within(panel).getByText('1 place')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Royal Palace to trip' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves favorites', async () => {
    mockBackend([() => json(200, page(MADRID_PLACES))])
    const user = renderAt('/explore/madrid')
    await screen.findByText('Royal Palace')

    await user.click(screen.getByRole('button', { name: 'Save El Retiro Park to favorites' }))

    expect(screen.getByRole('button', { name: 'Remove El Retiro Park from favorites' })).toHaveAttribute('aria-pressed', 'true')
    const saved = JSON.parse(window.localStorage.getItem('roam.trip.v1')!)
    expect(saved.favorites).toHaveLength(1)
  })

  it('shows nine places at a time', async () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`p${i}`, `Place ${i}`, 'HISTORY', 30))
    mockBackend([() => json(200, page(many))])
    const user = renderAt('/explore/madrid')
    await screen.findByText('Place 0')

    expect(resultCards()).toHaveLength(9)
    await user.click(screen.getByRole('button', { name: 'Show 3 more places' }))
    expect(resultCards()).toHaveLength(12)
  })

  it('offers a retry when places fail to load', async () => {
    const fetchMock = mockBackend([
      () => json(503, { title: 'Attraction provider unavailable', status: 503 }),
      () => json(200, page(MADRID_PLACES)),
    ])
    const user = renderAt('/explore/madrid')

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load places")
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await screen.findByText('Royal Palace')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explains an unknown city without calling the API', async () => {
    const fetchMock = mockBackend([])
    const user = renderAt('/explore/atlantis')

    expect(screen.getByRole('heading', { name: "We don't know that city yet" })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    await user.click(screen.getByRole('link', { name: 'Choose a destination' }))
    await waitFor(() => expect(screen.getByText('Home page')).toBeInTheDocument())
  })
})
