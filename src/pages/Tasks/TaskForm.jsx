import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Segmented, Sheet } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { todayISO } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import {
  ACTIVE_STATUSES,
  computeReminderAt,
  PRIORITIES,
  REMINDER_OPTIONS,
  saveNewTask,
  TASK_TYPES,
} from '../../lib/tasks'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { useActiveUsers } from '../../lib/users'

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 }

function initialState(task, defaults, currentUserId) {
  if (!task) {
    return {
      taskType: '',
      customType: '',
      title: '',
      notes: '',
      dueDate: todayISO(),
      dueTime: '',
      assignedTo: currentUserId,
      priority: 'Medium',
      reminderTiming: '1_day',
      customAmount: 2,
      customUnit: 'hours',
      clientId: defaults.client_id || '',
      jobId: defaults.job_id || '',
    }
  }

  const isCustomType = !TASK_TYPES.includes(task.task_type)
  const minutes = task.reminder_minutes_before || 0
  const customUnit = minutes % 1440 === 0 && minutes ? 'days' : minutes % 60 === 0 && minutes ? 'hours' : 'minutes'
  return {
    taskType: isCustomType ? 'custom' : task.task_type,
    customType: isCustomType ? task.task_type : '',
    title: task.title || '',
    notes: task.notes || '',
    dueDate: task.due_date,
    dueTime: task.due_time?.slice(0, 5) || '',
    assignedTo: task.assigned_to || '',
    priority: task.priority || 'Medium',
    reminderTiming: task.reminder_timing || 'at_due',
    customAmount: minutes / UNIT_MINUTES[customUnit] || 1,
    customUnit,
    clientId: task.client_id || '',
    jobId: task.job_id || '',
  }
}

/**
 * Create or edit a task. Mount it only while open (so each open starts fresh).
 * `defaults` links a new task to the record it was created from:
 * { client_id } from a Client Record, { job_id } from a Job Record.
 */
