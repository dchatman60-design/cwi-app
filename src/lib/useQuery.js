import { useCallback, useEffect, useRef, useState } from 'react'

/** Unwrap a Supabase { data, error } result, throwing on error. */
export function must({ data, error }) {
  if (error) throw error
  return data
}

/**
 * Minimal data-loading hook. `key` identifies the request — when it changes,
 * the fetcher runs again. `reload()` re-runs it; `mutate()` edits the cached
 * data in place for optimistic updates.
 */
export function useQuery(key, fetcher) {
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ token: null, data: undefined, error: null })
  const token = `${key}#${version}`

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then(
        (data) => {
          if (!cancelled) setState({ token, data, error: null })
        },
        (error) => {
          if (!cancelled) setState((s) => ({ token, data: s.data, error }))
        },
      )
    return () => {
      cancelled = true
    }
  }, [token])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const mutate = useCallback((updater) => setState((s) => ({ ...s, data: updater(s.data) })), [])

  return { data: state.data, error: state.error, loading: state.token !== token, reload, mutate }
}
