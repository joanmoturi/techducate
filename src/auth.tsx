import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { User } from '../shared/domain'
import { api, setCsrf } from './api'
import { AuthContext, useAuth, type AuthState } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const initialRequest = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    initialRequest.current = controller
    api<{ user: User | null; csrf: string | null }>('/auth/me', 'GET', undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setUser(result.user)
        setCsrf(result.csrf)
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure : new Error('Cannot connect to the server.'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])
  const value: AuthState = {
    user,
    loading,
    error,
    accept(result) {
      initialRequest.current?.abort()
      setUser(result.user)
      setCsrf(result.csrf)
      setError(null)
      setLoading(false)
    },
    async logout() {
      await api('/auth/logout', 'POST', {})
      initialRequest.current?.abort()
      setUser(null)
      setCsrf(null)
      setLoading(false)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function Protected({ children, roles }: { children: ReactNode; roles?: User['role'][] }) {
  const { user, loading, error } = useAuth()
  const location = useLocation()
  if (loading)
    return (
      <div className="container section" role="status">
        Connecting to your account...
      </div>
    )
  if (error)
    return (
      <div className="container section alert error" role="alert">
        {error.message} Refresh to retry.
      </div>
    )
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (roles && !roles.includes(user.role))
    return (
      <div className="container section">
        <h1>This area is for authorised staff.</h1>
        <p>Your account does not have permission to enter.</p>
      </div>
    )
  return children
}