export default function TaskForm({ task, defaults = {}, onClose, onSaved }) {
  const { profile } = useAuth()
  const users = useActiveUsers()
  const [form, setForm] = useState(() => initialState(task, defaults, profile.id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }))

  const { data: clients } = useQuery('task-form-clients', async () =>
    must(await supabase.from('clients').select('id, client_name').eq('is_active', true).order('client_name')),
  )
  const { data: jobs } = useQuery('task-form-jobs', async () =>
    must(await supabase.from('jobs').select('id, job_name, site_address').order('created_at', { ascending: false }).limit(200)),
  )

  const reminderOption = REMINDER_OPTIONS.find((o) => o.value === form.reminderTiming)
  const reminderMinutes =
    form.reminderTiming === 'custom'
      ? Math.max(0, Math.round(Number(form.customAmount) * UNIT_MINUTES[form.customUnit]))
      : reminderOption.minutes
  const taskTypeValue = form.taskType === 'custom' ? form.customType.trim() : form.taskType
  const reminderAt = form.dueDate
    ? computeReminderAt({ due_date: form.dueDate, due_time: form.dueTime, reminder_minutes_before: reminderMinutes })
    : null

  // Keep the current assignee selectable even if they've since been deactivated
  const assigneeMissing = form.assignedTo && !users.some((u) => u.id === form.assignedTo)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!taskTypeValue) return setError('Choose a task type (or enter a custom one).')
    if (!form.dueDate) return setError('Due date is required.')
    if (!form.assignedTo) return setError('Choose who this task is assigned to.')

    const fields = {
      task_type: taskTypeValue,
      title: form.title.trim() || taskTypeValue,
      notes: form.notes.trim() || null,
      due_date: form.dueDate,
      due_time: form.dueTime || null,
      assigned_to: form.assignedTo,
      priority: form.priority,
      reminder_timing: form.reminderTiming,
      reminder_minutes_before: reminderMinutes,
      reminder_scheduled_at: reminderAt,
      client_id: form.clientId || null,
      job_id: form.jobId || null,
    }

    setSaving(true)
    setError(null)
    try {
      if (task) {
        const scheduleChanged =
          new Date(fields.reminder_scheduled_at).getTime() !== new Date(task.reminder_scheduled_at).getTime()
        const patch = { ...fields }
        // A new reminder time re-arms the email (only for tasks still in progress)
        if (scheduleChanged && ACTIVE_STATUSES.includes(task.status)) patch.reminder_sent = false
        must(await supabase.from('tasks').update(patch).eq('id', task.id))
        toast('Task updated')
      } else {
        const { queued } = await saveNewTask({
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          status: 'Open',
          reminder_sent: false,
          ...fields,
        })
        toast(queued ? "Saved on this device — it'll sync when you're back online" : 'Task created')
      }
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  const assignee = users.find((u) => u.id === form.assignedTo)

  return (
    <Sheet
      open
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <Button type="submit" form="task-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </Button>
      }
    >
      <form id="task-form" onSubmit={handleSubmit} className="space-y-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Task type <span className="text-red-600">*</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {[...TASK_TYPES, 'custom'].map((type) => {
              const selected = form.taskType === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => set('taskType')(type)}
                  className={`min-h-11 rounded-full border px-3 py-2 text-left text-sm font-medium ${
                    selected
                      ? 'border-blue-700 bg-blue-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700 active:bg-slate-100'
                  }`}
                >
                  {type === 'custom' ? 'Custom…' : type}
                </button>
              )
            })}
          </div>
          {form.taskType === 'custom' && (
            <input
              className={`${inputClass} mt-2`}
              placeholder="Describe the task type"
              value={form.customType}
              onChange={set('customType')}
            />
          )}
        </div>

        <Field label="Title" hint="Leave blank to use the task type.">
          <input className={inputClass} value={form.title} onChange={set('title')} />
        </Field>

        <Field label="Notes">
          <textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={set('notes')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Due date" required>
            <input type="date" required className={inputClass} value={form.dueDate} onChange={set('dueDate')} />
          </Field>
          <Field label="Due time">
            <input type="time" className={inputClass} value={form.dueTime} onChange={set('dueTime')} />
          </Field>
        </div>

        <Field label="Assigned to" required>
          <select className={inputClass} value={form.assignedTo} onChange={set('assignedTo')} required>
            <option value="">Choose a person…</option>
            {assigneeMissing && <option value={form.assignedTo}>Current assignee (inactive)</option>}
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
                {u.id === profile.id ? ' (me)' : ''}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Priority</span>
          <Segmented options={PRIORITIES} value={form.priority} onChange={set('priority')} />
        </div>

        <Field
          label="Email reminder"
          hint={
            reminderAt &&
            `Emails ${assignee?.full_name || 'the assignee'} on ${new Date(reminderAt).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}${form.dueTime ? '' : ' (no due time set — reminders use 8:00 AM)'}`
          }
        >
          <select className={inputClass} value={form.reminderTiming} onChange={set('reminderTiming')}>
            {REMINDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {form.reminderTiming === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              className={inputClass}
              value={form.customAmount}
              onChange={set('customAmount')}
              aria-label="Amount"
            />
            <select className={inputClass} value={form.customUnit} onChange={set('customUnit')} aria-label="Unit">
              <option value="minutes">minutes before</option>
              <option value="hours">hours before</option>
              <option value="days">days before</option>
            </select>
          </div>
        )}

        <Field label="Linked client">
          <select className={inputClass} value={form.clientId} onChange={set('clientId')}>
            <option value="">None</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_name}
              </option>
            ))}
            {form.clientId && !clients?.some((c) => c.id === form.clientId) && (
              <option value={form.clientId}>Current client</option>
            )}
          </select>
        </Field>

        <Field label="Linked job">
          <select className={inputClass} value={form.jobId} onChange={set('jobId')}>
            <option value="">None</option>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.job_name}
                {j.site_address ? ` — ${j.site_address}` : ''}
              </option>
            ))}
            {form.jobId && !jobs?.some((j) => j.id === form.jobId) && (
              <option value={form.jobId}>Current job</option>
            )}
          </select>
        </Field>

        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
