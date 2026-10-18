import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { oktaAuth } from '../config/okta'
import { safeReturnPath } from './returnPath'
import { AuthContext, type AuthContextValue, type AuthStatus, type UserProfile } from './useAuth'

function readStringClaim(claims: Record<string, unknown> | undefined, key: string): string | null {
  const value = claims?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(oktaAuth ? 'loading' : 'anonymous')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [postLoginPath, setPostLoginPath] = useState<string | null>(null)

  useEffect(() => {
    const auth = oktaAuth
    if (!auth) return

    let active = true

    async function loadUser() {
      const claims = await auth!.getUser().catch(() => undefined)
      if (!active) return
      setUser({
        name: readStringClaim(claims, 'name') ?? readStringClaim(claims, 'preferred_username'),
        email: readStringClaim(claims, 'email'),
      })
    }

    async function init() {
      try {
        // Okta redirects back with ?code&state; the SDK exchanges them for tokens.
        if (auth!.isLoginRedirect()) {
          const state = new URL(window.location.href).searchParams.get('state') ?? undefined
          const target = safeReturnPath(auth!.getOriginalUri(state))
          await auth!.handleLoginRedirect()
          if (active) setPostLoginPath(target)
        }
        const authenticated = await auth!.isAuthenticated()
        if (active) setStatus(authenticated ? 'authenticated' : 'anonymous')
        if (active && authenticated) void loadUser()
      } catch {
        if (active) {
          setAuthError('Sign-in could not be completed. Please try again.')
          setStatus('anonymous')
        }
      }
    }

    async function onExpired() {
      const stillAuthenticated = await auth!.isAuthenticated().catch(() => false)
      if (!active || stillAuthenticated) return
      setSessionExpired(true)
      setUser(null)
      setStatus('anonymous')
    }

    void init()
    auth.tokenManager.on('expired', onExpired)
    auth.tokenManager.on('error', onExpired)

    return () => {
      active = false
      auth.tokenManager.off('expired', onExpired)
      auth.tokenManager.off('error', onExpired)
    }
  }, [])

  const login = useCallback(async (returnPath?: string) => {
    if (!oktaAuth) return
    setAuthError(null)
    setSessionExpired(false)
    // Stored with the Okta state value, so it survives the redirect without touching the URL.
    oktaAuth.setOriginalUri(safeReturnPath(returnPath))
    await oktaAuth.signInWithRedirect()
  }, [])

  const logout = useCallback(async () => {
    if (!oktaAuth) return
    setUser(null)
    setPostLoginPath(null)
    setStatus('anonymous')
    // Ends the Okta session and returns to /login, which must be an allowed post-logout URI in Okta.
    await oktaAuth.signOut({ postLogoutRedirectUri: `${window.location.origin}/login` })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, sessionExpired, authError, user, postLoginPath, login, logout }),
    [status, sessionExpired, authError, user, postLoginPath, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
