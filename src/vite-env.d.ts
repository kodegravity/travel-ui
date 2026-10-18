/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Spring Boot backend. Public: exposed to the browser. */
  readonly VITE_API_BASE_URL: string
  /** Okta authorization server issuer, e.g. https://<domain>/oauth2/default. Public. */
  readonly VITE_OKTA_ISSUER: string
  /** Okta SPA client ID. Public: SPA clients have no secret. */
  readonly VITE_OKTA_CLIENT_ID: string
  /** Callback URL registered in the Okta app, e.g. http://localhost:5173/login/callback. */
  readonly VITE_OKTA_REDIRECT_URI: string
  /**
   * Google Maps JavaScript API browser key. Public by design: restrict it in Google Cloud to this site's referrers
   * and to the Maps JavaScript API only. Without it, maps show a "not configured" panel.
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Google Maps map ID for advanced markers. Defaults to Google's DEMO_MAP_ID. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
