import { Link } from 'react-router-dom'
import {
  ClientsIcon,
  JobsIcon,
  LogoutIcon,
  QuoteIcon,
  SearchIcon,
  TasksIcon,
  UsersIcon,
} from '../components/icons'
import { Badge, Card } from '../components/ui'
import { useAuth } from '../context/auth'
import { formatShortDate, formatTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import { ACTIVE_STATUSES, isOverdue, TASK_SELECT } from '../lib/tasks'
import { must, useQuery } from '../lib/useQuery'

const MODULES = [
  { to: '/jobs', label: 'Jobs & Drawings', note: 'Measure, annotate, diagram', Icon: JobsIcon },
  { to: '/search', label: 'Product Search', note: 'Pemko catalog', Icon: SearchIcon },
  { to: '/quotes', label: 'Quotes', note: 'Takeoffs & proposals', Icon: QuoteIcon },
  { to: '/tasks', label: 'Tasks', note: 'Follow-ups & reminders', Icon: TasksIcon },
  { to: '/clients', label: 'Clients', note: 'Contacts & history', Icon: ClientsIcon },
]

function Stat({ label, value, tone = 'text-slate-900', to }) {
  return (
    <Link to={to} className="flex-1">
      <Card className="px-3 py-3 text-center active:bg-slate-50">
        <div className={`text-3xl font-bold ${tone}`}>{value ?? '–'}</div>
        <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
      </Card>
    </Link>
  )
}

export default function Dashboard() {
  const { profile, isAdmin, signOut } = useAuth()

  const { data: myTasks } = useQuery(`dashboard-tasks:${profile.id}`, async () =>
    must(
      await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .eq('assigned_to', profile.id)
        .in('status', ACTIVE_STATUSES)
        .order('due_date')
        .order('due_time', { nullsFirst: false })
        .limit(100),
    ),
  )

  const { data: activeJobs } = useQuery('dashboard-jobs', async () => {
    const { count, error } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    if (error) throw error
    return count
  })

  const overdueCount = myTasks?.filter(isOverdue).length
  const firstName = profile.full_name?.split(' ')[0] || 'there'
  const modules = isAdmin
    ? [...MODULES, { to: '/admin/users', label: 'Users', note: 'Admin only', Icon: UsersIcon }]
    : MODULES

  return (
    <div className="px-4 pt-5">
      <h1 className="text-2xl font-bold">Hi, {firstName}</h1>

      <div className="mt-4 flex gap-3">
        <Stat label="My open tasks" value={myTasks?.length} to="/tasks" />
        <Stat
          label="Overdue"
          value={overdueCount}
          tone={overdueCount ? 'text-red-600' : 'text-slate-900'}
          to="/tasks"
        />
        <Stat label="Active jobs" value={activeJobs} to="/jobs" />
      </div>

      {myTasks?.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">Up next</h2>
          <Card className="divide-y divide-slate-100">
            {myTasks.slice(0, 5).map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{task.title || task.task_type}</div>
                  <div className="truncate text-sm text-slate-500">{task.task_type}</div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {isOverdue(task) ? (
                    <Badge tone="red">Overdue</Badge>
                  ) : (
                    <span className="text-slate-600">
                      {formatShortDate(task.due_date)}
                      {task.due_time && <span className="block">{formatTime(task.due_time)}</span>}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </Card>
        </section>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3">
        {modules.map(({ to, label, note, Icon }) => (
          <Link key={to} to={to}>
            <Card className="flex h-full min-h-28 flex-col justify-between p-4 active:bg-slate-50">
              <Icon className="size-8 text-blue-700" />
              <div>
                <div className="font-semibold">{label}</div>
                <div className="text-xs text-slate-500">{note}</div>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <button
        type="button"
        onClick={signOut}
        className="mt-8 mb-4 flex min-h-11 items-center gap-2 text-sm font-medium text-slate-500"
      >
        <LogoutIcon className="size-5" />
        Sign out ({profile.email})
      </button>
    </div>
  )
}
