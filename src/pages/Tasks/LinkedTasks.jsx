import { useState } from 'react'
import { PlusIcon } from '../../components/icons'
import { Button, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { ACTIVE_STATUSES, dueDateTime, TASK_SELECT } from '../../lib/tasks'
import { must, useQuery } from '../../lib/useQuery'
import TaskCard from './TaskCard'
import TaskForm from './TaskForm'
import { usePendingTasks } from './usePendingTasks'

/** Tasks linked to one job or client, with a "New task" button pre-linked to it. */
export default function LinkedTasks({ jobId, clientId }) {
  const [showHistory, setShowHistory] = useState(false)
  const [editing, setEditing] = useState(null) // null | 'new' | task
  const column = jobId ? 'job_id' : 'client_id'
  const recordId = jobId || clientId

  const { data, error, loading, reload } = useQuery(`linked-tasks:${column}:${recordId}`, async () =>
    must(await supabase.from('tasks').select(TASK_SELECT).eq(column, recordId).order('due_date')),
  )
  const pending = usePendingTasks().filter((t) => t[column] === recordId)

  const tasks = [...pending, ...(data || [])].sort((a, b) => dueDateTime(a) - dueDateTime(b))
  const active = tasks.filter((t) => ACTIVE_STATUSES.includes(t.status))
  const history = tasks.filter((t) => !ACTIVE_STATUSES.includes(t.status))

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={() => setEditing('new')}>
        <PlusIcon className="size-5" /> New task
      </Button>

      <ErrorMessage error={error} />
      {loading && !data && <Spinner />}
      {data && active.length === 0 && <EmptyState title="No open tasks" />}
      {active.map((task) => (
        <TaskCard key={task.id} task={task} onChanged={reload} onEdit={setEditing} />
      ))}

      {history.length > 0 && (
        <Button variant="ghost" className="w-full" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? 'Hide' : 'Show'} completed & dismissed ({history.length})
        </Button>
      )}
      {showHistory &&
        history.map((task) => <TaskCard key={task.id} task={task} onChanged={reload} onEdit={setEditing} />)}

      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          defaults={{ [column]: recordId }}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
