import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { LoginPage } from './pages/LoginPage'
import { ExplorePage } from './pages/ExplorePage'
import { ExploreRedirect } from './pages/ExploreRedirect'
import { HomePage } from './pages/HomePage'
import { PlaceDetailsPage } from './pages/PlaceDetailsPage'
import { TravelExplorerPage } from './pages/TravelExplorerPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExploreRedirect />} />
          <Route
            path="/explore/:cityId"
            element={
              <ProtectedRoute>
                <ExplorePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/places/:cityId/:placeId"
            element={
              <ProtectedRoute>
                <PlaceDetailsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/travel-mode"
            element={
              <ProtectedRoute>
                <TravelExplorerPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
