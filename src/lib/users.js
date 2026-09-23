import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const CACHE_KEY = 'cwi:active-users'

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || []
  } catch {
    return []
  }
}

/**
 * Active app users for assignment dropdowns. Inactive users are never
 * returned. The last list is cached so task creation still works offline.
 */
export function useActiveUsers() {
  const [users, setUsers] = useState(readCache)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('app_users')
      .select('id, full_name, email, role')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setUsers(data)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data))
        } catch {
          // storage full or unavailable — the in-memory list still works
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return users
}
