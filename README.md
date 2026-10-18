# AI Travel Companion (ROAM / AI) — Frontend

React frontend for **AI Travel Companion**, a product that helps international travelers discover nearby experiences based on their location, interests, available time, and budget. The main differentiator is proactive nearby opportunity discovery during an active travel session.

This repository contains only the frontend. The Java Spring Boot backend lives in a **separate repository**.

## Technology stack

- React 19 + TypeScript (strict mode)
- Vite
- React Hooks (local state only, no Redux or Zustand)
- Plain CSS (variables + global stylesheet)
- Lucide React icons
- Vitest + React Testing Library
- ESLint

## Project structure

```
src/
  components/
    layout/      Header.tsx, AppLayout.tsx
    traveler/    TravelPreferencesForm.tsx, InterestSelector.tsx, TravelModeCard.tsx,
                 RecommendationResults.tsx, RecommendationCard.tsx
    common/      Button.tsx, EmptyState.tsx
  config/        env.ts (API base URL)
  hooks/         useTravelPreferences.ts, useTravelSession.ts (session state machine)
  pages/         TravelExplorerPage.tsx, plus page-level tests
  services/      travelApi.ts (typed fetch client), geolocation.ts (browser location),
                 recommendationFormat.ts, travelPreferences.ts, and their tests
  types/         travel.ts (frontend preference types), api.ts (backend DTO contracts)
  styles/        variables.css, global.css
  test/          setup.ts (Vitest + jest-dom setup)
  App.tsx
  main.tsx
```

## Installation

Prerequisites: Node.js 20.19+ or 22.12+, npm 10+.

```bash
npm install
```

If `npm install` fails with `Cannot read properties of null (reading 'edgesOut')`, this is an npm peer-dependency resolver bug. Delete `node_modules` and retry with `npm install --legacy-peer-deps`, or use `npm ci` with the committed lockfile.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server at http://localhost:5173 |
| `npm run build` | Type-check (`tsc -b`) and create a production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Environment configuration

Copy `.env.example` to `.env.local` and adjust as needed:

```bash
VITE_API_BASE_URL=http://localhost:8080
```

- If `VITE_API_BASE_URL` is unset, the app falls back to `http://localhost:8080`. Trailing slashes are removed.
- The frontend runs on **http://localhost:5173**. The Spring Boot backend runs on **http://localhost:8080**.
- The backend only accepts CORS requests from `http://localhost:5173`. Keep the dev server on that port.
- **Never** put secrets in frontend environment variables. `VITE_`-prefixed variables are bundled into the browser JavaScript and are publicly visible.
- The frontend must never contain `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, or any other backend service secret. Those belong only in the backend.

## Separate repositories

- **Frontend (this repo):** `travel-app-ui`, React + Vite on port 5173.
- **Backend:** a separate Spring Boot repository (`travel-app`), on port 8080. This repo does not contain any backend code.

The API contract is documented in the backend repo at `docs/FRONTEND_API_INTEGRATION.md`. The TypeScript types in `src/types/api.ts` mirror the backend DTOs.

## Running both applications locally

1. Start the Spring Boot backend on http://localhost:8080 (see the backend repo's README).
2. In this repo, run `npm install` once, then `npm run dev`.
3. Open http://localhost:5173.

## Start Exploring workflow

1. Select at least one interest, enter a budget, currency, and available time, then press **Start Exploring**.
2. The app explains why location is needed, then asks the browser for your location (one `getCurrentPosition` request).
3. If location is granted, the app creates one backend travel session (`POST /api/v1/travel-sessions`).
4. The app sends your coordinates to `POST /api/v1/travel-sessions/{sessionId}/recommendations`.
5. Recommendations appear as cards. Each card shows the name, category, description, duration and price (or "Duration unavailable" / "Price unavailable"), and a **Get directions** link to Google Maps.
6. **Check for new places** asks the backend for a refresh. This only happens when you press it. The app does not poll.

Refresh outcomes:

- `UPDATED`: the new recommendations are shown.
- `UNCHANGED`: the current cards are kept.
- `NO_NEW_RESULTS`: a message says no new places were found. This is not an error.

## Stop Exploring workflow

Press **Stop Exploring** to call `DELETE /api/v1/travel-sessions/{sessionId}`. The app clears the session ID and location state only after the backend confirms (204). If the call fails, the session stays shown as active, an error appears, and you can press Stop again.

## Browser geolocation requirements

- Location is requested only after you press Start Exploring. It is never requested on page load.
- While exploring, the app keeps a position watch open so automatic refreshes can reuse a recent fix (within 10 minutes). The watch stops when you stop exploring.
- Location requires a secure context: https in production, or `localhost` in development.
- Location is kept in memory only. It is not written to `localStorage` and precise coordinates are not displayed.
- The app shows clear messages for denied permission, unavailable position, timeout, and browsers without geolocation.

## Monitoring and automatic refresh (Chunk 3)

While a session is active and the tab is visible, the app refreshes recommendations about every 5 minutes (`POST .../recommendations`). Refreshes pause while the tab is hidden, so no backend or provider calls are made in the background. The Travel Mode card shows the last check time. Use the refresh control to check manually.

Automatic refresh failures keep the cards already on screen and show an error. If the session has expired, the app ends it locally and tells you to start again.

## New-place alerts (Chunk 4)

Once a session is active, **Alert me to new places** asks for browser notification permission. Alerts are in-tab only: they appear when new places arrive while the tab is hidden. They are not background push notifications, and they stop if the tab is closed. If notifications are blocked, the app says so and suggests changing browser settings.

## End-to-end tests (Chunk 6)

```bash
npm run test:e2e        # Playwright, Chromium, mobile and desktop projects
```

The Playwright suite starts the Vite dev server on port 5173 and stubs the backend at the network layer, so it does not depend on the backend or any provider. It covers the start, recommendation, stop, and validation flows, plus horizontal overflow at 375, 768, and 1440px. Run `npx playwright install chromium` once before the first run.

## Deployment notes

- Set `VITE_API_BASE_URL` to the public HTTPS URL of the backend at build time. Vite embeds this value in the browser bundle, so it must never contain secrets.
- Serve the frontend over HTTPS. Browser geolocation and notifications require a secure context.
- Add the production frontend origin to the backend CORS allow-list. The backend currently allows only `http://localhost:5173`.
- The hosting target is not chosen yet.

