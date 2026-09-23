import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Button, EmptyState, Spinner } from './components/ui'
import { useAuth } from './context/auth'
import Dashboard from './pages/Dashboard'
import SignIn from './pages/SignIn'

const ProductSearch = lazy(() => import('./pages/Search/ProductSearch'))
const JobList = lazy(() => import('./pages/Jobs/JobList'))
const JobDetail = lazy(() => import('./pages/Jobs/JobDetail'))
const QuoteList = lazy(() => import('./pages/Quotes/QuoteList'))
const QuoteBuilder = lazy(() => import('./pages/Quotes/QuoteBuilder'))
const ClientList = lazy(() => import('./pages/Clients/ClientList'))
const ClientDetail = lazy(() => import('./pages/Clients/ClientDetail'))
const TaskList = lazy(() => import('./pages/Tasks/TaskList'))
const TaskDetail = lazy(() => import('./pages/Tasks/TaskDetail'))
const UserList = lazy(() => import('./pages/Admin/UserList'))
const MeasureCard = lazy(() => import('./pages/Drawing/MeasureCard'))

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  )
}

function NotOnTeam() {
  const { user, profile, signOut } = useAuth()
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-bold">
        {profile && !profile.is_active ? 'Account deactivated' : 'Not on the team list'}
      </h1>
      <p className="mt-3 text-slate-600">
        You're signed in as <strong className="break-all">{user.email}</strong>, but that email
        {profile && !profile.is_active ? ' has been deactivated.' : " isn't set up in the CWI Field App."}{' '}
        Ask an admin to add or reactivate you.
      </p>
      <Button variant="secondary" className="mt-6" onClick={signOut}>
        Sign out
      </Button>
    </div>
  )
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) {
    return <EmptyState title="Admins only">User management is limited to admin accounts.</EmptyState>
  }
  return children
}

function NotFound() {
  return <EmptyState title="Page not found">Check the link, or use the menu below.</EmptyState>
}

export default function App() {
  const { session, profile, loading } = useAuth()

  if (loading) return <FullScreenSpinner />
  if (!session) return <SignIn />
  if (!profile?.is_active) return <NotOnTeam />

  return (
    <Suspense fallback={<FullScreenSpinner />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="search" element={<ProductSearch />} />
          <Route path="jobs" element={<JobList />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="quotes" element={<QuoteList />} />
          <Route path="quotes/:id" element={<QuoteBuilder />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="tasks" element={<TaskList />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="measure-card" element={<MeasureCard />} />
          <Route
            path="admin/users"
            element={
              <RequireAdmin>
                <UserList />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
