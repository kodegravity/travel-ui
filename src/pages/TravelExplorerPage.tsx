import { lazy, Suspense, useRef, useState } from 'react'
import { List, Map as MapIcon, SlidersHorizontal } from 'lucide-react'
import { AppLayout } from '../components/layout/AppLayout'
import type { MapPlace } from '../components/explorer/PlacesMap'
import { NearbySearchCard } from '../components/traveler/NearbySearchCard'
import { RecommendationCard } from '../components/traveler/RecommendationCard'
import { RecommendationResults } from '../components/traveler/RecommendationResults'
import { SearchResults } from '../components/traveler/SearchResults'
import { TravelModeCard } from '../components/traveler/TravelModeCard'
import { TravelPreferencesForm } from '../components/traveler/TravelPreferencesForm'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useNearbySearch, type SearchTarget } from '../hooks/useNearbySearch'
import { useTravelPreferences } from '../hooks/useTravelPreferences'
import { useTravelSession } from '../hooks/useTravelSession'
import { formatCategory, formatCost } from '../services/recommendationFormat'
import type { RecommendationDto, SearchPageSize } from '../types/api'
import type { TravelerPreferences } from '../types/travel'
import {
  getNotificationStatus,
  requestNotificationPermission,
  type NotificationStatus,
} from '../services/notifications'

// Leaflet is only needed once the map is on screen, so it loads in its own chunk.
const PlacesMap = lazy(() => import('../components/explorer/PlacesMap'))

type ResultsTab = 'search' | 'travel'
type MobileView = 'list' | 'map'

/** Matches the CSS breakpoint where the map moves beside the panel. */
const SIDE_BY_SIDE_QUERY = '(min-width: 1024px)'

interface SearchSummary {
  preferences: TravelerPreferences
  label: string
  size: number
}

function describeSearch({ preferences, label, size }: SearchSummary): string {
  const interests = preferences.interests.map((interest) => formatCategory(interest)).join(', ')
  const budget = formatCost(preferences.maxBudget, preferences.currency)
  return `${interests} · ${budget} · ${preferences.availableTimeMinutes} min · ${label} · ${size} per page`
}

function toMapPlaces(items: RecommendationDto[], firstNumber: number): MapPlace[] {
  return items.map((item, index) => ({
    id: item.placeId,
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    number: firstNumber + index,
  }))
}

function scrollCardIntoView(placeId: string) {
  const card = document.querySelector(`[data-place-id="${CSS.escape(placeId)}"]`)
  card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
}

