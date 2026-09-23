import { useMemo, useState } from 'react'
import { FilterIcon, PlusIcon } from '../../components/icons'
import { Button, EmptyState, ErrorMessage, Field, inputClass, PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { supabase } from '../../lib/supabase'
import {
  ACTIVE_STATUSES,
  dueDateTime,
  isOverdue,
  PRIORITIES,
  PRIORITY_RANK,
  STATUSES,
  TASK_SELECT,
  TASK_TYPES,
  taskClientName,
  updateTaskStatus,
} from '../../lib/tasks'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { useActiveUsers } from '../../lib/users'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import { usePendingTasks } from './usePendingTasks'

const DEFAULT_FILTERS = {
  status: 'active',
  type: 'all',
  priority: 'all',
  assignee: 'all',
  from: '',
  to: '',
  sort: 'due',
}

const SORTERS = {
  due: (a, b) => dueDateTime(a) - dueDateTime(b),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || dueDateTime(a) - dueDateTime(b),
  client: (a, b) => {
    const ca = taskClientName(a)
    const cb = taskClientName(b)
    if (!ca !== !cb) return ca ? -1 : 1 // tasks without a client go last
    return ca.localeCompare(cb) || dueDateTime(a) - dueDateTime(b)
  },
}

function matches(task, f, myId) {
  if (f.status === 'active' ? !ACTIVE_STATUSES.includes(task.status) : f.status !== 'all' && task.status !== f.status)
    return false
  if (f.type === 'custom' ? TASK_TYPES.includes(task.task_type) : f.type !== 'all' && task.task_type !== f.type)
    return false
  if (f.priority !== 'all' && task.priority !== f.priority) return false
  if (f.assignee !== 'all' && task.assigned_to !== (f.assignee === 'me' ? myId : f.assignee)) return false
  if (f.from && task.due_date < f.from) return false
  if (f.to && task.due_date > f.to) return false
  return true
}

export default function TaskList() {
  const { profile } = useAuth()
  const users = useActiveUsers()
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const [bulkBusy, setBulkBusy] = useState(false)

  const { data, error, loading, reload } = useQuery('tasks', async () =>
    must(await supabase.from('tasks').select(TASK_SELECT).order('due_date').limit(2000)),
  )
  const pending = usePendingTasks()

  const tasks = useMemo(() => {
    const usersById = Object.fromEntries(users.map((u) => [u.id, u]))
    const withPending = [
      ...pending.map((t) => ({ ...t, assignee: usersById[t.assigned_to] })),
      ...(data || []),
    ]
    return withPending.filter((t) => matches(t, filters, profile.id)).sort(SORTERS[filters.sort])
  }, [data, pending, users, filters, profile.id])

  const overdueCount = tasks.filter(isOverdue).length
  const activeFilterCount = Object.keys(DEFAULT_FILTERS).filter(
    (k) => k !== 'sort' && filters[k] !== DEFAULT_FILTERS[k],
  ).length

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  function toggleSelect(id) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function completeSelected() {
    setBulkBusy(true)
    try {
      await updateTaskStatus([...selected], 'Completed')
      toast(`${selected.size} task${selected.size === 1 ? '' : 's'} completed`)
      stopSelecting()
      reload()
    } catch (err) {
      toast(err.message || 'Could not update tasks', 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={data && `${tasks.length} shown${overdueCount ? ` · ${overdueCount} overdue` : ''}`}
        action={
          <Button onClick={() => setEditing('new')} aria-label="New task">
            <PlusIcon className="size-5" /> New
          </Button>
        }
      />

      <div className="flex gap-2 px-4">
        <Button variant="secondary" className="flex-1" onClick={() => setShowFilters((s) => !s)}>
          <FilterIcon className="size-5" />
          Filter & sort{activeFilterCount ? ` (${activeFilterCount})` : ''}
        </Button>
        <Button variant="secondary" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
          {selecting ? 'Cancel' : 'Select'}
        </Button>
      </div>

      {showFilters && (
        <div className="mx-4 mt-3 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <Field label="Status">
            <select className={inputClass} value={filters.status} onChange={setFilter('status')}>
              <option value="active">Open & In Progress</option>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
              <option value="all">All statuses</option>
            </select>
          </Field>
          <Field label="Priority">
            <select className={inputClass} value={filters.priority} onChange={setFilter('priority')}>
              <option value="all">All</option>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Task type">
              <select className={inputClass} value={filters.type} onChange={setFilter('type')}>
                <option value="all">All types</option>
                {TASK_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
                <option value="custom">Custom types</option>
              </select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Assigned to">
              <select className={inputClass} value={filters.assignee} onChange={setFilter('assignee')}>
                <option value="all">Everyone</option>
                <option value="me">Me</option>
                {users
                  .filter((u) => u.id !== profile.id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label="Due from">
            <input type="date" className={inputClass} value={filters.from} onChange={setFilter('from')} />
          </Field>
          <Field label="Due to">
            <input type="date" className={inputClass} value={filters.to} onChange={setFilter('to')} />
          </Field>
          <div className="col-span-2">
            <Field label="Sort by">
              <select className={inputClass} value={filters.sort} onChange={setFilter('sort')}>
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
                <option value="client">Client name</option>
              </select>
            </Field>
          </div>
          <Button variant="ghost" className="col-span-2" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Reset filters
          </Button>
        </div>
      )}

      {selecting && (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mt-3 flex items-center gap-3 bg-blue-700 px-4 py-2 text-white">
          <span className="flex-1 font-medium">{selected.size} selected</span>
          <Button
            variant="secondary"
            disabled={!selected.size || bulkBusy}
            onClick={completeSelected}
            className="border-0"
          >
            Mark completed
          </Button>
        </div>
      )}

      <div className="mt-3 space-y-3 px-4">
        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {data && tasks.length === 0 && (
          <EmptyState title="No tasks match">Try changing the filters, or create a new task.</EmptyState>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onChanged={reload}
            onEdit={setEditing}
            selectable={selecting && !task._pending && ACTIVE_STATUSES.includes(task.status)}
            selected={selected.has(task.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>

      {editing && (
        <TaskForm task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  )
}
