import { useEffect } from 'react'
import { useAuth } from '../../auth/useAuth'
import { startPlanSync } from '../../services/planSync'

/** Keeps trips and itineraries synced with the account while a traveler is signed in. Renders nothing. */
export function PlanSync() {
  const { status } = useAuth()
  useEffect(() => (status === 'authenticated' ? startPlanSync() : undefined), [status])
  return null
}
