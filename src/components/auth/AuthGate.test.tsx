import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../../auth/useAuth'
import { AuthGate } from './AuthGate'

const authState = vi.hoisted(() => ({ value: null as AuthContextValue | null }))

vi.mock('../../auth/useAuth', () => ({
  useAuth: () => authState.value,
}))

vi.mock('../../config/okta', () => ({
  OKTA_CONFIGURED: true,
}))

function setAuth(overrides: Partial<AuthContextValue>) {
  authState.value = {
    status: 'anonymous',
    sessionExpired: false,
    authError: null,
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('AuthGate', () => {
  it('shows a sign-in button and hides children when signed out', () => {
    setAuth({})
    render(<AuthGate><p>Protected content</p></AuthGate>)
    expect(screen.getByRole('button', { name: 'Sign in with Okta' })).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('explains an expired session', () => {
    setAuth({ sessionExpired: true })
    render(<AuthGate><p>Protected content</p></AuthGate>)
    expect(screen.getByRole('status')).toHaveTextContent('Your session has expired')
  })

  it('shows a loading state while authentication is in progress', () => {
    setAuth({ status: 'loading' })
    render(<AuthGate><p>Protected content</p></AuthGate>)
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders children and a sign-out button when authenticated', async () => {
    const logout = vi.fn(async () => undefined)
    setAuth({ status: 'authenticated', logout })
    render(<AuthGate><p>Protected content</p></AuthGate>)
    expect(screen.getByText('Protected content')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
