import { expect, test, type Page, type Route } from '@playwright/test'
import { E2E_ORIGIN, signIn, stubApiFallbacks } from '../support'

/**
 * INTERCEPTED FRONTEND BEHAVIOR TESTS.
 * The backend is stubbed at the network layer, so these tests do NOT exercise the
 * real Spring Boot API. See e2e/live for live backend integration tests.
 */
const SESSION_ID = 'e2e-session'
const PLACE = {
  placeId: 'place-1',
  name: 'Colosseum Walk',
  category: 'HISTORY',
  description: 'A guided walk past ancient ruins.',
  latitude: 41.8902,
  longitude: 12.4922,
  estimatedDurationMinutes: 45,
  estimatedCost: 12.5,
  currencyCode: 'EUR',
  mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=41.8902,12.4922',
}

async function mockBackend(page: Page) {
  await page.route('**/api/v1/travel-sessions', (route: Route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ sessionId: SESSION_ID, status: 'ACTIVE', expiresAt: '2030-01-01T00:00:00Z' }),
    }),
  )
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID,
        refreshStatus: 'UPDATED',
        recommendations: [PLACE],
        generatedAt: '2030-01-01T00:00:00Z',
      }),
    }),
  )
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}`, (route: Route) =>
    route.fulfill({ status: 204 }),
  )
}

test.beforeEach(async ({ context, page }) => {
  await signIn(context)
  await stubApiFallbacks(page)
  await context.grantPermissions(['geolocation'], { origin: E2E_ORIGIN })
  await context.setGeolocation({ latitude: 41.8902, longitude: 12.4922 })
  await page.addInitScript(() => {
    const geo = navigator.geolocation
    const watch = geo.watchPosition.bind(geo)
    const clear = geo.clearWatch.bind(geo)
    const watchers = new Set<number>()
    geo.watchPosition = (success, error, options) => {
      const id = watch((position) => {
        Reflect.set(window, '__lastLocationFix', {
          latitude: position.coords.latitude, longitude: position.coords.longitude,
        })
        success(position)
      }, error, options)
      watchers.add(id)
      return id
    }
    geo.clearWatch = (id) => {
      watchers.delete(id)
      clear(id)
    }
    Object.defineProperty(window, '__activeLocationWatchers', { get: () => watchers.size })
  })
  await mockBackend(page)
})

async function startExploring(page: Page) {
  await page.goto('/travel-mode')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByLabel('Maximum budget').fill('50')
  await page.getByRole('button', { name: 'Start Exploring' }).click()
}

test('location permission denial shows a recoverable error', async ({ context, page }) => {
  await context.clearPermissions()
  let creations = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/travel-sessions')) creations++
  })
  await page.goto('/travel-mode')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByLabel('Maximum budget').fill('50')
  await page.route('**/api/v1/travel-sessions', (route: Route) => route.fulfill({ status: 500 }))
  await page.getByRole('button', { name: 'Start Exploring' }).click()

  await expect(page.getByText(/Location permission was denied/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
  expect(creations).toBe(0)
})

test('backend unavailable shows a recoverable error and allows retry', async ({ page }) => {
  await page.unroute('**/api/v1/travel-sessions')
  await page.route('**/api/v1/travel-sessions', (route: Route) => route.abort('failed'))
  await startExploring(page)

  await expect(page.getByText(/unavailable|couldn't|try again/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
})

test('no matching attractions shows the empty state', async ({ page }) => {
  await page.unroute(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`)
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID,
        refreshStatus: 'NO_NEW_RESULTS',
        recommendations: [],
        generatedAt: '2030-01-01T00:00:00Z',
      }),
    }),
  )
  await startExploring(page)

  await expect(page.getByText(/No new places/i).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Colosseum Walk' })).toHaveCount(0)
})

test('session expiry from the backend (410) shows the expired notice', async ({ page }) => {
  await startExploring(page)
  await expect(page.getByRole('heading', { name: 'Colosseum Walk' })).toBeVisible()

  await page.unroute(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`)
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, (route: Route) =>
    route.fulfill({
      status: 410,
      contentType: 'application/problem+json',
      body: JSON.stringify({ title: 'Travel session expired', status: 410 }),
    }),
  )
  await page.getByRole('button', { name: 'Check for new places' }).click()

  await expect(page.getByText(/expired/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
})

test('Check for new places is disabled while a check is in progress', async ({ page }) => {
  await startExploring(page)
  await expect(page.getByRole('heading', { name: 'Colosseum Walk' })).toBeVisible()

  await page.unroute(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`)
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID,
        refreshStatus: 'UNCHANGED',
        recommendations: [],
        generatedAt: '2030-01-01T00:00:00Z',
      }),
    })
  })
  const check = page.getByRole('button', { name: 'Check for new places' })
  await check.click()
  await expect(check).toBeDisabled()
  await expect(check).toBeEnabled({ timeout: 5000 })
})

