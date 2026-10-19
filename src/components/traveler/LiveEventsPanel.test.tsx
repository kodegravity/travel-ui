import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiveEventsPanel } from './LiveEventsPanel'
import { formatEventStart } from '../../services/notifications'
import { resetLiveEventTypes, useLiveEventTypes } from '../../services/liveEventPrefs'
import type { LiveSuggestion } from '../../types/api'

const GAME: LiveSuggestion = {
  event: {
    id: 'G1', name: 'Real Madrid vs Sevilla', type: 'SPORTS', venueName: 'Estadio Santiago Bernabéu',
    latitude: 40.4531, longitude: -3.6883, startsAt: '2030-01-01T20:00:00Z', distanceKm: 4.2,
    url: 'https://www.ticketmaster.es/event/G1', source: 'ticketmaster',
  },
  headline: 'Derby night at the Bernabéu',
  message: 'A big local match, a short ride away.',
  aiWritten: true,
}

function Panel(props: { events?: LiveSuggestion[]; hasSession?: boolean; onDismiss?: (id: string) => void }) {
  const types = useLiveEventTypes()
  return (
    <LiveEventsPanel
      eventTypes={types}
      hasSession={props.hasSession ?? true}
      events={props.events ?? []}
      newEventIds={['G1']}
      onDismiss={props.onDismiss ?? (() => undefined)}
    />
  )
}

afterEach(() => resetLiveEventTypes())

describe('LiveEventsPanel', () => {
  it('shows an alert with its real start, venue, distance, and links', () => {
    render(<Panel events={[GAME]} />)

    const card = screen.getByRole('listitem')
    expect(within(card).getByText('Derby night at the Bernabéu')).toBeInTheDocument()
    expect(within(card).getByText('A big local match, a short ride away.')).toBeInTheDocument()
    expect(card.querySelector('.live-card__facts')).toHaveTextContent('Estadio Santiago Bernabéu')
    expect(within(card).getByText('4.2 km')).toBeInTheDocument()
    expect(within(card).getByText(formatEventStart(GAME.event.startsAt)!)).toBeInTheDocument()
    expect(within(card).getByText('AI pick')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Tickets/ })).toHaveAttribute('href', GAME.event.url)
    expect(within(card).getByRole('link', { name: /Directions/ }).getAttribute('href')).toContain('destination=40.4531,-3.6883')
    expect(screen.getByText(/Event data from Ticketmaster/)).toBeInTheDocument()
  })

  it('remembers which kinds of event to alert about, and can turn alerts off', async () => {
    const user = userEvent.setup()
    render(<Panel hasSession={false} />)

    expect(screen.getByRole('button', { name: 'Sports' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Start Travel Mode to get alerts/)).toBeInTheDocument()
    for (const name of ['Sports', 'Music', 'Arts & Theatre', 'Family']) {
      await user.click(screen.getByRole('button', { name }))
    }

    expect(screen.getByText(/Event alerts are off/)).toBeInTheDocument()
    expect(JSON.parse(window.localStorage.getItem('roam.liveEvents.v1')!)).toEqual([])
  })

  it('labels sample events and lets an alert be dismissed', async () => {
    const user = userEvent.setup()
    const dismissed: string[] = []
    render(<Panel events={[{ ...GAME, event: { ...GAME.event, source: 'sample' }, aiWritten: false }]} onDismiss={(id) => dismissed.push(id)} />)

    expect(screen.getByText(/Sample events/)).toBeInTheDocument()
    expect(screen.queryByText('AI pick')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss Real Madrid vs Sevilla' }))
    expect(dismissed).toEqual(['G1'])
  })
})
