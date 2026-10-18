import { Compass, LogIn, MapPin, ShieldCheck, Sparkles, UserPlus, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { OKTA_CONFIGURED } from '../config/okta'
import { useAuth } from '../auth/useAuth'
import { safeReturnPath } from '../auth/returnPath'
import { Button } from '../components/common/Button'

const FEATURES = [
  { icon: Compass, text: 'Find experiences matched to your interests' },
  { icon: MapPin, text: 'Recommendations update as you move nearby' },
  { icon: Wallet, text: 'Stay within your time and budget' },
]

/** Sign-in, SSO, and sign-up all run on Okta's hosted page, so credentials never reach this app. */
export function LoginPage() {
  const { status, sessionExpired, authError, login } = useAuth()
  const location = useLocation()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const returnPath = safeReturnPath((location.state as { from?: string } | null)?.from)

  if (status === 'authenticated') {
    return <Navigate to={returnPath} replace />
  }

  if (!OKTA_CONFIGURED) {
    return (
      <main className="auth-screen" role="alert">
        <h1>Sign-in is not configured</h1>
        <p>Set VITE_OKTA_ISSUER, VITE_OKTA_CLIENT_ID, and VITE_OKTA_REDIRECT_URI, then restart the dev server.</p>
      </main>
    )
  }

  const isBusy = isRedirecting || status === 'loading'

  async function startSignIn() {
    setIsRedirecting(true)
    try {
      await login(returnPath)
    } catch {
      setIsRedirecting(false)
    }
  }

  return (
    <div className="login">
      <aside className="login__brand" aria-label="About ROAM / AI">
        <span className="brand brand--light">
          <span className="brand__mark">
            <Compass size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="brand__name">ROAM / AI</span>
        </span>

        <div className="login__brand-copy">
          <p className="eyebrow eyebrow--light">AI Travel Companion</p>
          <h2 className="login__brand-title">
            Discover the moment. <span className="login__brand-accent">Not just the destination.</span>
          </h2>
          <ul className="login__features">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="login__feature-icon">
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="login__panel">
        <section className="card login__card" aria-labelledby="login-title">
          <span className="login__badge">
            <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h1 id="login-title" className="login__title">Welcome back to ROAM / AI</h1>
          <p className="login__lead">Sign in to continue your journey.</p>

          {sessionExpired && (
            <p className="alert alert--info" role="status">
              Your session has expired. Please sign in again.
            </p>
          )}
          {authError && (
            <p className="alert alert--error" role="alert">
              {authError}
            </p>
          )}

          <div className="login__actions">
            <Button className="btn--block btn--lg" onClick={() => void startSignIn()} disabled={isBusy}>
              <LogIn size={18} strokeWidth={2} aria-hidden="true" />
              {isRedirecting ? 'Redirecting to Okta…' : 'Continue with SSO'}
            </Button>
            <Button
              variant="secondary"
              className="btn--block btn--lg"
              onClick={() => void startSignIn()}
              disabled={isBusy}
            >
              <UserPlus size={18} strokeWidth={2} aria-hidden="true" />
              Create account
            </Button>
          </div>

          <p className="login__divider" aria-hidden="true">
            <span>Secure sign-in</span>
          </p>

          <p className="login__note">
            <ShieldCheck size={16} strokeWidth={2} aria-hidden="true" />
            Sign in with your username and password or your organization's SSO on Okta's secure page.
            Forgot your password? Reset it there.
          </p>
        </section>
      </main>
    </div>
  )
}
