import { useEffect, useState } from 'react'
import { getPendingTasks, PENDING_CHANGED_EVENT } from '../../lib/offlineQueue'

/** Tasks created offline that haven't reached Supabase yet (flagged _pending). */
export function usePendingTasks() {
  const [pending, setPending] = useState([])
  useEffect(() => {
    const refresh = () =>
      getPendingTasks()
        .then((tasks) => setPending(tasks.map((t) => ({ ...t, _pending: true }))))
        .catch(() => {})
    refresh()
    window.addEventListener(PENDING_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PENDING_CHANGED_EVENT, refresh)
  }, [])
  return pending
}
