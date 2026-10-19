import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, CloudRain, Compass, LocateFixed, MapPin, Plus, Send, Sparkles, Sun, Moon, Cloud } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { primaryCategory } from '../data/categories'
import { findCity, findCountry, type City } from '../data/destinations'
import { localDateTime, updateChatPrefs, useChatPrefs } from '../services/chatPrefs'
import { deviceLocation, rememberDeviceLocation } from '../services/deviceLocation'
import { describeLocationError, getCurrentLocation, LocationError } from '../services/geolocation'
import { lastExploredCity } from '../services/lastCity'
import { formatCategory } from '../services/recommendationFormat'
import { askRoam, describeTravelApiError } from '../services/travelApi'
import { formatMinutes, toggleTripPlace, useTripStore } from '../services/tripStore'
import type { ChatReply, ChatSuggestion, ChatTurn, LocationRequest } from '../types/api'
import { INTERESTS } from '../types/travel'

const MAX_TURNS_SENT = 12
const HISTORY_KEY = 'roam.chat.v1'

const QUICK_PROMPTS = [
  'What should I do right now?',
  'Somewhere indoors nearby',
  'Cheap ideas close to me',
  'Plan my next 2 hours',
  'Where should I eat?',
]

const INTEREST_LABELS: Record<string, string> = {
  HISTORY: 'History',
  FOOD: 'Food',
  ART: 'Art',
  NATURE: 'Nature',
  SHOPPING: 'Shopping',
  LOCAL_EXPERIENCES: 'Local life',
}

interface Message {
  role: 'USER' | 'ASSISTANT'
  content: string
  reply?: Omit<ChatReply, 'reply'>
  error?: boolean
}

/** History lives in this tab only, per city, without any location. */
function loadHistory(cityId: string): Message[] {
  try {
    const all = JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) ?? '{}') as Record<string, Message[]>
    return Array.isArray(all[cityId]) ? all[cityId] : []
  } catch {
    return []
  }
}

function saveHistory(cityId: string, messages: Message[]) {
  try {
    const all = JSON.parse(window.sessionStorage.getItem(HISTORY_KEY) ?? '{}') as Record<string, Message[]>
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify({ ...all, [cityId]: messages.slice(-40) }))
  } catch {
    // Storage blocked: the conversation still works for this visit.
  }
}

export function AssistantPage() {
  const city = findCity(lastExploredCity()) ?? findCity('madrid')!
  return <Assistant key={city.id} city={city} />
}

