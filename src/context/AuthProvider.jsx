import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncPendingTasks } from '../lib/tasks'
import { AuthContext } from './auth'

const profileCacheKey = (email) => `cwi:profile:${email}`

function readCachedProfile(email) {
  try {
    return JSON.parse(localStorage.getItem(profileCacheKey(email)))
  } catch {
    return null
  }
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * Tracks the Supabase session and the signed-in person's app_users row.
 * The profile is cached so the app still opens offline.
 */
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profileState, setProfileState] = useState({ email: null, profile: null })
  const [profileVersion, setProfileVersion] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const email = session?.user?.email?.toLowerCase() ?? null

  useEffect(() => {
    if (!email) return
    let cancelled = false

    supabase
      .from('app_users')
      .select('*')
      .ilike('email', escapeLike(email))
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          // Offline or a transient failure: fall back to the cached profile
          setProfileState({ email, profile: readCachedProfile(email) })
          return
        }
        try {
          localStorage.setItem(profileCacheKey(email), JSON.stringify(data))
        } catch {
          // ignore storage errors
        }
        setProfileState({ email, profile: data })
      })

    syncPendingTasks().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [email, profileVersion])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const refreshProfile = useCallback(() => setProfileVersion((v) => v + 1), [])

  const value = useMemo(() => {
    const profileLoaded = !email || profileState.email === email
    const profile = email && profileState.email === email ? profileState.profile : null
    return {
      session: session ?? null,
      user: session?.user ?? null,
      profile,
      isAdmin: Boolean(profile?.is_admin && profile?.is_active),
      loading: session === undefined || !profileLoaded,
      signOut,
      refreshProfile,
    }
  }, [session, email, profileState, signOut, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
