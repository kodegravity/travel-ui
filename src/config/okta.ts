import { OktaAuth } from '@okta/okta-auth-js'

/** Okta SPA settings. Public values only: the SPA client has no secret. */
const issuer = import.meta.env.VITE_OKTA_ISSUER?.trim()
const clientId = import.meta.env.VITE_OKTA_CLIENT_ID?.trim()
const redirectUri = import.meta.env.VITE_OKTA_REDIRECT_URI?.trim()

export const OKTA_CONFIGURED = Boolean(issuer && clientId && redirectUri)

/** Null when Okta is not configured, so the app can show a clear message instead of failing. */
export const oktaAuth: OktaAuth | null =
  issuer && clientId && redirectUri
    ? new OktaAuth({
        issuer,
        clientId,
        redirectUri,
        scopes: ['openid', 'profile', 'email'],
        responseType: ['code'],
        pkce: true,
        tokenManager: {
          storage: 'sessionStorage',
          autoRenew: true,
        },
      })
    : null

/** Path that Okta redirects back to after sign-in. Must match VITE_OKTA_REDIRECT_URI. */
export const LOGIN_CALLBACK_PATH = '/login/callback'

/** Returns the current access token, renewing it when needed. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (!oktaAuth) return null
  try {
    return await oktaAuth.getOrRenewAccessToken()
  } catch {
    return null
  }
}