function Assistant({ city }: { city: City }) {
  const prefs = useChatPrefs()
  const store = useTripStore()
  const currency = findCountry(city.country)?.currency ?? 'EUR'
  const tripStops = (store.trips[city.id] ?? []).map((place) => place.name)
  const [messages, setMessages] = useState<Message[]>(() => loadHistory(city.id))
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [device, setDevice] = useState<LocationRequest | null>(deviceLocation)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    saveHistory(city.id, messages)
  }, [city.id, messages])
  // Block bodies: newer browsers return a Promise from scrollIntoView, which React would take for a cleanup function.
  useEffect(() => {
    void endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages, sending])
  useEffect(() => () => abortRef.current?.abort(), [])

  const latest = [...messages].reverse().find((m) => m.reply?.weather)?.reply?.weather

  async function shareMyLocation() {
    setLocating(true)
    setLocationError(null)
    try {
      const location = await getCurrentLocation()
      rememberDeviceLocation(location)
      setDevice(location)
    } catch (error) {
      setLocationError(error instanceof LocationError ? describeLocationError(error.code) : "We couldn't get your location.")
    } finally {
      setLocating(false)
    }
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    const history = [...messages.filter((m) => !m.error), { role: 'USER' as const, content }]
    setMessages(history)
    setDraft('')
    setSending(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const turns: ChatTurn[] = history.slice(-MAX_TURNS_SENT).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }))
      const reply = await askRoam(
        {
          messages: turns,
          context: {
            location: device ?? city.location,
            placeName: device ? `${city.name} (near the traveler)` : city.name,
            // The traveler's own clock when they are there; otherwise the city's.
            localDateTime: localDateTime(new Date(), device ? undefined : city.ianaTimeZone),
            ...(prefs.interests.length > 0 ? { interests: prefs.interests } : {}),
            ...(prefs.budget != null ? { maxBudget: prefs.budget, currencyCode: currency } : {}),
            ...(prefs.hours != null ? { availableMinutes: Math.round(prefs.hours * 60) } : {}),
            ...(tripStops.length > 0 ? { tripStops: tripStops.slice(0, 25).map((name) => name.slice(0, 120)) } : {}),
          },
        },
        { signal: controller.signal },
      )
      const { reply: text, ...rest } = reply
      setMessages((current) => [...current, { role: 'ASSISTANT', content: text, reply: rest }])
    } catch (error) {
      if (controller.signal.aborted) return
      setMessages((current) => [
        ...current,
        { role: 'ASSISTANT', content: `I couldn't answer that. ${describeTravelApiError(error)}`, error: true },
      ])
    } finally {
      setSending(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    void send(draft)
  }

  return (
    <AppLayout active="assistant">
      <div className="assistant">
        <div className="explore-container assistant__inner">
          <header className="assistant-head">
            <span className="assistant-head__icon" aria-hidden="true">
              <Sparkles size={22} />
            </span>
            <div>
              <h1 className="assistant-head__title">Ask ROAM</h1>
              <p className="assistant-head__lead">
                What to do next in {city.name}, from where you are, the time, the weather, your interests, and your budget.
              </p>
            </div>
          </header>

          <section className="tm-card assistant-context" aria-label="What ROAM knows">
            <div className="assistant-context__row">
              {device ? (
                <span className="assistant-chip assistant-chip--on">
                  <LocateFixed size={14} aria-hidden="true" /> Using your location
                </span>
              ) : (
                <button type="button" className="assistant-chip" onClick={() => void shareMyLocation()} disabled={locating}>
                  <MapPin size={14} aria-hidden="true" />
                  {locating ? 'Finding you…' : `${city.name} centre · use my location`}
                </button>
              )}
              {latest && <WeatherChip weather={latest} />}
              <Link className="assistant-chip" to="/">
                <Compass size={14} aria-hidden="true" /> Change city
              </Link>
            </div>
            {locationError && (
              <p className="tm-error" role="alert">
                {locationError}
              </p>
            )}
            <fieldset className="assistant-context__interests">
              <legend className="visually-hidden">Interests</legend>
              {INTERESTS.map((interest) => (
                <button
                  key={interest}
                  type="button"
                  className="live-chip"
                  aria-pressed={prefs.interests.includes(interest)}
                  onClick={() =>
                    updateChatPrefs({
                      interests: prefs.interests.includes(interest)
                        ? prefs.interests.filter((i) => i !== interest)
                        : [...prefs.interests, interest],
                    })
                  }
                >
                  {INTEREST_LABELS[interest]}
                </button>
              ))}
            </fieldset>
            <div className="assistant-context__row">
              <label className="assistant-field">
                Budget ({currency})
                <input
                  className="itin-input"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="Any"
                  value={prefs.budget ?? ''}
                  onChange={(event) => updateChatPrefs({ budget: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })}
                />
              </label>
              <label className="assistant-field">
                Time I have
                <select
                  className="route-select"
                  value={prefs.hours ?? ''}
                  onChange={(event) => updateChatPrefs({ hours: event.target.value === '' ? null : Number(event.target.value) })}
                >
                  <option value="">Not sure</option>
                  {[1, 2, 3, 4, 6, 8].map((h) => (
                    <option key={h} value={h}>
                      {h} {h === 1 ? 'hour' : 'hours'}
                    </option>
                  ))}
                </select>
              </label>
              {tripStops.length > 0 && (
                <span className="assistant-note">
                  Knows your trip: {tripStops.length} {tripStops.length === 1 ? 'place' : 'places'}
                </span>
              )}
            </div>
          </section>

          <section className="assistant-thread" aria-label="Conversation" aria-live="polite" aria-busy={sending}>
            {messages.length === 0 && (
              <div className="assistant-empty">
                <p>Ask anything about your next move. Try:</p>
              </div>
            )}
            {messages.map((message, i) =>
              message.role === 'USER' ? (
                <div key={i} className="assistant-msg assistant-msg--user">
                  {message.content}
                </div>
              ) : (
                <div key={i} className={`assistant-msg assistant-msg--ai${message.error ? ' assistant-msg--error' : ''}`}>
                  <p className="assistant-msg__text">{message.content}</p>
                  {message.reply && message.reply.suggestions.length > 0 && (
                    <ul className="assistant-cards">
                      {message.reply.suggestions.map((suggestion) => (
                        <SuggestionCard key={suggestion.placeId} city={city} suggestion={suggestion} />
                      ))}
                    </ul>
                  )}
                  {message.reply && !message.reply.aiWritten && (
                    <p className="assistant-msg__meta">Rule-based picks: the AI was unavailable.</p>
                  )}
                </div>
              ),
            )}
            {sending && (
              <div className="assistant-msg assistant-msg--ai assistant-typing" aria-label="ROAM is thinking">
                <span />
                <span />
                <span />
              </div>
            )}
            <div ref={endRef} className="assistant-end" />
          </section>

          <div className="assistant-composer">
            <div className="assistant-prompts">
              {QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" className="assistant-chip" disabled={sending} onClick={() => void send(prompt)}>
                  {prompt}
                </button>
              ))}
            </div>
            <form className="assistant-form" onSubmit={onSubmit}>
              <label htmlFor="assistant-input" className="visually-hidden">
                Message ROAM
              </label>
              <textarea
                id="assistant-input"
                className="assistant-input"
                rows={1}
                maxLength={1000}
                placeholder="Ask what to do next…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(draft)
                  }
                }}
              />
              <button type="submit" className="tm-btn tm-btn--primary assistant-send" disabled={sending || !draft.trim()} aria-label="Send">
                <Send size={18} aria-hidden="true" />
              </button>
            </form>
            <p className="assistant-note">AI can make mistakes. Check opening hours and prices before you go.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function WeatherChip({ weather }: { weather: NonNullable<ChatReply['weather']> }) {
  const Icon = weather.rainLikely ? CloudRain : !weather.isDay ? Moon : /cloud|overcast|fog/i.test(weather.summary) ? Cloud : Sun
  return (
    <span className="assistant-chip">
      <Icon size={14} aria-hidden="true" />
      {weather.summary}
      {weather.temperatureC != null && ` · ${Math.round(weather.temperatureC)}°C`}
      {weather.rainLikely && ' · rain likely'}
    </span>
  )
}

