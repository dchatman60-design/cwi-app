import { Link } from 'react-router-dom'
import { CheckIcon, DismissIcon, EditIcon, LinkIcon } from '../../components/icons'
import { Badge, Card } from '../../components/ui'
import { formatShortDate, formatTime } from '../../lib/format'
import { ACTIVE_STATUSES, askDismissReason, isOverdue, taskClientName, updateTaskStatus } from '../../lib/tasks'
import { toast } from '../../lib/toast'

const PRIORITY_TONE = { High: 'redSoft', Medium: 'amber', Low: 'slate' }
const STATUS_TONE = { Open: 'blue', 'In Progress': 'blue', Completed: 'green', Dismissed: 'slate' }

function ActionButton({ label, onClick, to, children }) {
  const className =
    'flex min-h-11 flex-1 items-center justify-center gap-1.5 text-sm font-medium text-slate-600 active:bg-slate-100'
  if (to) {
    return (
      <Link to={to} className={className}>
        {children}
        {label}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
      {label}
    </button>
  )
}

export default function TaskCard({ task, onChanged, onEdit, selectable, selected, onToggleSelect }) {
  const overdue = isOverdue(task)
  const active = ACTIVE_STATUSES.includes(task.status)
  const clientName = taskClientName(task)
  const linkedPath = task.job_id ? `/jobs/${task.job_id}` : task.client_id ? `/clients/${task.client_id}` : null

  async function run(action, message) {
    try {
      await action()
      toast(message)
      onChanged?.()
    } catch (err) {
      toast(err.message || 'Could not update the task', 'error')
    }
  }

  function dismiss() {
    const reason = askDismissReason()
    if (reason === null) return
    run(() => updateTaskStatus([task.id], 'Dismissed', reason), 'Task dismissed')
  }

  return (
    <Card className={`overflow-hidden ${overdue ? 'border-red-300 bg-red-50/40' : ''}`}>
      <div className="flex gap-3 px-4 pt-3 pb-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(task.id)}
            className="mt-1 size-6 shrink-0 accent-blue-700"
            aria-label={`Select ${task.title}`}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {task._pending ? (
              <span className="font-semibold break-words">{task.title}</span>
            ) : (
              <Link to={`/tasks/${task.id}`} className="font-semibold break-words text-slate-900">
                {task.title}
              </Link>
            )}
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {overdue && <Badge tone="red">Overdue</Badge>}
              {task._pending && <Badge tone="amber">Waiting to sync</Badge>}
              {task.status === 'In Progress' && <Badge tone="blue">In progress</Badge>}
              <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
            </div>
          </div>
          <div className="mt-1 text-sm break-words text-slate-500">
            {task.title !== task.task_type && <span>{task.task_type} · </span>}
            <span className={overdue ? 'font-semibold text-red-700' : ''}>
              Due {formatShortDate(task.due_date)}
              {task.due_time && ` ${formatTime(task.due_time)}`}
            </span>
            {task.assignee?.full_name && <span> · {task.assignee.full_name}</span>}
          </div>
          {(clientName || task.job) && (
            <div className="mt-0.5 text-sm break-words text-slate-500">
              {[clientName, task.job?.job_name].filter(Boolean).join(' · ')}
            </div>
          )}
          {!active && (
            <div className="mt-1.5">
              <Badge tone={STATUS_TONE[task.status]}>{task.status}</Badge>
            </div>
          )}
        </div>
      </div>

      {!task._pending && (
        <div className="flex border-t border-slate-100">
          {active && (
            <>
              <ActionButton
                label="Complete"
                onClick={() => run(() => updateTaskStatus([task.id], 'Completed'), 'Task completed')}
              >
                <CheckIcon className="size-5" />
              </ActionButton>
              <ActionButton label="Dismiss" onClick={dismiss}>
                <DismissIcon className="size-5" />
              </ActionButton>
            </>
          )}
          {onEdit && (
            <ActionButton label="Edit" onClick={() => onEdit(task)}>
              <EditIcon className="size-5" />
            </ActionButton>
          )}
          {linkedPath && (
            <ActionButton label={task.job_id ? 'Job' : 'Client'} to={linkedPath}>
              <LinkIcon className="size-5" />
            </ActionButton>
          )}
        </div>
      )}
    </Card>
  )
}
