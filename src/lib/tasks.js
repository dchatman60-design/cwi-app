import { supabase } from './supabase'
import { todayISO } from './format'
import { getPendingTasks, queueTask, removePendingTask } from './offlineQueue'

export const TASK_TYPES = [
  'Follow Up Needed',
  'Supplier Pricing Confirmation Needed',
  'Proposal Pending Client Approval',
  'Purchase Order to be Submitted',
  'Payment Follow Up',
  'Site Visit Required',
  'Material Order Needed',
  'Custom Drawing Required',
  'Permit or Compliance Check',
  'Job Scheduled — Confirm with Client',
  'Warranty or Callback Visit',
]

export const PRIORITIES = ['High', 'Medium', 'Low']
export const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 }

export const STATUSES = ['Open', 'In Progress', 'Completed', 'Dismissed']
export const ACTIVE_STATUSES = ['Open', 'In Progress']

export const REMINDER_OPTIONS = [
  { value: 'at_due', label: 'At due time', minutes: 0 },
  { value: '1_hour', label: '1 hour before', minutes: 60 },
  { value: '3_hours', label: '3 hours before', minutes: 180 },
  { value: '1_day', label: '1 day before', minutes: 1440 },
  { value: '2_days', label: '2 days before', minutes: 2880 },
  { value: '1_week', label: '1 week before', minutes: 10080 },
  { value: 'custom', label: 'Custom', minutes: null },
]

/** Tasks with a date but no time are treated as due at 8:00 AM for reminders. */
export const DEFAULT_DUE_TIME = '08:00'

/** Columns + linked records every task view needs. */
export const TASK_SELECT = `*,
  assignee:assigned_to(id, full_name, email),
  client:client_id(id, client_name),
  job:job_id(id, job_name, site_address, client:client_id(id, client_name))`

export function dueDateTime({ due_date, due_time }) {
  const [y, m, d] = due_date.split('-').map(Number)
  const [hh, mm] = (due_time || DEFAULT_DUE_TIME).split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

/** reminder_scheduled_at = due date + due time − reminder offset */
export function computeReminderAt({ due_date, due_time, reminder_minutes_before }) {
  const due = dueDateTime({ due_date, due_time })
  return new Date(due.getTime() - (reminder_minutes_before || 0) * 60_000).toISOString()
}

export function isOverdue(task) {
  if (!ACTIVE_STATUSES.includes(task.status)) return false
  if (task.due_time) return dueDateTime(task) < new Date()
  return task.due_date < todayISO()
}

/** Client name for a task, whether it was created from a client or a job. */
export function taskClientName(task) {
  return task.client?.client_name || task.job?.client?.client_name || ''
}

function isNetworkError(error) {
  return !error?.code && /fetch|network|load failed/i.test(error?.message || '')
}

/**
 * Save a new task (which must already have an `id`). When offline — or when
 * the request fails for network reasons — the task is queued in IndexedDB and
 * synced later. Reminders for queued tasks go out once they reach Supabase.
 */
export async function saveNewTask(task) {
  if (!navigator.onLine) {
    await queueTask(task)
    return { queued: true }
  }
  const { error } = await supabase.from('tasks').insert(task)
  if (!error) return { queued: false }
  if (isNetworkError(error)) {
    await queueTask(task)
    return { queued: true }
  }
  throw error
}

let syncInFlight = null

/** Push any offline-created tasks to Supabase. Safe to call often. */
export function syncPendingTasks() {
  if (!syncInFlight) {
    syncInFlight = (async () => {
      let synced = 0
      const pending = await getPendingTasks()
      for (const task of pending) {
        // eslint-disable-next-line no-unused-vars
        const { _pending, ...row } = task
        const { error } = await supabase
          .from('tasks')
          .upsert(row, { onConflict: 'id', ignoreDuplicates: true })
        if (error) {
          if (isNetworkError(error)) break
          console.error('Could not sync offline task', task.id, error)
          continue
        }
        await removePendingTask(task.id)
        synced++
      }
      return synced
    })().finally(() => {
      syncInFlight = null
    })
  }
  return syncInFlight
}

/**
 * Change status for one or more tasks. Completing or dismissing a task marks
 * reminder_sent = true, which cancels any pending email reminder.
 */
export async function updateTaskStatus(ids, status, dismissedReason) {
  const patch = { status }
  if (status === 'Completed' || status === 'Dismissed') patch.reminder_sent = true
  if (status === 'Dismissed') patch.dismissed_reason = dismissedReason || null
  const { error } = await supabase.from('tasks').update(patch).in('id', ids)
  if (error) throw error
}

/** Ask for a dismissal reason. Returns null if the user cancels. */
export function askDismissReason() {
  const reason = window.prompt('Reason for dismissing (optional):', '')
  return reason === null ? null : reason.trim()
}
