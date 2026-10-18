import { Navigate } from 'react-router-dom'
import { findCity } from '../data/destinations'
import { lastExploredCity } from '../services/lastCity'

const DEFAULT_CITY = 'madrid'

/** /explore without a city reopens the last explored one. */
export function ExploreRedirect() {
  const last = lastExploredCity()
  const cityId = findCity(last)?.id ?? DEFAULT_CITY
  return <Navigate to={`/explore/${cityId}`} replace />
}
