import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, EmptyState, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { formatDate, formatDateTime, formatTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import {
  ACTIVE_STATUSES,
  askDismissReason,
  isOverdue,
  REMINDER_OPTIONS,
  TASK_SELECT,
  taskClientName,
  updateTaskStatus,
} from '../../lib/tasks'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import TaskForm from './TaskForm'

function Row({ label, children }) {
  return (
    <div className="px-4 py-3">
      <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-900">{children}</dd>
    </div>
  )
}

function reminderText(task) {
  const option = REMINDER_OPTIONS.find((o) => o.value === task.reminder_timing)
  const label =
    task.reminder_timing === 'custom'
      ? `${task.reminder_minutes_before} minutes before`
      : option?.label || task.reminder_timing
  if (!ACTIVE_STATUSES.includes(task.status)) return `${label} — cancelled (task ${task.status.toLowerCase()})`
  if (task.reminder_sent) return `${label} — sent`
  return `${label} — scheduled for ${formatDateTime(task.reminder_scheduled_at)}`
}

export default function TaskDetail() {
  const { id } = useParams()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data: task, error, loading, reload } = useQuery(`task:${id}`, async () =>
    must(await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()),
  )

  async function changeStatus(status, reason) {
    setBusy(true)
    try {
      await updateTaskStatus([task.id], status, reason)
      toast(`Task ${status === 'In Progress' ? 'started' : status.toLowerCase()}`)
      reload()
    } catch (err) {
      toast(err.message || 'Could not update the task', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !task) return <Spinner />
  if (error) return <ErrorMessage error={error} className="m-4" />
  if (!task) {
    return (
      <>
        <PageHeader title="Task" back="/tasks" />
        <EmptyState title="Task not found">It may have been removed, or you may not have access.</EmptyState>
      </>
    )
  }

  const active = ACTIVE_STATUSES.includes(task.status)
  const overdue = isOverdue(task)
  const clientName = taskClientName(task)
  const clientId = task.client?.id || task.job?.client?.id

  return (
    <div>
      <PageHeader title={task.title} subtitle={task.task_type} back="/tasks" />

      <div className="flex flex-wrap gap-2 px-4">
        <Badge tone={active ? 'blue' : task.status === 'Completed' ? 'green' : 'slate'}>{task.status}</Badge>
        <Badge tone={task.priority === 'High' ? 'redSoft' : task.priority === 'Medium' ? 'amber' : 'slate'}>
          {task.priority} priority
        </Badge>
        {overdue && <Badge tone="red">Overdue</Badge>}
      </div>

      <Card className="mx-4 mt-4">
        <dl className="divide-y divide-slate-100">
          <Row label="Due">
            <span className={overdue ? 'font-semibold text-red-700' : ''}>
              {formatDate(task.due_date)}
              {task.due_time && ` at ${formatTime(task.due_time)}`}
            </span>
          </Row>
          <Row label="Assigned to">{task.assignee?.full_name || '—'}</Row>
          {clientName && (
            <Row label="Client">
              {clientId ? (
                <Link to={`/clients/${clientId}`} className="font-medium text-blue-700">
                  {clientName}
                </Link>
              ) : (
                clientName
              )}
            </Row>
          )}
          {task.job && (
            <Row label="Job">
              <Link to={`/jobs/${task.job.id}`} className="font-medium text-blue-700">
                {task.job.job_name}
              </Link>
              {task.job.site_address && <div className="text-sm text-slate-500">{task.job.site_address}</div>}
            </Row>
          )}
          {task.notes && (
            <Row label="Notes">
              <p className="whitespace-pre-wrap">{task.notes}</p>
            </Row>
          )}
          <Row label="Email reminder">{reminderText(task)}</Row>
          {task.status === 'Dismissed' && task.dismissed_reason && (
            <Row label="Dismissed because">{task.dismissed_reason}</Row>
          )}
          <Row label="Created">{formatDateTime(task.created_at)}</Row>
        </dl>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 px-4">
        {task.status === 'Open' && (
          <Button variant="secondary" disabled={busy} onClick={() => changeStatus('In Progress')}>
            Start
          </Button>
        )}
        {active && (
          <Button disabled={busy} onClick={() => changeStatus('Completed')}>
            Complete
          </Button>
        )}
        {active && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              const reason = askDismissReason()
              if (reason !== null) changeStatus('Dismissed', reason)
            }}
          >
            Dismiss
          </Button>
        )}
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>

      {editing && <TaskForm task={task} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  )
}