export function TravelExplorerPage() {
  const preferences = useTravelPreferences()
  const session = useTravelSession()
  const nearbySearch = useNearbySearch()
  const { state } = session
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>(getNotificationStatus)
  const [activeTab, setActiveTab] = useState<ResultsTab>('search')
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lastSearch, setLastSearch] = useState<SearchSummary | null>(null)
  const [controlsOpen, setControlsOpen] = useState(true)
  const sideBySide = useMediaQuery(SIDE_BY_SIDE_QUERY)
  // Home links here with ?city=<id> to preselect the city.
  const [initialCityId] = useState(() => new URLSearchParams(window.location.search).get('city') ?? undefined)
  const toolbarRef = useRef<HTMLDivElement>(null)

  /** Phone only: swap list and map, and bring the toggle to the top so the map fills the screen. */
  function showMobileView(view: MobileView) {
    setMobileView(view)
    requestAnimationFrame(() => toolbarRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
  }

  async function handleEnableNotifications() {
    setNotificationStatus(await requestNotificationPermission())
  }

  async function handleSearch(target: SearchTarget, size: SearchPageSize) {
    const validPreferences = preferences.validate()
    if (!validPreferences) return
    setActiveTab('search')
    setSelectedId(null)
    const loaded = await nearbySearch.search(validPreferences, target, size)
    if (loaded) {
      const label = target.kind === 'current' ? 'My location' : target.label
      setLastSearch({ preferences: validPreferences, label, size })
      setControlsOpen(false)
    }
  }

  function handleStart() {
    const validPreferences = preferences.validate()
    if (validPreferences) {
      setActiveTab('travel')
      setSelectedId(null)
      void session.start(validPreferences)
    }
  }

  function handleSelectFromList(placeId: string) {
    setSelectedId(placeId)
    if (!sideBySide) showMobileView('map')
  }

  function handleSelectFromMap(placeId: string) {
    setSelectedId(placeId)
    if (sideBySide) scrollCardIntoView(placeId)
  }

  const searchItems = nearbySearch.state.result?.recommendations ?? []
  const searchFirstNumber = nearbySearch.state.result
    ? nearbySearch.state.result.page * nearbySearch.state.result.size + 1
    : 1
  const activeItems = activeTab === 'search' ? searchItems : state.recommendations
  const mapPlaces =
    activeTab === 'search' ? toMapPlaces(searchItems, searchFirstNumber) : toMapPlaces(state.recommendations, 1)
  const mapCenter = activeTab === 'search' ? nearbySearch.state.center : null
  const selectedItem = activeItems.find((item) => item.placeId === selectedId)
  const selectedNumber = mapPlaces.find((place) => place.id === selectedId)?.number
  const mapVisible = sideBySide || mobileView === 'map'
  const searchCount = nearbySearch.state.result?.totalElements
  const travelCount = state.recommendations.length

  return (
    <AppLayout active="explore">
      <div className="explorer-shell" data-mobile-view={mobileView}>
        <aside className="explorer-panel" aria-label="Plan and results">
          <div className="explorer-panel__intro">
            <p className="eyebrow">AI Travel Companion</p>
            <h1 className="explorer-panel__title">
              <span>Discover the moment.</span>{' '}
              <span className="explorer-panel__title-accent">Not just the destination.</span>
            </h1>
          </div>

          {lastSearch && !controlsOpen && (
            <div className="search-summary-bar">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <p className="search-summary-bar__text">{describeSearch(lastSearch)}</p>
              <button type="button" className="link-button" onClick={() => setControlsOpen(true)}>
                Edit search
              </button>
            </div>
          )}

          <div className="explorer-panel__plan" hidden={!controlsOpen}>
            <TravelPreferencesForm preferences={preferences} />
            <NearbySearchCard
              isBusy={nearbySearch.isBusy}
              onSearch={(target, size) => void handleSearch(target, size)}
              initialCityId={initialCityId}
            />
          </div>

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

          <div className="results-toolbar" ref={toolbarRef}>
            <div className="results-tabs" role="tablist" aria-label="Results">
              <button
                type="button"
                role="tab"
                id="tab-search"
                aria-controls="panel-search"
                aria-selected={activeTab === 'search'}
                className="results-tabs__tab"
                onClick={() => setActiveTab('search')}
              >
                Search results{searchCount != null ? ` (${searchCount})` : ''}
              </button>
              <button
                type="button"
                role="tab"
                id="tab-travel"
                aria-controls="panel-travel"
                aria-selected={activeTab === 'travel'}
                className="results-tabs__tab"
                onClick={() => setActiveTab('travel')}
              >
                Travel Mode{travelCount > 0 ? ` (${travelCount})` : ''}
              </button>
            </div>

            {!sideBySide && (
              <div className="view-toggle" role="group" aria-label="Show results as">
                <button
                  type="button"
                  className="view-toggle__option"
                  aria-pressed={mobileView === 'list'}
                  onClick={() => showMobileView('list')}
                >
                  <List size={16} aria-hidden="true" /> List
                </button>
                <button
                  type="button"
                  className="view-toggle__option"
                  aria-pressed={mobileView === 'map'}
                  onClick={() => showMobileView('map')}
                >
                  <MapIcon size={16} aria-hidden="true" /> Map
                </button>
              </div>
            )}
          </div>

          <div className="explorer-results">
            <div role="tabpanel" id="panel-search" aria-labelledby="tab-search" hidden={activeTab !== 'search'}>
              <h2 className="visually-hidden">Search results</h2>
              <SearchResults
                state={nearbySearch.state}
                isBusy={nearbySearch.isBusy}
                onPageChange={(page) => {
                  setSelectedId(null)
                  void nearbySearch.goToPage(page)
                }}
                selectedId={selectedId}
                onSelect={handleSelectFromList}
              />
            </div>
            <div role="tabpanel" id="panel-travel" aria-labelledby="tab-travel" hidden={activeTab !== 'travel'}>
              <h2 className="visually-hidden">Travel Mode results</h2>
              <RecommendationResults
                state={state}
                isBusy={session.isBusy}
                canRefresh={session.canRefresh}
                onRefresh={() => void session.refresh()}
                selectedId={selectedId}
                onSelect={handleSelectFromList}
              />
            </div>
          </div>
        </aside>

        <section className="explorer-map" aria-label="Map of results">
          {mapVisible && (
            <Suspense fallback={<div className="places-map places-map--loading">Loading map…</div>}>
              <PlacesMap
                places={mapPlaces}
                center={mapCenter}
                selectedId={selectedId}
                onSelect={handleSelectFromMap}
                visible={mapVisible}
              />
            </Suspense>
          )}
          {!sideBySide && selectedItem && (
            <div className="map-selected">
              <RecommendationCard recommendation={selectedItem} number={selectedNumber} selected />
              <button type="button" className="link-button" onClick={() => showMobileView('list')}>
                Back to list
              </button>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}
