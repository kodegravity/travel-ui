import { createContext, useContext } from 'react'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/** Display-only identity from Okta ID-token claims. Every field is optional. */
export interface UserProfile {
  name: string | null
  email: string | null
}

export interface AuthContextValue {
  status: AuthStatus
  /** True when the session ended (expired or renewal failed), so the UI can explain why. */
  sessionExpired: boolean
  /** Set when sign-in failed, so the UI can show a safe message. */
  authError: string | null
  user?: UserProfile | null
  /** Internal path to return to after the callback. Set once the callback is processed. */
  postLoginPath?: string | null
  /** Starts Okta-hosted sign-in. The optional path is validated before it is stored. */
  login: (returnPath?: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
