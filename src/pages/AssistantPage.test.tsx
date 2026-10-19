import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AssistantPage } from './AssistantPage'
import { resetChatPrefs } from '../services/chatPrefs'
import { resetTripStore, toggleTripPlace } from '../services/tripStore'
import { rememberDeviceLocation } from '../services/deviceLocation'

const REPLY = {
  reply: "Rain is on the way, so head indoors: the Prado is a short walk and fits your love of art.",
  suggestions: [
    { placeId: 'prado', name: 'Prado Museum', categories: ['ART'], latitude: 40.4138, longitude: -3.6921,
      distanceKm: 1.0, estimatedDurationMinutes: 120, reason: 'Velázquez and Goya, a short walk away.' },
  ],
  weather: { summary: 'Rain', temperatureC: 12.4, rainLikely: true, rainChancePct: 80, isDay: true },
  aiWritten: true,
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/assistant']}>
      <Routes>
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/places/:cityId/:placeId" element={<p>Place page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>, call = 0) {
  return JSON.parse(String((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body))
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.localStorage.setItem('roam.lastCity', 'madrid')
  resetChatPrefs()
  resetTripStore()
  rememberDeviceLocation(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AssistantPage', () => {
  it('sends the question with the city, local time, preferences, and trip, and shows the reply with cards', async () => {
    const fetchMock = vi.fn(async () => json(200, REPLY))
    vi.stubGlobal('fetch', fetchMock)
    toggleTripPlace({ placeId: 'palace', cityId: 'madrid', name: 'Royal Palace', category: 'HISTORY', latitude: 40.4179, longitude: -3.7143 })
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Art' }))
    await user.type(screen.getByLabelText(/Budget \(EUR\)/), '40')
    await user.selectOptions(screen.getByLabelText('Time I have'), '3')
    await user.type(screen.getByLabelText('Message ROAM'), 'What now?{Enter}')

    expect(await screen.findByText(/head indoors/)).toBeInTheDocument()
    const body = sentBody(fetchMock)
    expect(String((fetchMock.mock.calls[0] as unknown as [string])[0])).toMatch(/\/api\/v1\/chat$/)
    expect(body.messages).toEqual([{ role: 'USER', content: 'What now?' }])
    expect(body.context).toMatchObject({
      location: { latitude: 40.4168, longitude: -3.7038 },
      placeName: 'Madrid',
      interests: ['ART'],
      maxBudget: 40,
      currencyCode: 'EUR',
      availableMinutes: 180,
      tripStops: ['Royal Palace'],
    })
    expect(body.context.localDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)

    const card = screen.getByRole('listitem')
    expect(within(card).getByRole('link', { name: 'Prado Museum' })).toHaveAttribute('href', '/places/madrid/prado')
    expect(within(card).getByText(/1\.0 km/)).toBeInTheDocument()
    expect(screen.getByText(/Rain · 12°C · rain likely/)).toBeInTheDocument()
  })

  it('adds a suggested place to the trip', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, REPLY)))
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Where should I eat?' }))
    await user.click(await screen.findByRole('button', { name: /Add to trip/ }))

    expect(screen.getByRole('button', { name: /In your trip/ })).toHaveAttribute('aria-pressed', 'true')
    const saved = JSON.parse(window.localStorage.getItem('roam.trip.v1')!).trips.madrid
    expect(saved).toMatchObject([{ placeId: 'prado', name: 'Prado Museum', estimatedDurationMinutes: 120 }])
  })

  it('sends the conversation so follow-ups have context', async () => {
    const fetchMock = vi.fn(async () => json(200, { ...REPLY, suggestions: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const user = renderPage()

    await user.type(screen.getByLabelText('Message ROAM'), 'Ideas?{Enter}')
    await screen.findByText(/head indoors/)
    await user.type(screen.getByLabelText('Message ROAM'), 'Something cheaper{Enter}')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(sentBody(fetchMock, 1).messages.map((m: { role: string }) => m.role)).toEqual(['USER', 'ASSISTANT', 'USER'])
  })

  it('uses the shared location and labels rule-based answers', async () => {
    rememberDeviceLocation({ latitude: 40.42, longitude: -3.7 })
    const fetchMock = vi.fn(async () => json(200, { ...REPLY, aiWritten: false }))
    vi.stubGlobal('fetch', fetchMock)
    const user = renderPage()

    expect(screen.getByText('Using your location')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Message ROAM'), 'Now?{Enter}')

    expect(await screen.findByText(/Rule-based picks/)).toBeInTheDocument()
    expect(sentBody(fetchMock).context.location).toEqual({ latitude: 40.42, longitude: -3.7 })
  })

  it('shows a readable error and keeps the conversation usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { title: 'Attraction provider unavailable' })))
    const user = renderPage()

    await user.type(screen.getByLabelText('Message ROAM'), 'Now?{Enter}')

    expect(await screen.findByText(/I couldn't answer that/)).toBeInTheDocument()
    expect(screen.getByLabelText('Message ROAM')).toBeEnabled()
  })
})
