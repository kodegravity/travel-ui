import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles/variables.css'
import './styles/global.css'
import './styles/explorer.css'
import './styles/travelmate.css'
import './styles/home.css'
import './styles/explore-page.css'
import './styles/place-page.css'
import './styles/trip-page.css'
import './styles/route-page.css'
import './styles/itinerary-page.css'
import './styles/live-events.css'
import { registerNotificationWorker } from './services/notifications'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

registerNotificationWorker()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
