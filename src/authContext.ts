import { createContext, useContext } from 'react'
import type { User } from '../shared/domain'

export interface AuthState {
  user: User | null
  loading: boolean
  error: Error | null
  accept: (result: { user: User; csrf: string }) => void
  logout: () => Promise<void>
}
export const AuthContext = createContext<AuthState | null>(null)
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider is required.')
  return context
}