function SuggestionCard({ city, suggestion }: { city: City; suggestion: ChatSuggestion }) {
  const store = useTripStore()
  const inTrip = (store.trips[city.id] ?? []).some((place) => place.placeId === suggestion.placeId)
  const category = suggestion.categories.join(', ')
  const tone = primaryCategory(category).tone
  return (
    <li className="assistant-card">
      <span className="assistant-card__tile tone-tile" style={{ backgroundColor: tone }} aria-hidden="true" />
      <div className="assistant-card__body">
        <Link className="assistant-card__name" to={`/places/${city.id}/${encodeURIComponent(suggestion.placeId)}`}>
          {suggestion.name}
        </Link>
        <span className="assistant-card__meta">
          {category && formatCategory(category)}
          {suggestion.distanceKm != null && ` · ${suggestion.distanceKm.toFixed(1)} km`}
          {suggestion.estimatedDurationMinutes != null && ` · ≈ ${formatMinutes(suggestion.estimatedDurationMinutes)}`}
        </span>
        <span className="assistant-card__reason">{suggestion.reason}</span>
        <div className="assistant-card__actions">
          <button
            type="button"
            className={`tm-btn tm-btn--sm ${inTrip ? 'tm-btn--added' : 'tm-btn--primary'}`}
            aria-pressed={inTrip}
            onClick={() =>
              toggleTripPlace({
                placeId: suggestion.placeId,
                cityId: city.id,
                name: suggestion.name,
                category,
                latitude: suggestion.latitude,
                longitude: suggestion.longitude,
                ...(suggestion.estimatedDurationMinutes != null
                  ? { estimatedDurationMinutes: suggestion.estimatedDurationMinutes }
                  : {}),
              })
            }
          >
            {inTrip ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
            {inTrip ? 'In your trip' : 'Add to trip'}
            <span className="visually-hidden"> {suggestion.name}</span>
          </button>
          <a
            className="tm-btn tm-btn--ghost tm-btn--sm"
            href={`https://www.google.com/maps/dir/?api=1&destination=${suggestion.latitude},${suggestion.longitude}&travelmode=walking`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Directions<span className="visually-hidden"> to {suggestion.name} (opens in a new tab)</span>
          </a>
        </div>
      </div>
    </li>
  )
}
