import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TravelExplorerPage } from './TravelExplorerPage'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function place(index: number) {
  return {
    placeId: `place-${index}`,
    name: `Place ${index}`,
    category: 'ART',
    description: `Description ${index}`,
    latitude: 41.9,
    longitude: 12.49,
    estimatedDurationMinutes: 60,
    mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=41.9,12.49&n=${index}`,
  }
}

/** Serves POST /api/v1/recommendations from a fixed list of `total` places, honouring page and size. */
function mockSearchBackend(total: number, override?: (url: URL) => Response | undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    if (init?.method === 'POST' && url.pathname === '/api/v1/recommendations') {
      const custom = override?.(url)
      if (custom) return custom
      const page = Number(url.searchParams.get('page'))
      const size = Number(url.searchParams.get('size'))
      const all = Array.from({ length: total }, (_, i) => place(i + 1))
      return json(200, {
        recommendations: all.slice(page * size, page * size + size),
        page,
        size,
        totalElements: total,
        totalPages: total === 0 ? 0 : Math.ceil(total / size),
      })
    }
    return json(404, { title: 'Not found', status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** The nth search request (0-based), with its parsed URL and JSON body. */
function searchCall(fetchMock: ReturnType<typeof mockSearchBackend>, index: number) {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`expected search request #${index}`)
  const [input, init] = call
  return { url: new URL(String(input)), body: JSON.parse(String(init?.body ?? 'null')) }
}

async function renderWithValidPreferences() {
  render(<TravelExplorerPage />)
  const user = userEvent.setup()
  await user.click(screen.getByRole('checkbox', { name: 'Art' }))
  await user.type(screen.getByLabelText('Maximum budget'), '20')
  return user
}

function searchButton() {
  return screen.getByRole('button', { name: 'Search nearby' })
}

beforeEach(() => {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'geolocation')
})

describe('Search nearby', () => {
  it('searches around the selected city and pages through the results', async () => {
    const fetchMock = mockSearchBackend(12)
    const user = await renderWithValidPreferences()

    await user.selectOptions(screen.getByLabelText('City'), 'Paris')
    await user.selectOptions(screen.getByLabelText('Results per page'), '5')
    await user.click(searchButton())

    const results = await screen.findByRole('list', { name: 'Search results' })
    // Cards contain their own fact lists, so count only the top-level items.
    expect(results.querySelectorAll(':scope > li')).toHaveLength(5)
    expect(screen.getByText('Showing 1–5 of 12 places near Paris')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    const first = searchCall(fetchMock, 0)
    expect(first.url.searchParams.get('page')).toBe('0')
    expect(first.url.searchParams.get('size')).toBe('5')
    expect(first.body).toEqual({
      location: { latitude: 48.8566, longitude: 2.3522 },
      interests: ['ART'],
      maxBudget: 20,
      currencyCode: 'EUR',
      availableMinutes: 60,
    })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 6–10 of 12 places near Paris')
    expect(screen.getByText('Place 6')).toBeInTheDocument()
    expect(searchCall(fetchMock, 1).url.searchParams.get('page')).toBe('1')

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 11–12 of 12 places near Paris')
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('folds the controls into a summary after a search and reopens them on Edit search', async () => {
    mockSearchBackend(3)
    const user = await renderWithValidPreferences()

    await user.click(searchButton())

    await screen.findByText('Showing 1–3 of 3 places near Rome')
    expect(screen.getByText('Art · €20.00 · 60 min · Rome · 10 per page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Search nearby' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Search results (3)' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('button', { name: 'Edit search' }))

    expect(searchButton()).toBeVisible()
  })

  it('numbers the cards to match the map pins and marks the selected one', async () => {
    mockSearchBackend(12)
    const user = await renderWithValidPreferences()
    await user.selectOptions(screen.getByLabelText('Results per page'), '5')
    await user.click(searchButton())
    await screen.findByText('Showing 1–5 of 12 places near Rome')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Showing 6–10 of 12 places near Rome')

    const pin = screen.getByRole('button', { name: 'Show Place 6 on the map' })
    expect(pin).toHaveTextContent('6')
    await user.click(pin)

    expect(pin).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not search until the preferences are valid', async () => {
    const fetchMock = mockSearchBackend(3)
    render(<TravelExplorerPage />)
    const user = userEvent.setup()

    await user.click(searchButton())

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses typed coordinates and rejects out-of-range values', async () => {
    const fetchMock = mockSearchBackend(2)
    const user = await renderWithValidPreferences()

    await user.click(screen.getByRole('radio', { name: 'Coordinates' }))
    await user.type(screen.getByLabelText('Latitude'), '95')
    await user.type(screen.getByLabelText('Longitude'), '12.5')
    await user.click(searchButton())

    expect(screen.getByText('Enter a latitude between -90 and 90.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Latitude'))
    await user.type(screen.getByLabelText('Latitude'), '40.7580')
    await user.click(searchButton())

    await screen.findByText('Showing 1–2 of 2 places near 40.758, 12.5')
    expect(searchCall(fetchMock, 0).body.location).toEqual({ latitude: 40.758, longitude: 12.5 })
    expect(screen.queryByRole('navigation', { name: 'Search results pages' })).not.toBeInTheDocument()
  })

  it('searches around the browser location', async () => {
    const fetchMock = mockSearchBackend(1)
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) =>
          success({
            coords: { latitude: 43.65, longitude: -79.38, accuracy: 10 } as GeolocationCoordinates,
            timestamp: Date.now(),
          } as GeolocationPosition),
        ),
        watchPosition: vi.fn(() => 1),
        clearWatch: vi.fn(),
      },
    })
    const user = await renderWithValidPreferences()

    await user.click(screen.getByRole('radio', { name: 'My location' }))
    await user.click(searchButton())

    await screen.findByText('Showing 1–1 of 1 places near your current location')
    expect(searchCall(fetchMock, 0).body.location).toEqual({ latitude: 43.65, longitude: -79.38 })
  })

  it('shows an empty state when nothing matches', async () => {
    mockSearchBackend(0)
    const user = await renderWithValidPreferences()

    await user.click(searchButton())

    expect(await screen.findByText('No places matched here.')).toBeInTheDocument()
  })

  it('keeps the current page visible when a page change fails', async () => {
    mockSearchBackend(8, (url) =>
      url.searchParams.get('page') === '1'
        ? json(503, { title: 'Attraction provider unavailable', status: 503 })
        : undefined,
    )
    const user = await renderWithValidPreferences()
    await user.selectOptions(screen.getByLabelText('Results per page'), '5')
    await user.click(searchButton())
    await screen.findByText('Showing 1–5 of 8 places near Rome')

    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nearby experiences are temporarily unavailable')
    expect(screen.getByText('Place 1')).toBeInTheDocument()
  })

  it('explains rate limiting', async () => {
    mockSearchBackend(1, () => json(429, { message: 'Too Many Requests' }))
    const user = await renderWithValidPreferences()

    await user.click(searchButton())

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Too many requests'))
  })
})
