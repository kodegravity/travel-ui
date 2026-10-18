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
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
