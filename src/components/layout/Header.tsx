import { Compass } from 'lucide-react'
import { useContext } from 'react'
import { AuthContext } from '../../auth/useAuth'
import { Button } from '../common/Button'

export function Header() {
  // Read directly so the header still renders where no AuthProvider exists (for example, in isolated tests).
  const auth = useContext(AuthContext)
  const signedInAs = auth?.user?.name ?? auth?.user?.email ?? null

  return (
    <header className="app-header">
      <div className="container app-header__inner">
        <span className="brand">
          <span className="brand__mark">
            <Compass size={18} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="brand__name">ROAM / AI</span>
        </span>
        {auth?.status === 'authenticated' && (
          <div className="app-header__user">
            {signedInAs && <span className="app-header__identity">{signedInAs}</span>}
            <Button variant="secondary" onClick={() => void auth.logout()}>
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  )
}
