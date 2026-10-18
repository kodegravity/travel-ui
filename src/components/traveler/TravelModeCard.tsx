import { MapPin, Navigation } from 'lucide-react'
import { Button } from '../common/Button'
import type { TravelSessionPhase } from '../../hooks/useTravelSession'
import type { NotificationStatus } from '../../services/notifications'

export interface TravelModeCardProps {
  phase: TravelSessionPhase
  hasSession: boolean
  locationShared: boolean
  lastCheckedAt: string | null
  notificationStatus: NotificationStatus
  canStart: boolean
  canStop: boolean
  onStart: () => void
  onStop: () => void
  onEnableNotifications: () => void
}

function formatCheckedTime(isoTimestamp: string): string | null {
  const date = new Date(isoTimestamp)
  return Number.isNaN(date.getTime()) ? null : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function statusLabel(phase: TravelSessionPhase, hasSession: boolean): string {
  if (phase === 'STOPPING_SESSION') return 'Stopping'
  if (hasSession) return 'Exploring'
  if (phase === 'REQUESTING_LOCATION' || phase === 'STARTING_SESSION') return 'Connecting'
  return 'Not Exploring'
}

export function TravelModeCard({
  phase,
  hasSession,
  locationShared,
  lastCheckedAt,
  notificationStatus,
  canStart,
  canStop,
  onStart,
  onStop,
  onEnableNotifications,
}: TravelModeCardProps) {
  const noteId = 'travel-mode-note'
  const status = statusLabel(phase, hasSession)

  return (
    <section className="card travel-mode" aria-labelledby="travel-mode-title">
      <div className="card__header">
        <span className="card__icon">
          <Navigation size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 id="travel-mode-title" className="card__title">
          Active Travel Mode
        </h2>
      </div>

      <dl className="travel-mode__status">
        <div className="travel-mode__row">
          <dt>Status</dt>
          <dd>
            <span className="status-pill">{status}</span>
          </dd>
        </div>
        <div className="travel-mode__row">
          <dt>Location</dt>
          <dd className="travel-mode__location">
            <MapPin size={16} strokeWidth={2} aria-hidden="true" />
            {locationShared ? 'Shared' : 'Not Shared'}
          </dd>
        </div>
        {hasSession && lastCheckedAt && formatCheckedTime(lastCheckedAt) && (
          <div className="travel-mode__row">
            <dt>Last checked</dt>
            <dd>{formatCheckedTime(lastCheckedAt)}</dd>
          </div>
        )}
      </dl>

      {hasSession && (
        <div className="travel-mode__alerts">
          {notificationStatus === 'default' && (
            <Button variant="secondary" className="btn--block" onClick={onEnableNotifications}>
              Alert me to new places
            </Button>
          )}
          {notificationStatus === 'granted' && <p className="field-hint">New-place alerts are on while this tab is open.</p>}
          {notificationStatus === 'denied' && (
            <p className="field-hint">Notifications are blocked. Allow them in your browser settings to get alerts.</p>
          )}
          <p className="field-hint">Nearby places refresh automatically about every 5 minutes while this tab is open.</p>
        </div>
      )}

      {hasSession ? (
        <Button variant="secondary" className="btn--block" onClick={onStop} disabled={!canStop}>
          Stop Exploring
        </Button>
      ) : (
        <>
          <Button className="btn--block" onClick={onStart} disabled={!canStart} aria-describedby={noteId}>
            Start Exploring
          </Button>
          <p id={noteId} className="field-hint">
            Your browser will ask for your location so we can find nearby experiences. Your location
            is sent to the travel service only while exploring.
          </p>
        </>
      )}
    </section>
  )
}
