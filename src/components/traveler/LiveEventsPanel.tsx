import { Bus, CalendarClock, ExternalLink, MapPin, Music, Sparkles, Theater, Trophy, Users, X } from 'lucide-react'
import { formatEventStart } from '../../services/notifications'
import { toggleLiveEventType } from '../../services/liveEventPrefs'
import type { EventType, LiveSuggestion } from '../../types/api'

const TYPES: { id: EventType; label: string; icon: typeof Trophy; tone: string }[] = [
  { id: 'SPORTS', label: 'Sports', icon: Trophy, tone: '#166534' },
  { id: 'MUSIC', label: 'Music', icon: Music, tone: '#6D28D9' },
  { id: 'ARTS', label: 'Arts & Theatre', icon: Theater, tone: '#9A3412' },
  { id: 'FAMILY', label: 'Family', icon: Users, tone: '#0E7490' },
]

const TONE: Record<EventType, string> = { SPORTS: '#166534', MUSIC: '#6D28D9', ARTS: '#9A3412', FAMILY: '#0E7490', OTHER: '#334155' }

export interface LiveEventsPanelProps {
  eventTypes: readonly EventType[]
  hasSession: boolean
  events: readonly LiveSuggestion[]
  newEventIds: readonly string[]
  onDismiss: (eventId: string) => void
}

/** "Happening near you": which kinds of live event to hear about, and the alerts so far this session. */
export function LiveEventsPanel({ eventTypes, hasSession, events, newEventIds, onDismiss }: LiveEventsPanelProps) {
  const off = eventTypes.length === 0
  const sample = events.some((item) => item.event.source === 'sample')
  const ticketmaster = events.some((item) => item.event.source === 'ticketmaster')

  return (
    <section className="live-events" aria-labelledby="live-events-title">
      <div className="live-events__head">
        <h2 id="live-events-title" className="live-events__title">
          <CalendarClock size={18} aria-hidden="true" />
          Happening near you
        </h2>
        {events.length > 0 && <span className="live-events__count">{events.length}</span>}
      </div>

      <fieldset className="live-events__types">
        <legend className="visually-hidden">Alert me about</legend>
        {TYPES.map((type) => {
          const Icon = type.icon
          return (
            <button
              key={type.id}
              type="button"
              className="live-chip"
              aria-pressed={eventTypes.includes(type.id)}
              onClick={() => toggleLiveEventType(type.id)}
            >
              <Icon size={14} aria-hidden="true" />
              {type.label}
            </button>
          )
        })}
      </fieldset>

      {off ? (
        <p className="field-hint">Event alerts are off. Pick a kind of event to turn them on.</p>
      ) : events.length === 0 ? (
        <p className="field-hint">
          {hasSession
            ? "No events nearby yet. As you move, we'll check for games, concerts, and shows in the next few hours."
            : 'Start Travel Mode to get alerts for games, concerts, and shows near you as you move.'}
        </p>
      ) : (
        <ul className="live-events__list" aria-live="polite">
          {events.map((item) => (
            <LiveEventCard key={item.event.id} item={item} isNew={newEventIds.includes(item.event.id)} onDismiss={onDismiss} />
          ))}
        </ul>
      )}

      {(ticketmaster || sample) && (
        <p className="live-events__source">
          {ticketmaster && 'Event data from Ticketmaster. '}
          {sample && 'Sample events: no real listings are connected yet.'}
        </p>
      )}
    </section>
  )
}

function LiveEventCard({ item, isNew, onDismiss }: { item: LiveSuggestion; isNew: boolean; onDismiss: (id: string) => void }) {
  const { event } = item
  const start = formatEventStart(event.startsAt, event.localTime)
  const directions =
    event.latitude != null && event.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}&travelmode=walking`
      : null
  const TypeIcon = TYPES.find((type) => type.id === event.type)?.icon ?? Bus

  return (
    <li className={`live-card${isNew ? ' live-card--new' : ''}`}>
      <div className="live-card__media tone-tile" style={{ backgroundColor: TONE[event.type] }} aria-hidden="true">
        {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" /> : <TypeIcon size={26} strokeWidth={1.6} />}
      </div>
      <div className="live-card__body">
        <div className="live-card__top">
          <p className="live-card__headline">{item.headline}</p>
          <button
            type="button"
            className="suggestion-alert__dismiss"
            aria-label={`Dismiss ${event.name}`}
            onClick={() => onDismiss(event.id)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="live-card__message">{item.message}</p>
        <p className="live-card__facts">
          {start && <span className="live-card__start">{start}</span>}
          {!start && event.localDate && <span>Today · time to be announced</span>}
          {event.venueName && (
            <span>
              <MapPin size={13} aria-hidden="true" /> {event.venueName}
            </span>
          )}
          {event.distanceKm != null && <span>{event.distanceKm.toFixed(1)} km</span>}
        </p>
        <div className="live-card__actions">
          {item.aiWritten && (
            <span className="live-card__ai">
              <Sparkles size={13} aria-hidden="true" /> AI pick
            </span>
          )}
          {event.url && (
            <a className="tm-btn tm-btn--primary tm-btn--sm" href={event.url} target="_blank" rel="noopener noreferrer">
              Tickets
              <ExternalLink size={14} aria-hidden="true" />
              <span className="visually-hidden"> for {event.name} (opens in a new tab)</span>
            </a>
          )}
          {directions && (
            <a className="tm-btn tm-btn--ghost tm-btn--sm" href={directions} target="_blank" rel="noopener noreferrer">
              Directions
              <span className="visually-hidden"> to {event.venueName ?? event.name} (opens in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </li>
  )
}
