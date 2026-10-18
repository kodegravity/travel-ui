import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PlaceDetailsPage, type PlaceLinkState } from './PlaceDetailsPage'
import { resetTripStore } from '../services/tripStore'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const PALACE_ID = 'ChIJ-palace'

const DETAILS = {
  placeId: PALACE_ID,
  name: 'Royal Palace of Madrid',
  address: 'Calle de Bailén, s/n, 28071 Madrid, Spain',
  latitude: 40.4179,
  longitude: -3.7143,
  rating: 4.7,
  userRatingCount: 12400,
  openNow: true,
  weekdayHours: ['Monday: 10:00 AM – 6:00 PM', 'Tuesday: 10:00 AM – 6:00 PM'],
  websiteUri: 'https://www.patrimonionacional.es/visita',
  summary: 'Lavish 18th-century palace.',
  priceLevel: 'PRICE_LEVEL_MODERATE',
  accessibility: { wheelchairAccessibleEntrance: true },
  photo: {
    url: 'https://lh3.googleusercontent.com/p/abc',
    attributions: [{ displayName: 'Luis', uri: 'https://www.google.com/maps/contrib/2' }],
  },
  reviews: [{ authorName: 'Ana', rating: 5, text: 'Go at opening.', relativeTime: 'a month ago' }],
  source: 'google',
}

function card(id: string, name: string, latitude: number, longitude: number, category = 'HISTORY') {
  return {
    placeId: id,
    name,
    category,
    description: '',
    latitude,
    longitude,
    estimatedDurationMinutes: 90,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
  }
}

const PALACE_CARD = card(PALACE_ID, 'Royal Palace of Madrid', 40.4179, -3.7143)
const LINK_STATE: PlaceLinkState = {
  place: PALACE_CARD,
  nearby: [
    PALACE_CARD,
    card('far', 'El Retiro Park', 40.4153, -3.6844, 'NATURE'),
    card('near', 'Almudena Cathedral', 40.4156, -3.7144),
  ],
}

function mockBackend(responses: Array<() => Response>) {
  const queue = [...responses]
  const fetchMock = vi.fn(async () => (queue.shift() ?? (() => json(200, DETAILS)))())
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderAt(path: string, state?: PlaceLinkState) {
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route path="/places/:cityId/:placeId" element={<PlaceDetailsPage />} />
        <Route path="/explore/:cityId" element={<p>Explore page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

beforeEach(() => {
  window.localStorage.clear()
  resetTripStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PlaceDetailsPage', () => {
  it('shows Google details with photo credit, hours, price, website, and attribution', async () => {
    const fetchMock = mockBackend([() => json(200, DETAILS)])
    renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)

    expect(await screen.findByText('Lavish 18th-century palace.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Royal Palace of Madrid' })).toBeInTheDocument()
    expect(screen.getByText('4.7')).toBeInTheDocument()
    expect(screen.getByText(/12\.4K ratings/)).toBeInTheDocument()
    expect(screen.getAllByText('Calle de Bailén, s/n, 28071 Madrid, Spain').length).toBeGreaterThan(0)
    expect(screen.getByText('Open now')).toBeInTheDocument()
    expect(screen.getByText('Monday: 10:00 AM – 6:00 PM')).toBeInTheDocument()
    expect(within(screen.getByRole('complementary', { name: 'Visit details' })).getByText('Moderate · €€')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'patrimonionacional.es' })).toHaveAttribute('href', DETAILS.websiteUri)
    expect(screen.getByRole('img', { name: 'Royal Palace of Madrid' })).toHaveAttribute('src', DETAILS.photo.url)
    expect(screen.getByRole('link', { name: 'Luis' })).toBeInTheDocument()
    expect(screen.getByText('Place information from Google')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/v1\/places\/ChIJ-palace$/)
    expect(init.method).toBe('GET')
  })

  it('shows what Explore knew while details load', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)

    expect(screen.getByRole('heading', { level: 1, name: 'Royal Palace of Madrid' })).toBeInTheDocument()
    expect(screen.getByText('Historical Landmarks')).toBeInTheDocument()
    expect(screen.getByText('About 1h 30m (estimate)')).toBeInTheDocument()
  })

  it('lists reviews with their authors', async () => {
    mockBackend([() => json(200, DETAILS)])
    const user = renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)
    await screen.findByText('Lavish 18th-century palace.')

    await user.click(screen.getByRole('tab', { name: 'Reviews (1)' }))

    expect(screen.getByText('Ana')).toBeInTheDocument()
    expect(screen.getByText('Go at opening.')).toBeInTheDocument()
    expect(screen.getByLabelText('5 out of 5 stars')).toBeInTheDocument()
    expect(screen.getByText('Reviews from Google')).toBeInTheDocument()
  })

  it('lists nearby places closest first with walking time', async () => {
    mockBackend([() => json(200, DETAILS)])
    const user = renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)
    await screen.findByText('Lavish 18th-century palace.')

    await user.click(screen.getByRole('tab', { name: 'Nearby' }))

    const links = within(screen.getByRole('tabpanel')).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Almudena Cathedral'),
      expect.stringContaining('El Retiro Park'),
    ])
    expect(links[0]).toHaveTextContent('3 min walk')
    expect(links[0]).toHaveAttribute('href', '/places/madrid/near')
  })

  it('adds the place to the trip and saves it as a favorite', async () => {
    mockBackend([() => json(200, DETAILS)])
    const user = renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)
    await screen.findByText('Lavish 18th-century palace.')

    await user.click(screen.getAllByRole('button', { name: 'Add to My Trip' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByRole('button', { name: 'In your trip' })[0]).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Saved' })).toHaveAttribute('aria-pressed', 'true')
    const saved = JSON.parse(window.localStorage.getItem('roam.trip.v1')!)
    expect(saved.trips.madrid[0].placeId).toBe(PALACE_ID)
    expect(saved.favorites[0].placeId).toBe(PALACE_ID)
  })

  it('keeps the basics and offers a retry when details fail', async () => {
    const fetchMock = mockBackend([
      () => json(503, { title: 'Attraction provider unavailable', status: 503 }),
      () => json(200, DETAILS),
    ])
    const user = renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)

    expect(await screen.findByRole('alert')).toHaveTextContent('Details are unavailable right now.')
    expect(screen.getByRole('heading', { level: 1, name: 'Royal Palace of Madrid' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Lavish 18th-century palace.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('explains a place that does not exist', async () => {
    mockBackend([() => json(404, { title: 'Place not found', status: 404 })])
    const user = renderAt('/places/madrid/nowhere')

    expect(await screen.findByRole('heading', { name: "We couldn't find that place" })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to Explore Madrid' }))
    expect(screen.getByText('Explore page')).toBeInTheDocument()
  })

  it('does not fetch again when switching tabs', async () => {
    const fetchMock = mockBackend([() => json(200, DETAILS)])
    const user = renderAt(`/places/madrid/${PALACE_ID}`, LINK_STATE)
    await screen.findByText('Lavish 18th-century palace.')

    await user.click(screen.getByRole('tab', { name: 'Reviews (1)' }))
    await user.click(screen.getByRole('tab', { name: 'Overview' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
