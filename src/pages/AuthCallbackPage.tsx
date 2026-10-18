import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { safeReturnPath } from '../auth/returnPath'

/** Okta redirects here after sign-in. It moves the user on once the SDK has processed the response. */
export function AuthCallbackPage() {
  const { status, authError, postLoginPath } = useAuth()

  if (status === 'authenticated') {
    return <Navigate to={safeReturnPath(postLoginPath)} replace />
  }

  if (status === 'anonymous') {
    return (
      <main className="auth-screen" role="alert">
        <h1>Sign-in was not completed</h1>
        <p>{authError ?? 'Please try signing in again.'}</p>
        <Link to="/login">Back to sign in</Link>
      </main>
    )
  }

  return (
    <main className="auth-screen" aria-live="polite">
      <p>Signing you in…</p>
    </main>
  )
}
