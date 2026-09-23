import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/auth'
import { getPendingTasks, PENDING_CHANGED_EVENT } from '../lib/offlineQueue'
import { syncPendingTasks } from '../lib/tasks'
import { toast } from '../lib/toast'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { ClientsIcon, JobsIcon, OfflineIcon, QuoteIcon, SearchIcon, TasksIcon, UsersIcon } from './icons'
import { Spinner, Toaster } from './ui'

const NAV_ITEMS = [
  { to: '/jobs', label: 'Jobs', Icon: JobsIcon },
  { to: '/search', label: 'Products', Icon: SearchIcon },
  { to: '/quotes', label: 'Quotes', Icon: QuoteIcon },
  { to: '/tasks', label: 'Tasks', Icon: TasksIcon },
  { to: '/clients', label: 'Clients', Icon: ClientsIcon },
]

function usePendingCount() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const refresh = () =>
      getPendingTasks()
        .then((tasks) => setCount(tasks.length))
        .catch(() => {})
    refresh()
    window.addEventListener(PENDING_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PENDING_CHANGED_EVENT, refresh)
  }, [])
  return count
}

/** On phones, keep the focused field visible above the on-screen keyboard. */
function useKeepFocusedFieldVisible() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    const onFocus = (e) => {
      if (!e.target.matches?.('input, textarea, select')) return
      setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
    }
    document.addEventListener('focusin', onFocus)
    return () => document.removeEventListener('focusin', onFocus)
  }, [])
}

export default function Layout() {
  const { isAdmin } = useAuth()
  const online = useOnlineStatus()
  const pendingCount = usePendingCount()
  useKeepFocusedFieldVisible()

  // Sync offline-created tasks on reconnect, then keep retrying every minute
  // while any are left (e.g. the session needed refreshing first).
  useEffect(() => {
    if (!online) return
    const sync = () =>
      syncPendingTasks()
        .then((synced) => {
          if (synced) toast(`Synced ${synced} offline task${synced === 1 ? '' : 's'}`)
        })
        .catch(() => {})
    sync()
    if (!pendingCount) return
    const timer = setInterval(sync, 60_000)
    return () => clearInterval(timer)
  }, [online, pendingCount])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 bg-slate-900 pt-[env(safe-area-inset-top)] text-white print:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex min-h-11 items-center gap-2">
            <span className="rounded-md bg-white px-1.5 py-0.5 text-sm font-black tracking-tight text-slate-900">
              CWI
            </span>
            <span className="font-semibold">Field App</span>
          </Link>
          {isAdmin && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex size-11 items-center justify-center rounded-full ${isActive ? 'bg-white/15' : ''}`
              }
              aria-label="User management"
            >
              <UsersIcon />
            </NavLink>
          )}
        </div>
        {(!online || pendingCount > 0) && (
          <div
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${
              online ? 'bg-blue-100 text-blue-900' : 'bg-amber-400 text-amber-950'
            }`}
            role="status"
          >
            {!online && <OfflineIcon className="size-5 shrink-0" />}
            <span>
              {online
                ? `${pendingCount} offline task${pendingCount === 1 ? '' : 's'} waiting to sync…`
                : `You're offline. New tasks are saved on this device${
                    pendingCount ? ` (${pendingCount} waiting)` : ''
                  } and sync when you reconnect.`}
            </span>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] print:pb-0">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] print:hidden"
        aria-label="Main"
      >
        <ul className="mx-auto flex max-w-3xl">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                    isActive ? 'text-blue-700' : 'text-slate-500'
                  }`
                }
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Toaster />
    </div>
  )
}
