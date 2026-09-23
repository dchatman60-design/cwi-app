import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

/** { session, user, profile, isAdmin, loading, signOut, refreshProfile } */
export function useAuth() {
  return useContext(AuthContext)
}
