import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ItineraryPage } from './ItineraryPage'
import { itineraryFromSchedule, resetItineraries, saveItinerary } from '../services/itinerary'
import { buildSchedule } from '../services/routePlanner'
import type { SavedPlace } from '../services/tripStore'

const SOL = { latitude: 40.4169, longitude: -3.7035 }

function place(id: string, name: string, latitude: number, longitude: number, minutes: number): SavedPlace {
  return { placeId: id, cityId: 'madrid', name, category: 'HISTORY', latitude, longitude, estimatedDurationMinutes: minutes }
}

const PALACE = place('palace', 'Royal Palace', 40.4179, -3.7143, 90)
const PRADO = place('prado', 'Prado Museum', 40.4138, -3.6921, 120)
const RETIRO = place('retiro', 'El Retiro Park', 40.4153, -3.6844, 60)

function seed(split = false) {
  saveItinerary(
    itineraryFromSchedule({
      cityId: 'madrid',
      schedule: buildSchedule(
        {
          stops: [PALACE, PRADO, RETIRO],
          legs: [
            { km: 1, minutes: 15 },
            { km: 2, minutes: 25 },
            { km: 0.7, minutes: 9 },
          ],
          source: 'google',
        },
        SOL,
        'walk',
        split,
      ),
      mode: 'walk',
      start: SOL,
      startName: 'Madrid centre',
      source: 'google',
      startDate: '2026-11-14',
    }),
  )
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/trip/madrid/itinerary']}>
      <Routes>
        <Route path="/trip/:cityId/itinerary" element={<ItineraryPage />} />
        <Route path="/trip/:cityId" element={<p>Trip builder</p>} />
        <Route path="/trip/:cityId/route" element={<p>Route page</p>} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

function stopNames() {
  return within(screen.getByRole('tabpanel'))
    .queryAllByRole('article')
    .map((card) => within(card).getAllByRole('link')[0]!.textContent)
}

function saved() {
  return JSON.parse(window.localStorage.getItem('roam.itinerary.v1')!).madrid
}

beforeEach(() => {
  window.localStorage.clear()
  resetItineraries()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ItineraryPage', () => {
  it('points to the optimizer when nothing is saved yet', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'No Madrid itinerary yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open My Trip' })).toHaveAttribute('href', '/trip/madrid')
  })

  it('shows the trip header, day tabs, and the day timeline', () => {
    seed(true)
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'My Madrid Itinerary' })).toBeInTheDocument()
    expect(screen.getByText('Madrid, Spain')).toBeInTheDocument()
    expect(screen.getByText('3 places')).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByRole('tab', { name: /Day 1/ })).toHaveAttribute('aria-selected', 'true')
    expect(stopNames()).toEqual(['Royal Palace', 'Prado Museum'])
    expect(within(screen.getByRole('tabpanel')).getByText(/9:15 AM – 10:45 AM · 1h 30m/)).toBeInTheDocument()
    expect(screen.getByText(/from Madrid centre/)).toBeInTheDocument()
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Itinerary')
  })

  it('switches days', async () => {
    seed(true)
    const user = renderPage()

    await user.click(screen.getByRole('tab', { name: /Day 2/ }))

    expect(stopNames()).toEqual(['El Retiro Park'])
    expect(screen.getByRole('heading', { name: /Day 2 summary/ })).toBeInTheDocument()
  })

  it('removes a stop with undo, re-estimating the next leg', async () => {
    seed()
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Remove Royal Palace' }))
    expect(stopNames()).toEqual(['Prado Museum', 'El Retiro Park'])
    expect(saved().days[0].stops[0].leg).toMatchObject({ from: 'start', estimated: true })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stopNames()).toEqual(['Royal Palace', 'Prado Museum', 'El Retiro Park'])
  })

  it('sets a start time and moves a stop to another day', async () => {
    seed()
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Add Day' }))
    await user.click(screen.getByRole('tab', { name: /Day 1/ }))
    await user.click(screen.getByRole('button', { name: 'Edit Prado Museum' }))
    // Time and date pickers set the whole value at once.
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '13:00' } })
    expect(saved().days[0].stops[1].fixedStart).toBe(13 * 60)
    expect(within(screen.getByRole('tabpanel')).getByText(/1:00 PM – 3:00 PM/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Move to'), 'Day 2')
    expect(stopNames()).toEqual(['Royal Palace', 'El Retiro Park'])
    await user.click(screen.getByRole('tab', { name: /Day 2/ }))
    expect(stopNames()).toEqual(['Prado Museum'])
  })

  it('changes the dates and travelers', async () => {
    seed(true)
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'More travelers' }))
    expect(saved().travelers).toBe(2)
    expect(screen.getByRole('button', { name: 'Fewer travelers' })).toBeEnabled()

    fireEvent.change(screen.getByLabelText('Travel dates'), { target: { value: '2026-12-24' } })
    expect(saved().startDate).toBe('2026-12-24')
    expect(screen.getByText('Thu 24 Dec – Fri 25 Dec 2026')).toBeInTheDocument()
  })

  it('removes an empty day', async () => {
    seed()
    const user = renderPage()

    await user.click(screen.getByRole('button', { name: 'Add Day' }))
    expect(screen.getByRole('heading', { name: 'Nothing planned for this day' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove this day' }))

    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('exports a calendar file and copies text', async () => {
    seed()
    const createUrl = vi.fn(() => 'blob:itinerary')
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = renderPage()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()

    await user.click(screen.getByRole('button', { name: /Export Itinerary/ }))
    await user.click(screen.getByRole('menuitem', { name: /Calendar file/ }))
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Calendar file downloaded')

    await user.click(screen.getByRole('button', { name: /Export Itinerary/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Copy as text' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('9:15 AM–10:45 AM  Royal Palace'))
  })
})
