import type { ReactNode } from 'react'
import { useAuth } from '../../auth/useAuth'
import { OKTA_CONFIGURED } from '../../config/okta'
import { Button } from '../common/Button'

/** Shows the app only to signed-in users. Renders sign-in, loading, or configuration states otherwise. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, sessionExpired, authError, login, logout } = useAuth()

  if (!OKTA_CONFIGURED) {
    return (
      <main className="auth-screen" role="alert">
        <h1>Sign-in is not configured</h1>
        <p>Set VITE_OKTA_ISSUER, VITE_OKTA_CLIENT_ID, and VITE_OKTA_REDIRECT_URI, then restart the dev server.</p>
      </main>
    )
  }

  if (status === 'loading') {
    return (
      <main className="auth-screen" aria-live="polite">
        <p>Signing you in…</p>
      </main>
    )
  }

  if (status === 'anonymous') {
    return (
      <main className="auth-screen">
        <h1>ROAM / AI</h1>
        {sessionExpired && <p role="status">Your session has expired. Please sign in again.</p>}
        {authError && <p role="alert">{authError}</p>}
        <Button onClick={() => void login()}>Sign in with Okta</Button>
      </main>
    )
  }

  return (
    <>
      <div className="auth-bar">
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
      {children}
    </>
  )
}
