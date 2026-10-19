import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Clipboard,
  Footprints,
  Bus,
  Car,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Printer,
  Route,
  Trash2,
  Users,
} from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { PhotoCredit } from '../components/common/PhotoCredit'
import { AppLayout } from '../components/layout/AppLayout'
import { TripSteps } from '../components/trip/TripSteps'
import { primaryCategory } from '../data/categories'
import { findCity, type City } from '../data/destinations'
import { usePlacePhoto } from '../hooks/usePlacePhoto'
import {
  dayDate,
  formatDateRange,
  formatDayDate,
  relinkDay,
  timeDay,
  toIcs,
  toPlainText,
  updateItinerary,
  useItineraries,
  type Itinerary,
  type TimedStop,
} from '../services/itinerary'
import { lastExploredCity } from '../services/lastCity'
import { formatCategory } from '../services/recommendationFormat'
import { formatClock, formatKm } from '../services/routePlanner'
import { formatMinutes, type TravelMode } from '../services/tripStore'

const TOAST_MS = 4000
const MAX_TRAVELERS = 12
const MAX_DAYS = 14

const MODE: Record<TravelMode, { word: string; icon: typeof Footprints }> = {
  walk: { word: 'walk', icon: Footprints },
  transit: { word: 'transit', icon: Bus },
  drive: { word: 'drive', icon: Car },
}

/** /itinerary opens the itinerary of the last explored city, or any saved one. */
export function ItineraryRedirect() {
  const itineraries = useItineraries()
  const last = findCity(lastExploredCity())?.id
  const cityId = last && itineraries[last] ? last : (Object.keys(itineraries)[0] ?? last ?? 'madrid')
  return <Navigate to={`/trip/${cityId}/itinerary`} replace />
}

