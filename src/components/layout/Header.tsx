import { useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Compass, Heart, LogIn, Menu, Route, X } from 'lucide-react'
import { Link, useInRouterContext } from 'react-router-dom'
import { AuthContext } from '../../auth/useAuth'
import { BRAND_NAME } from '../../config/brand'
import { findCity } from '../../data/destinations'
import { lastExploredCity } from '../../services/lastCity'
import { useTripStore } from '../../services/tripStore'

export type NavKey = 'home' | 'explore' | 'travel-mode' | 'trip' | 'itinerary'

interface NavAnchorProps {
  to: string
  className: string
  children: ReactNode
  current?: boolean
}

/** Uses client-side navigation inside a router, and a plain link elsewhere (isolated component tests). */
function NavAnchor({ to, className, children, current }: NavAnchorProps) {
  const inRouter = useInRouterContext()
  const ariaCurrent = current ? 'page' : undefined
  return inRouter ? (
    <Link to={to} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  ) : (
    <a href={to} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  )
}

function initials(name: string | null): string {
  if (!name) return 'ME'
  const letters = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
  return letters || 'ME'
}

/** Site navbar: brand, primary links, and the account menu. Collapses into a drawer on phones. */
export function Header({ active }: { active?: NavKey }) {
  // Read directly so the header still renders where no AuthProvider exists (for example, in isolated tests).
  const auth = useContext(AuthContext)
  const signedInAs = auth?.user?.name ?? auth?.user?.email ?? null
  const [menuOpen, setMenuOpen] = useState(false)
  const [favOpen, setFavOpen] = useState(false)
  const favRef = useRef<HTMLDivElement>(null)
  const { favorites, trips } = useTripStore()
  const tripCityId = findCity(lastExploredCity())?.id
  const tripCount = tripCityId ? (trips[tripCityId]?.length ?? 0) : 0
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!favOpen) return
    function close(event: MouseEvent) {
      if (!favRef.current?.contains(event.target as Node)) setFavOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setFavOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [favOpen])

  useEffect(() => {
    if (!menuOpen) return
    function close(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const authenticated = auth?.status === 'authenticated'
  const anonymous = auth?.status === 'anonymous'

  return (
    <header className="tm-nav">
      <div className="tm-nav__inner">
        <NavAnchor to="/" className="tm-brand">
          <span className="tm-brand__mark" aria-hidden="true">
            <Compass size={20} strokeWidth={2} />
          </span>
          <span className="tm-brand__name">{BRAND_NAME}</span>
        </NavAnchor>

        <nav className="tm-nav__links" aria-label="Main">
          <NavAnchor
            to="/explore"
            className={`tm-nav-link${active === 'explore' ? ' tm-nav-link--on' : ''}`}
            current={active === 'explore'}
          >
            Explore
          </NavAnchor>
          <NavAnchor
            to="/travel-mode"
            className={`tm-nav-link${active === 'travel-mode' ? ' tm-nav-link--on' : ''}`}
            current={active === 'travel-mode'}
          >
            Travel Mode
          </NavAnchor>
          {authenticated && (
            <NavAnchor
              to="/itinerary"
              className={`tm-nav-link${active === 'itinerary' ? ' tm-nav-link--on' : ''}`}
              current={active === 'itinerary'}
            >
              My Trips
            </NavAnchor>
          )}

          {authenticated && (
            <div className="tm-menu" ref={favRef}>
              <button
                type="button"
                className="tm-nav-link"
                aria-expanded={favOpen}
                onClick={() => setFavOpen((open) => !open)}
              >
                <Heart size={16} aria-hidden="true" />
                Favorites · {favorites.length}
              </button>
              {favOpen && (
                <div className="tm-menu__panel tm-menu__panel--wide tm-card">
                  <p className="tm-menu__heading">Saved places</p>
                  {favorites.length === 0 ? (
                    <p className="tm-menu__identity">Tap the heart on any place to save it.</p>
                  ) : (
                    <ul className="tm-menu__list">
                      {favorites.map((place) => (
                        <li key={place.placeId}>
                          <NavAnchor to={`/explore/${place.cityId}`} className="tm-menu__item tm-menu__item--split">
                            <span className="tm-menu__item-name">{place.name}</span>
                            <span className="tm-menu__item-meta">{findCity(place.cityId)?.name ?? ''}</span>
                          </NavAnchor>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {authenticated && (
            <div className="tm-menu" ref={menuRef}>
              <button
                type="button"
                className="tm-nav-link"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((open) => !open)}
              >
                <span className="tm-avatar" aria-hidden="true">
                  {initials(signedInAs)}
                </span>
                Profile
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="tm-menu__panel tm-card">
                  {signedInAs && <p className="tm-menu__identity">Signed in as {signedInAs}</p>}
                  <button type="button" className="tm-menu__item" onClick={() => void auth.logout()}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}

          {authenticated && (
            <NavAnchor
              to="/trip"
              className={`tm-btn tm-btn--primary tm-btn--sm tm-nav__trip${active === 'trip' ? ' tm-nav__trip--on' : ''}`}
              current={active === 'trip'}
            >
              <Route size={18} aria-hidden="true" />
              My Trip · {tripCount}
            </NavAnchor>
          )}

          {anonymous && (
            <button type="button" className="tm-btn tm-btn--primary tm-btn--sm" onClick={() => void auth.login()}>
              <LogIn size={18} aria-hidden="true" />
              Sign in
            </button>
          )}
        </nav>

        <button
          type="button"
          className="tm-icon-btn tm-nav__toggle"
          aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={drawerOpen}
          aria-controls="mobile-menu"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </div>

      {drawerOpen && (
        <nav id="mobile-menu" className="tm-drawer" aria-label="Menu">
          <NavAnchor to="/" className="tm-drawer__link" current={active === 'home'}>
            Home
          </NavAnchor>
          <NavAnchor to="/explore" className="tm-drawer__link" current={active === 'explore'}>
            Explore
          </NavAnchor>
          <NavAnchor to="/travel-mode" className="tm-drawer__link" current={active === 'travel-mode'}>
            Travel Mode
          </NavAnchor>
          {authenticated && (
            <NavAnchor to="/itinerary" className="tm-drawer__link" current={active === 'itinerary'}>
              My Trips
            </NavAnchor>
          )}
          {authenticated && (
            <NavAnchor to="/trip" className="tm-drawer__link" current={active === 'trip'}>
              My Trip · {tripCount}
            </NavAnchor>
          )}
          {authenticated && (
            <>
              {signedInAs && <p className="tm-drawer__identity">Signed in as {signedInAs}</p>}
              <button type="button" className="tm-drawer__link" onClick={() => void auth.logout()}>
                Sign out
              </button>
            </>
          )}
          {anonymous && (
            <button type="button" className="tm-drawer__link" onClick={() => void auth.login()}>
              Sign in
            </button>
          )}
        </nav>
      )}
    </header>
  )
}
