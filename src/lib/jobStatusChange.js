import { jobStatusLabel, normalizeJobStatus } from '../pages/Jobs/jobStatus'
import { todayISO } from './format'
import { supabase } from './supabase'
import { ACTIVE_STATUSES, computeReminderAt, DECLINE_TASK_TYPE, saveNewTask } from './tasks'
import { must } from './useQuery'

/**
 * When we turn a job down, someone has to call the client and tell them.
 * Adds a High-priority task for today (reminder email at 8:00 AM, or on the
 * next reminder run if that's already passed), linked to the job and client,
 * assigned to whoever declined the job. Skipped if one is already open.
 * Returns true when a task was created.
 */
export async function createDeclineCallTask(jobId, userId) {
  const job = must(
    await supabase
      .from('jobs')
      .select('id, job_name, site_address, client_id, client:client_id(client_name, contact_name, phone)')
      .eq('id', jobId)
      .single(),
  )
  const open = must(
    await supabase
      .from('tasks')
      .select('id')
      .eq('job_id', jobId)
      .eq('task_type', DECLINE_TASK_TYPE)
      .in('status', ACTIVE_STATUSES),
  )
  if (open.length) return false

  const client = job.client
  const who = client?.contact_name || client?.client_name || 'the client'
  const contact = [client?.contact_name, client?.phone].filter(Boolean).join(' · ')
  const due = { due_date: todayISO(), due_time: null, reminder_minutes_before: 0 }
  await saveNewTask({
    id: crypto.randomUUID(),
    task_type: DECLINE_TASK_TYPE,
    title: `Call ${who} — we're declining ${job.job_name}`,
    notes: [
      `Job marked ${jobStatusLabel('declined')}. Let the client know we won't be taking it on.`,
      job.site_address ? `Job address: ${job.site_address}` : null,
      contact ? `Contact: ${contact}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    ...due,
    assigned_to: userId || null,
    client_id: job.client_id || null,
    job_id: job.id,
    priority: 'High',
    status: 'Open',
    reminder_timing: 'at_due',
    reminder_sent: false,
    reminder_scheduled_at: computeReminderAt(due),
  })
  return true
}

/**
 * Change a job's status. Moving it to Declined also adds the follow-up call
 * task. Returns { updated_at, message } — message is ready for a toast.
 */
export async function setJobStatus(job, status, { userId } = {}) {
  const previous = normalizeJobStatus(job.status)
  const updated_at = new Date().toISOString()
  must(await supabase.from('jobs').update({ status, updated_at }).eq('id', job.id))
  let message = `${job.job_name} → ${jobStatusLabel(status)}`
  if (status === 'declined' && previous !== 'declined') {
    try {
      if (await createDeclineCallTask(job.id, userId)) message += ' · call task added to Tasks'
    } catch (err) {
      console.error('Could not create the decline call task', err)
      message += ' · couldn’t add the call task — add it in Tasks'
    }
  }
  return { updated_at, message }
}