test('explorer renders the hero and an inactive Travel Mode', async ({ page }) => {
  await page.goto('/travel-mode')
  await expect(page.getByRole('heading', { name: /Discover the moment/i })).toBeVisible()
  await expect(page.getByText('Not Exploring')).toBeVisible()
})

test('traveler starts exploring, sees a recommendation, and stops the session', async ({ page }) => {
  await page.goto('/travel-mode')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByLabel('Maximum budget').fill('50')
  await page.getByRole('button', { name: 'Start Exploring' }).click()

  await expect(page.getByRole('heading', { name: 'Colosseum Walk' })).toBeVisible()
  await expect(page.getByRole('link', { name: /directions/i }).first()).toHaveAttribute(
    'href',
    PLACE.mapsUrl,
  )

  await page.getByRole('button', { name: 'Stop Exploring' }).click()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
  await expect(page.getByText('Not Exploring')).toBeVisible()
})

test('invalid budget blocks submission with an inline message', async ({ page }) => {
  await page.goto('/travel-mode')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByLabel('Maximum budget').fill('-5')
  await page.getByRole('button', { name: 'Start Exploring' }).click()

  await expect(page.getByRole('heading', { name: 'Colosseum Walk' })).toHaveCount(0)
  await expect(page.getByText(/negative|greater than|at least|valid/i).first()).toBeVisible()
})

for (const width of [375, 768, 900, 1024, 1440]) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/travel-mode')
    await expect(page.getByRole('heading', { name: /Discover the moment/i })).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows).toBe(false)

    await page.getByRole('checkbox', { name: 'History' }).check()
    await page.getByLabel('Maximum budget').fill('50')
    await page.getByRole('button', { name: 'Start Exploring' }).click()
    await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )).toBe(false)
    await expect(page.getByRole('link', { name: /directions/i })).toBeVisible()
  })
}

test('form controls have accessible names and the start button can receive keyboard focus', async ({ page }) => {
  await page.goto('/travel-mode')
  await expect(page.getByLabel('Maximum budget')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'History' })).toBeVisible()
  const start = page.getByRole('button', { name: 'Start Exploring' })
  await start.focus()
  await expect(start).toBeFocused()
})

test('interest, currency and custom-time validation produce the exact session payload once', async ({ page }) => {
  await page.goto('/travel-mode')
  await page.getByRole('checkbox', { name: 'History' }).check()
  await page.getByRole('checkbox', { name: 'Art', exact: true }).check()
  await expect(page.getByRole('checkbox', { name: 'History' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Art', exact: true })).toBeChecked()
  await page.getByLabel('Maximum budget').fill('50')
  await page.getByLabel('Currency').selectOption('EUR')
  await page.getByRole('radio', { name: 'Custom', exact: true }).check()
  await page.getByLabel('Custom time (minutes)').fill('0')
  await page.getByRole('button', { name: 'Start Exploring' }).click()
  await expect(page.getByLabel('Custom time (minutes)')).toHaveAttribute('aria-invalid', 'true')
  await page.getByLabel('Custom time (minutes)').fill('180')
  let creations = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/v1/travel-sessions')) creations++
  })
  const requestPromise = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/api/v1/travel-sessions'),
  )
  await page.getByRole('button', { name: 'Start Exploring' }).dblclick()
  expect((await requestPromise).postDataJSON()).toEqual({
    interests: ['HISTORY', 'ART'],
    maxBudget: 50,
    currencyCode: 'EUR',
    availableMinutes: 180,
  })
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
  expect(creations).toBe(1)
})