## Troubleshooting

- **"We couldn't reach the travel service"**: the backend is not running, or the URL in `VITE_API_BASE_URL` is wrong. Start the backend on port 8080 and reload.
- **CORS errors in the browser console**: the backend only allows `http://localhost:5173`. Do not change the dev port, and check that the backend CORS configuration still allows it.
- **Location denied**: allow location for `localhost` in the browser's site settings, then press Start Exploring again.
- **"We couldn't determine your current location"** (unavailable or timeout): check the device's location services and try again.
- **"This travel session has expired"** or **"could not be found"**: the backend no longer has the session. Press Start Exploring to create a new one.
- **"temporarily unavailable"** (503): the recommendation provider or capacity is limited. Try again later.

## Testing

```bash
npm run test -- --run   # run all tests once
npm run test            # watch mode
npm run lint            # ESLint
npm run build           # type-check and production build
```

Tests use Vitest with jsdom and React Testing Library. They stub `fetch` and `navigator.geolocation`, so they never call the backend, Google Places, or OpenAI.

## Features implemented

Chunk 1 (UI foundation):

- Branded hero section and responsive layout (375px, 768px, 1440px)
- Traveler preferences form with controlled state and inline validation (interests, budget, currency, available time)
- Active Travel Mode card

Chunk 2 (Spring Boot API integration):

- Typed API client for the three session endpoints and the stop endpoint, with ProblemDetail error parsing
- Start Exploring flow with browser location, session creation, and recommendations
- Recommendation cards with optional cost and duration handling and safe Maps links
- Refresh handling for `UPDATED`, `UNCHANGED`, and `NO_NEW_RESULTS`
- Stop Exploring with retry on failure
- Double-click protection and stale-response protection

Chunk 3 (monitoring and automatic refresh):

- Watch-position fix reused for background refreshes, with a 10-minute freshness limit
- Automatic refresh every 5 minutes while the tab is visible, with no overlapping requests
- Session expiry handled locally, with stale-response guards

Chunk 4 (alerts): in-tab new-place notifications behind a user opt-in.

Chunk 5 (polish): 44px minimum touch targets for buttons and text inputs, and reduced-motion support.

Chunk 6 (quality): Playwright E2E suite and deployment notes.

## Deferred to later chunks

- Background push notifications (service worker), WebSockets, and real-time push
- Hosting selection and production CI/CD pipeline
- Authentication and premium subscriptions
- Booking document uploads and payment processing
- AI model integration in the frontend (the AI runs only in the backend)
