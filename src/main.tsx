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

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
