import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from './useAuth'
import { ProtectedRoute } from './ProtectedRoute'

const authState = vi.hoisted(() => ({ value: {} as Partial<AuthContextValue> }))

vi.mock('./useAuth', () => ({
  useAuth: () => authState.value,
}))

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <p>Protected content</p>
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('shows protected content to signed-in users', () => {
    authState.value = { status: 'authenticated' }
    renderAt('/')
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('redirects anonymous visitors to /login without rendering protected content', () => {
    authState.value = { status: 'anonymous' }
    renderAt('/')
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('waits while the session is loading instead of redirecting', () => {
    authState.value = { status: 'loading' }
    renderAt('/')
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
    expect(screen.getByText('Signing you in…')).toBeInTheDocument()
  })
})
