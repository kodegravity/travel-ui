import type { ReactNode } from 'react'
import { Header, type NavKey } from './Header'

export interface AppLayoutProps {
  children: ReactNode
  /** Highlights the matching navbar link. */
  active?: NavKey
}

export function AppLayout({ children, active }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Header active={active} />
      <main id="main-content" className="app-main">
        {children}
      </main>
    </div>
  )
}
