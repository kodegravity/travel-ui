import type { LiveSuggestion, RecommendationDto } from '../types/api'

export type NotificationStatus = NotificationPermission | 'unsupported'

/** Reports the browser notification permission without asking for it. */
export function getNotificationStatus(): NotificationStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/** Must be called from a user action (such as a button click), because browsers require it. */
export async function requestNotificationPermission(): Promise<NotificationStatus> {
  if (getNotificationStatus() === 'unsupported') return 'unsupported'
  return Notification.requestPermission()
}

/**
 * A system notification for new nearby places while the tab is in the background; in the foreground the page shows
 * the suggestion itself. This is not a background push: it only works while the page is open.
 */
export async function notifyNewPlaces(places: readonly RecommendationDto[]): Promise<void> {
  if (places.length === 0 || getNotificationStatus() !== 'granted' || !document.hidden) return
  const names = places
    .slice(0, 3)
    .map((place) => place.name)
    .join(', ')
  const title = `${places.length} new ${places.length === 1 ? 'place' : 'places'} nearby`
  await showSystemNotification(title, {
    body: names,
    tag: 'travel-session-updates',
    icon: '/favicon.svg',
    data: { url: '/travel-mode' },
  })
}

/**
 * Shows through the service worker when there is one (Android Chrome refuses page notifications), else the page.
 * Some browsers refuse both; the page still shows the update when the tab is opened.
 */
async function showSystemNotification(title: string, options: NotificationOptions): Promise<void> {
  const registration =
    'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined
  try {
    if (registration) {
      await registration.showNotification(title, options)
    } else {
      const notification = new Notification(title, options)
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
  } catch {
    // Notifications refused; nothing else to do.
  }
}

/**
 * Registers the notification-only service worker. Android Chrome can show notifications only through one, and a
 * click on a notification brings the app back. Best effort: without it, desktop browsers still notify.
 */
export function registerNotificationWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
}

/**
 * "9:00 PM", or "Tomorrow 2:25 AM" / "Sat 9:00 PM" when it is not today, in the traveler's own time zone (they are
 * where the event is).
 */
export function formatEventStart(startsAt: string | undefined, localTime?: string, now = new Date()): string | null {
  if (startsAt) {
    const start = new Date(startsAt)
    const time = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const days = Math.round(
      (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
        new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000,
    )
    if (days === 0) return time
    if (days === 1) return `Tomorrow ${time}`
    return `${start.toLocaleDateString([], { weekday: 'short' })} ${time}`
  }
  return localTime ? localTime.slice(0, 5) : null
}

/**
 * A system notification for each new live event alert, while the tab is in the background; in the foreground the
 * page shows the alert itself. Uses the service worker when there is one (required on Android), else the page.
 */
export async function notifyLiveEvents(suggestions: readonly LiveSuggestion[]): Promise<void> {
  if (suggestions.length === 0 || getNotificationStatus() !== 'granted' || !document.hidden) return
  for (const suggestion of suggestions.slice(0, 2)) {
    const start = formatEventStart(suggestion.event.startsAt, suggestion.event.localTime)
    const body = start ? `${suggestion.message} Starts ${start}.` : suggestion.message
    await showSystemNotification(suggestion.headline, {
      body,
      tag: `live-event-${suggestion.event.id}`,
      icon: '/favicon.svg',
      data: { url: '/travel-mode' },
    })
  }
}
