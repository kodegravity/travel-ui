import type { RecommendationDto } from '../types/api'

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
 * Shows an in-tab notification when new places arrive while the tab is hidden.
 * This is not a background push: it only works while the page is open.
 */
export function notifyNewPlaces(places: RecommendationDto[]): void {
  if (places.length === 0 || getNotificationStatus() !== 'granted' || !document.hidden) return

  const names = places
    .slice(0, 3)
    .map((place) => place.name)
    .join(', ')
  const title = `${places.length} new ${places.length === 1 ? 'place' : 'places'} nearby`
  const notification = new Notification(title, { body: names, tag: 'travel-session-updates' })
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
