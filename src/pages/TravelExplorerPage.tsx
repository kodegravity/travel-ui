import { useState } from 'react'
import { AppLayout } from '../components/layout/AppLayout'
import { RecommendationResults } from '../components/traveler/RecommendationResults'
import { TravelModeCard } from '../components/traveler/TravelModeCard'
import { TravelPreferencesForm } from '../components/traveler/TravelPreferencesForm'
import { useTravelPreferences } from '../hooks/useTravelPreferences'
import { useTravelSession } from '../hooks/useTravelSession'
import {
  getNotificationStatus,
  requestNotificationPermission,
  type NotificationStatus,
} from '../services/notifications'

export function TravelExplorerPage() {
  const preferences = useTravelPreferences()
  const session = useTravelSession()
  const { state } = session
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>(getNotificationStatus)

  async function handleEnableNotifications() {
    setNotificationStatus(await requestNotificationPermission())
  }

  function handleStart() {
    const validPreferences = preferences.validate()
    if (validPreferences) {
      void session.start(validPreferences)
    }
  }

  return (
    <AppLayout>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container hero__inner">
          <p className="eyebrow">AI Travel Companion</p>
          <h1 id="hero-title" className="hero__title">
            <span>Discover the moment.</span>{' '}
            <span className="hero__title-accent">Not just the destination.</span>
          </h1>
          <p className="hero__lead">
            Your AI travel companion helps you discover experiences nearby based on your
            interests, available time, and budget.
          </p>
        </div>
      </section>

      <div className="container explorer">
        <div className="explorer__preferences">
          <TravelPreferencesForm preferences={preferences} />
        </div>

        <div className="explorer__travel-mode">
          <TravelModeCard
            phase={state.phase}
            hasSession={state.sessionId !== null}
            locationShared={state.locationShared}
            lastCheckedAt={state.lastCheckedAt}
            notificationStatus={notificationStatus}
            canStart={session.canStart}
            canStop={session.canStop}
            onStart={handleStart}
            onStop={() => void session.stop()}
            onEnableNotifications={() => void handleEnableNotifications()}
          />
        </div>

        <section className="explorer__results" aria-labelledby="results-title">
          <h2 id="results-title" className="section-title">
            Recommendations
          </h2>
          <RecommendationResults
            state={state}
            isBusy={session.isBusy}
            canRefresh={session.canRefresh}
            onRefresh={() => void session.refresh()}
          />
        </section>
      </div>
    </AppLayout>
  )
}