export function ItineraryPage() {
  const { cityId } = useParams()
  const city = findCity(cityId)
  const itinerary = useItineraries()[city?.id ?? '']
  if (!city) {
    return (
      <AppLayout active="itinerary">
        <div className="explore-missing">
          <div className="tm-card state-card">
            <h1 className="state-card__title">We don&apos;t know that city yet</h1>
            <Link className="tm-btn tm-btn--primary tm-btn--sm" to="/">
              Choose a destination
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }
  if (!itinerary) {
    return (
      <AppLayout active="itinerary">
        <div className="explore-container route-page__empty">
          <div className="tm-card state-card">
            <span className="state-card__icon" aria-hidden="true">
              <CalendarDays size={26} />
            </span>
            <h1 className="state-card__title">No {city.name} itinerary yet</h1>
            <p className="state-card__text">
              Optimize your route, then choose <strong>Save My Itinerary</strong> to plan it day by day.
            </p>
            <Link className="tm-btn tm-btn--primary tm-btn--sm" to={`/trip/${city.id}`}>
              Open My Trip
            </Link>
          </div>
        </div>
      </AppLayout>
    )
  }
  return <ItineraryView key={city.id} city={city} itinerary={itinerary} />
}

interface Toast {
  message: string
  undo?: Itinerary
}

function minutesToInput(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function inputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function ItineraryView({ city, itinerary }: { city: City; itinerary: Itinerary }) {
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<number | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const dayIndex = Math.min(active, itinerary.days.length - 1)
  const day = itinerary.days[dayIndex]!
  const timed = timeDay(day)
  const totalStops = itinerary.days.reduce((sum, d) => sum + d.stops.length, 0)
  const LegIcon = MODE[itinerary.mode].icon

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  // Close the export menu on Escape or a click elsewhere.
  useEffect(() => {
    if (!exportOpen) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setExportOpen(false)
    const onClick = (event: MouseEvent) => {
      if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [exportOpen])

  function flash(next: Toast) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    setToast(next)
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS)
  }

  /** Applies a change, re-estimating any leg whose previous stop moved. */
  function change(update: (current: Itinerary) => Itinerary, message?: string) {
    const before = itinerary
    updateItinerary(city.id, (current) => {
      const next = update(current)
      return { ...next, days: next.days.map((d) => relinkDay(d, next.start, next.mode)) }
    })
    if (message) flash({ message, undo: before })
  }

  function removeStop(placeId: string, name: string) {
    change(
      (current) => ({
        ...current,
        days: current.days.map((d, i) => (i === dayIndex ? { ...d, stops: d.stops.filter((s) => s.place.placeId !== placeId) } : d)),
      }),
      `${name} removed`,
    )
  }

  function moveStop(placeId: string, to: number) {
    const stop = day.stops.find((s) => s.place.placeId === placeId)
    if (!stop || to === dayIndex) return
    change(
      (current) => ({
        ...current,
        days: current.days.map((d, i) => {
          if (i === dayIndex) return { ...d, stops: d.stops.filter((s) => s.place.placeId !== placeId) }
          if (i === to) return { ...d, stops: [...d.stops, { ...stop, fixedStart: undefined }] }
          return d
        }),
      }),
      `${stop.place.name} moved to Day ${to + 1}`,
    )
  }

  function setStart(placeId: string, minutes: number | undefined) {
    change((current) => ({
      ...current,
      days: current.days.map((d, i) =>
        i === dayIndex ? { ...d, stops: d.stops.map((s) => (s.place.placeId === placeId ? { ...s, fixedStart: minutes } : s)) } : d,
      ),
    }))
  }

  function addDay() {
    if (itinerary.days.length >= MAX_DAYS) return
    change((current) => ({ ...current, days: [...current.days, { startMinutes: 9 * 60, stops: [] }] }))
    setActive(itinerary.days.length)
    flash({ message: `Day ${itinerary.days.length + 1} added` })
  }

  function removeDay() {
    change(
      (current) => ({ ...current, days: current.days.filter((_, i) => i !== dayIndex) }),
      `Day ${dayIndex + 1} removed`,
    )
    setActive(Math.max(0, dayIndex - 1))
  }

  function undo() {
    if (toast?.undo) {
      const previous = toast.undo
      updateItinerary(city.id, () => previous)
    }
    setToast(null)
  }

  function exportCalendar() {
    setExportOpen(false)
    download(`${city.id}-itinerary.ics`, toIcs(itinerary, city.name, city.timeZone), 'text/calendar;charset=utf-8')
    flash({ message: 'Calendar file downloaded' })
  }

  function exportPrint() {
    setExportOpen(false)
    window.print()
  }

  async function exportText() {
    setExportOpen(false)
    try {
      await navigator.clipboard.writeText(toPlainText(itinerary, city.name, formatClock))
      flash({ message: 'Itinerary copied as text' })
    } catch {
      flash({ message: "Couldn't copy. Your browser blocked the clipboard." })
    }
  }

  const summary = {
    km: timed.reduce((sum, s) => sum + s.leg.km, 0),
    travel: timed.reduce((sum, s) => sum + s.leg.minutes, 0),
    visit: timed.reduce((sum, s) => sum + s.visitMinutes, 0),
    end: timed.at(-1)?.end,
  }
  const anyEstimated = timed.some((s) => s.leg.estimated)

  return (
    <AppLayout active="itinerary">
      <div className="trip itinerary">
        <div className="explore-container trip__main">
          <TripSteps current={3} />

          <header className="tm-card itin-head">
            <div className="itin-head__banner tone-tile" aria-hidden="true" />
            <div className="itin-head__body">
              <div className="itin-head__top">
                <div className="itin-head__title">
                  <span className="itin-saved">
                    <Check size={14} strokeWidth={3} aria-hidden="true" />
                    Saved on this device
                  </span>
                  <h1 className="trip-head__title">My {city.name} Itinerary</h1>
                </div>
                <div className="itin-actions">
                  <Link className="tm-btn tm-btn--ghost tm-btn--sm" to={`/trip/${city.id}`}>
                    <Pencil size={16} aria-hidden="true" />
                    Edit Trip
                  </Link>
                  <Link className="tm-btn tm-btn--ghost tm-btn--sm" to={`/trip/${city.id}/route`}>
                    <MapPin size={16} aria-hidden="true" />
                    View on Map
                  </Link>
                  <Link className="tm-btn tm-btn--ghost tm-btn--sm" to={`/trip/${city.id}/route`}>
                    <Route size={16} aria-hidden="true" />
                    Re-optimize
                  </Link>
                  <div className="itin-export" ref={exportRef}>
                    <button
                      type="button"
                      className="tm-btn tm-btn--primary tm-btn--sm"
                      aria-expanded={exportOpen}
                      aria-haspopup="menu"
                      onClick={() => setExportOpen((open) => !open)}
                    >
                      Export Itinerary
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                    {exportOpen && (
                      <div className="tm-card itin-menu" role="menu">
                        <button type="button" role="menuitem" onClick={exportCalendar}>
                          <CalendarPlus size={18} aria-hidden="true" />
                          Calendar file (.ics)
                        </button>
                        <button type="button" role="menuitem" onClick={exportPrint}>
                          <Printer size={18} aria-hidden="true" />
                          Print or save as PDF
                        </button>
                        <button type="button" role="menuitem" onClick={() => void exportText()}>
                          <Clipboard size={18} aria-hidden="true" />
                          Copy as text
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <dl className="itin-facts">
                <div>
                  <dt>Destination</dt>
                  <dd>
                    {city.name}, {city.country}
                  </dd>
                </div>
                <div>
                  <dt>
                    <label htmlFor="itin-start">Travel dates</label>
                  </dt>
                  <dd className="itin-facts__dates">
                    <input
                      id="itin-start"
                      className="itin-input"
                      type="date"
                      value={itinerary.startDate}
                      aria-describedby="itin-range"
                      onChange={(event) => {
                        const value = event.target.value
                        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) change((current) => ({ ...current, startDate: value }))
                      }}
                    />
                    <span id="itin-range">{formatDateRange(itinerary)}</span>
                  </dd>
                </div>
                <div>
                  <dt id="itin-travelers">Travelers</dt>
                  <dd className="itin-stepper" role="group" aria-labelledby="itin-travelers">
                    <button
                      type="button"
                      className="trip-mini"
                      aria-label="Fewer travelers"
                      disabled={itinerary.travelers <= 1}
                      onClick={() => change((current) => ({ ...current, travelers: current.travelers - 1 }))}
                    >
                      <Minus size={16} aria-hidden="true" />
                    </button>
                    <span aria-live="polite">
                      <Users size={16} aria-hidden="true" /> {itinerary.travelers}
                    </span>
                    <button
                      type="button"
                      className="trip-mini"
                      aria-label="More travelers"
                      disabled={itinerary.travelers >= MAX_TRAVELERS}
                      onClick={() => change((current) => ({ ...current, travelers: current.travelers + 1 }))}
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Attractions</dt>
                  <dd>
                    {totalStops} {totalStops === 1 ? 'place' : 'places'}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          <div className="itin-days" role="tablist" aria-label="Days">
            {itinerary.days.map((d, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                id={`day-tab-${i}`}
                aria-controls="day-panel"
                aria-selected={i === dayIndex}
                className={`itin-day${i === dayIndex ? ' itin-day--on' : ''}`}
                onClick={() => {
                  setActive(i)
                  setEditing(null)
                }}
              >
                Day {i + 1}
                <small>
                  {formatDayDate(dayDate(itinerary, i))} · {d.stops.length}
                </small>
              </button>
            ))}
            {itinerary.days.length < MAX_DAYS && (
              <button type="button" className="itin-day itin-day--add" onClick={addDay}>
                <Plus size={16} aria-hidden="true" />
                Add Day
              </button>
            )}
          </div>

          <section className="itin-print" aria-hidden="true">
            {itinerary.days.map((d, i) => (
              <div key={i}>
                <h2>
                  Day {i + 1} · {formatDayDate(dayDate(itinerary, i))}
                </h2>
                <ol>
                  {timeDay(d).map((stop) => (
                    <li key={stop.place.placeId}>
                      <strong>
                        {formatClock(stop.begin)} – {formatClock(stop.end)}
                      </strong>
                      <span>
                        <strong>{stop.place.name}</strong> · {formatKm(stop.leg.km)}, {formatMinutes(stop.leg.minutes)}{' '}
                        {MODE[itinerary.mode].word} before
                      </span>
                    </li>
                  ))}
                  {d.stops.length === 0 && <li>Nothing planned</li>}
                </ol>
              </div>
            ))}
          </section>

          <div className="itin-layout">
            <section id="day-panel" role="tabpanel" aria-labelledby={`day-tab-${dayIndex}`} className="itin-panel">
              <div className="itin-panel__head">
                <h2 className="itin-panel__title">
                  Day {dayIndex + 1} · {formatDayDate(dayDate(itinerary, dayIndex))}
                </h2>
                <label className="itin-daystart">
                  Day starts
                  <input
                    className="itin-input"
                    type="time"
                    value={minutesToInput(day.startMinutes)}
                    onChange={(event) => {
                      const minutes = inputToMinutes(event.target.value)
                      if (minutes != null)
                        change((current) => ({
                          ...current,
                          days: current.days.map((d, i) => (i === dayIndex ? { ...d, startMinutes: minutes } : d)),
                        }))
                    }}
                  />
                </label>
              </div>

              {timed.length > 0 ? (
                <ol className="itin-list">
                  {timed.map((stop, i) => (
                    <li key={stop.place.placeId} className="itin-item">
                      <div className="route-leg">
                        <span className="route-leg__line" aria-hidden="true" />
                        <LegIcon size={15} aria-hidden="true" />
                        <span>
                          {stop.leg.estimated && '≈ '}
                          {formatKm(stop.leg.km)} · {formatMinutes(stop.leg.minutes)} {MODE[itinerary.mode].word}
                          <span className="itin-leg__from">
                            {' '}
                            from {i === 0 ? itinerary.startName : timed[i - 1]!.place.name}
                          </span>
                        </span>
                      </div>
                      <StopCard
                        city={city}
                        stop={stop}
                        days={itinerary.days.length}
                        dayIndex={dayIndex}
                        editing={editing === stop.place.placeId}
                        onEdit={() => setEditing((current) => (current === stop.place.placeId ? null : stop.place.placeId))}
                        onRemove={() => removeStop(stop.place.placeId, stop.place.name)}
                        onMove={(to) => moveStop(stop.place.placeId, to)}
                        onStart={(minutes) => setStart(stop.place.placeId, minutes)}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="tm-card state-card">
                  <span className="state-card__icon" aria-hidden="true">
                    <CalendarDays size={26} />
                  </span>
                  <h3 className="state-card__title">Nothing planned for this day</h3>
                  <p className="state-card__text">
                    Move a stop here from another day with its <strong>Edit</strong> button, or add places and re-optimize.
                  </p>
                  <div className="itin-empty-actions">
                    <Link className="tm-btn tm-btn--primary tm-btn--sm" to={`/explore/${city.id}`}>
                      Add attractions
                    </Link>
                    {itinerary.days.length > 1 && (
                      <button type="button" className="tm-btn tm-btn--danger tm-btn--sm" onClick={removeDay}>
                        <Trash2 size={16} aria-hidden="true" />
                        Remove this day
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <aside className="tm-card itin-summary" aria-labelledby="itin-summary-title">
              <h2 id="itin-summary-title" className="trip-summary__title">
                Day {dayIndex + 1} summary
              </h2>
              <dl className="itin-rows">
                <div>
                  <dt>Total attractions</dt>
                  <dd>{timed.length}</dd>
                </div>
                <div>
                  <dt>{itinerary.mode === 'walk' ? 'Walking distance' : 'Travel distance'}</dt>
                  <dd>{formatKm(summary.km)}</dd>
                </div>
                <div>
                  <dt>Travel time</dt>
                  <dd className="trip-stat--coral">{formatMinutes(summary.travel)}</dd>
                </div>
                <div>
                  <dt>Sightseeing time</dt>
                  <dd className="trip-stat--blue">{formatMinutes(summary.visit)}</dd>
                </div>
                <div>
                  <dt>Day ends</dt>
                  <dd>{summary.end != null ? formatClock(summary.end) : '—'}</dd>
                </div>
              </dl>
              <p className="trip-field__hint">
                {itinerary.source === 'google' && !anyEstimated
                  ? 'Travel times are from Google street routes.'
                  : '≈ marks travel times estimated from distance. Re-optimize for Google street routes.'}{' '}
                Entry fees and fares are not included.
              </p>
            </aside>
          </div>
        </div>

        {toast && (
          <div className="tm-toast" role="status">
            <span className="tm-toast__icon" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
            {toast.message}
            {toast.undo && (
              <button type="button" className="tm-toast__action" onClick={undo}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}

interface StopCardProps {
  city: City
  stop: TimedStop
  days: number
  dayIndex: number
  editing: boolean
  onEdit: () => void
  onRemove: () => void
  onMove: (day: number) => void
  onStart: (minutes: number | undefined) => void
}

function StopCard({ city, stop, days, dayIndex, editing, onEdit, onRemove, onMove, onStart }: StopCardProps) {
  const { ref, photo } = usePlacePhoto<HTMLSpanElement>(stop.place.placeId)
  const tone = primaryCategory(stop.place.category).tone
  const name = stop.place.name

  return (
    <article className="tm-card itin-stop">
      <div className="itin-stop__time" aria-hidden="true">
        {formatClock(stop.begin)}
      </div>
      <span ref={ref} className="itin-stop__photo tone-tile" style={{ backgroundColor: tone }}>
        {photo && <img className="card-photo" src={photo.url} alt="" loading="lazy" />}
      </span>
      <div className="itin-stop__body">
        <div className="itin-stop__top">
          <div className="itin-stop__text">
            <Link className="trip-item__name" to={`/places/${city.id}/${encodeURIComponent(stop.place.placeId)}`}>
              {name}
            </Link>
            <span className="itin-stop__when">
              {formatClock(stop.begin)} – {formatClock(stop.end)} · {formatMinutes(stop.visitMinutes)}
            </span>
            {stop.place.category && <span className="trip-item__category">{formatCategory(stop.place.category)}</span>}
          </div>
          <span className="trip-item__controls">
            <button
              type="button"
              className="itin-mini"
              aria-expanded={editing}
              aria-label={`Edit ${name}`}
              onClick={onEdit}
            >
              Edit
            </button>
            <button type="button" className="trip-mini trip-mini--danger" aria-label={`Remove ${name}`} onClick={onRemove}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </span>
        </div>
        {stop.begin > stop.arrive && (
          <p className="itin-stop__note">Arrive {formatClock(stop.arrive)}; free time before this starts.</p>
        )}
        {stop.tooEarly && (
          <p className="itin-stop__note itin-stop__note--warn">
            You can&apos;t get here before {formatClock(stop.arrive)}, so it starts then.
          </p>
        )}
        {photo && <PhotoCredit photo={photo} className="itin-stop__credit" />}
        {editing && (
          <div className="itin-edit">
            <label>
              Start time
              <input
                className="itin-input"
                type="time"
                value={minutesToInput(stop.fixedStart ?? stop.begin)}
                onChange={(event) => {
                  const minutes = inputToMinutes(event.target.value)
                  if (minutes != null) onStart(minutes)
                }}
              />
            </label>
            {stop.fixedStart != null && (
              <button type="button" className="tm-btn tm-btn--ghost tm-btn--sm" onClick={() => onStart(undefined)}>
                Start on arrival
              </button>
            )}
            {days > 1 && (
              <label>
                Move to
                <select
                  className="route-select"
                  value={dayIndex}
                  onChange={(event) => onMove(Number(event.target.value))}
                >
                  {Array.from({ length: days }, (_, i) => (
                    <option key={i} value={i}>
                      Day {i + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="tm-btn tm-btn--primary tm-btn--sm" onClick={onEdit}>
              Done
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