test('movement follows the backend refresh rule and surfaces new places in the alert', async ({ page, context }) => {
  await page.clock.install()
  const locations: unknown[] = []
  const statuses = ['UPDATED', 'UPDATED', 'NO_NEW_RESULTS', 'UNCHANGED'] as const
  const newPlace = { ...PLACE, placeId: 'place-2', name: 'Roman Art Studio', category: 'ART' }
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, (route) => {
    locations.push(route.request().postDataJSON())
    const index = locations.length - 1
    return route.fulfill({
      json: {
        sessionId: SESSION_ID,
        refreshStatus: statuses[index] ?? 'UNCHANGED',
        recommendations: index === 0 ? [PLACE] : index === 1 ? [newPlace] : [],
        generatedAt: new Date().toISOString(),
      },
    })
  })
  const moveTo = async (coordinates: { latitude: number; longitude: number }) => {
    await context.setGeolocation(coordinates)
    await expect.poll(() => page.evaluate(() => Reflect.get(window, '__lastLocationFix'))).toEqual(coordinates)
  }
  await startExploring(page)
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(1)

  // About 15 m: GPS jitter and short walks are never sent, even across an automatic check.
  await moveTo({ latitude: 41.8903, longitude: 12.4923 })
  await page.clock.fastForward(6 * 60 * 1000)
  expect(locations).toHaveLength(1)

  // About 1.4 km, past the cooldown: sent at once, and the new place shows in the alert.
  const moved = { latitude: 41.9002, longitude: 12.5022 }
  await moveTo(moved)
  await page.clock.fastForward(1000)
  await expect.poll(() => locations.length).toBe(2)
  expect(locations[1]).toMatchObject({ location: moved })
  const alert = page.getByRole('status').filter({ hasText: 'New nearby suggestion' })
  await expect(alert).toContainText(newPlace.name)
  await expect(page.getByRole('heading', { name: newPlace.name })).toBeVisible()
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()

  // Another long move right away waits for the backend's 5-minute cooldown, then sends the latest position.
  const next = { latitude: 41.9102, longitude: 12.5122 }
  await moveTo(next)
  await page.clock.fastForward(4 * 60 * 1000)
  expect(locations).toHaveLength(2)
  await page.clock.fastForward(60 * 1000)
  await expect.poll(() => locations.length).toBe(3)
  expect(locations[2]).toMatchObject({ location: next })
  await expect(page.getByText(/No new places were found nearby/)).toBeVisible()

  await page.getByRole('button', { name: 'Dismiss suggestion' }).click()
  await expect(alert).toHaveCount(0)

  // A manual check always goes out.
  await page.getByRole('button', { name: 'Check for new places' }).click()
  await expect.poll(() => locations.length).toBe(4)

  await page.getByRole('button', { name: 'Stop Exploring' }).click()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(0)
  await page.clock.fastForward(20 * 60 * 1000)
  expect(locations).toHaveLength(4)
})

test('watching pauses while hidden and a return somewhere new checks once, without overlapping', async ({ page, context }) => {
  await page.clock.install()
  await startExploring(page)
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
  let refreshes = 0
  let finishRefresh: (() => void) | undefined
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, async (route) => {
    refreshes++
    await new Promise<void>((resolve) => { finishRefresh = resolve })
    await route.fulfill({
      json: { sessionId: SESSION_ID, refreshStatus: 'UNCHANGED', recommendations: [], generatedAt: new Date().toISOString() },
    })
  })
  const setHidden = (hidden: boolean) => page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

  await setHidden(true)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(0)
  await page.clock.fastForward(5 * 60 * 1000)
  expect(refreshes).toBe(0)

  await context.setGeolocation({ latitude: 41.9002, longitude: 12.5022 })
  await setHidden(false)
  await expect.poll(() => refreshes).toBe(1)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(1)
  await page.clock.fastForward(10 * 60 * 1000)
  expect(refreshes).toBe(1)
  finishRefresh?.()
  await expect(page.getByText(/No new check was needed yet/)).toBeVisible()
})

test('failed stop is reported honestly and location tracking stays stopped until retry', async ({ page }) => {
  await startExploring(page)
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}`, (route) =>
    route.fulfill({ status: 503, json: { title: 'Service unavailable', status: 503 } }),
  )
  await page.getByRole('button', { name: 'Stop Exploring' }).click()
  await expect(page.getByRole('alert')).toContainText("couldn't confirm")
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(0)
  await page.unroute(`**/api/v1/travel-sessions/${SESSION_ID}`)
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}`, (route) => route.fulfill({ status: 204 }))
  await page.getByRole('button', { name: 'Stop Exploring' }).click()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
})

test('a lost in-memory backend session ends locally and allows a new exploration', async ({ page }) => {
  await startExploring(page)
  await expect(page.getByRole('heading', { name: PLACE.name })).toBeVisible()
  await page.route(`**/api/v1/travel-sessions/${SESSION_ID}/recommendations`, (route) =>
    route.fulfill({ status: 404, json: { title: 'Travel session not found', status: 404 } }),
  )
  await page.getByRole('button', { name: 'Check for new places' }).click()
  await expect(page.getByText(/Your travel session has ended/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start Exploring' })).toBeEnabled()
  await expect.poll(() => page.evaluate(() => Reflect.get(window, '__activeLocationWatchers'))).toBe(0)
})
