import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Segmented, Sheet } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { todayISO } from '../../lib/format'
import {
  advanceJobForEntry,
  ENTRY_SELECT,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  formatHours,
  hoursBetween,
} from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, mustDelete, useQuery } from '../../lib/useQuery'
import { useActiveUsers } from '../../lib/users'
import { JOB_STATUSES, normalizeJobStatus } from '../Jobs/jobStatus'

function initialState(entry, defaults, currentUserId) {
  if (entry) {
    return {
      entry_type: entry.entry_type,
      job_id: entry.job_id || '',
      title: entry.title || '',
      entry_date: entry.entry_date,
      end_date: entry.end_date || '',
      assigned_to: entry.assigned_to || '',
      start_time: entry.start_time?.slice(0, 5) || '',
      end_time: entry.end_time?.slice(0, 5) || '',
      hours: entry.hours ?? '',
      status: entry.status,
      notes: entry.notes || '',
    }
  }
  const date = defaults.entry_date || todayISO()
  return {
    entry_type: defaults.entry_type || 'job',
    job_id: defaults.job_id || '',
    title: '',
    entry_date: date,
    end_date: '',
    assigned_to: currentUserId || '',
    start_time: '',
    end_time: '',
    hours: '',
    // Booking a day that has already passed usually means logging work done
    status: date < todayISO() ? 'done' : 'scheduled',
    notes: '',
  }
}

/**
 * Add or edit a schedule entry: a job visit (time window + hours on site),
 * an appointment, or a day / days with no work. Mount only while open.
 * onSaved receives the saved row.
 */
export default function EntryForm({ entry, defaults = {}, onClose, onSaved }) {
  const { profile } = useAuth()
  const users = useActiveUsers()
  const [form, setForm] = useState(() => initialState(entry, defaults, profile?.id))
  // Hours follow the time window until someone types their own number
  const [hoursTouched, setHoursTouched] = useState(entry?.hours !== null && entry?.hours !== undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: jobs } = useQuery('entry-form-jobs', async () =>
    must(
      await supabase
        .from('jobs')
        .select('id, job_name, status, client:client_id(client_name)')
        .order('job_name'),
    ),
  )

  const isJob = form.entry_type === 'job'
  const isOff = form.entry_type === 'off'
  const autoHours = hoursBetween(form.start_time, form.end_time)
  const shownHours = hoursTouched ? form.hours : (autoHours ?? '')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }))

  // Jobs grouped by board column; finished jobs only if already linked
  const jobGroups = JOB_STATUSES.map((s) => ({
    ...s,
    jobs: (jobs || []).filter(
      (j) =>
        normalizeJobStatus(j.status) === s.value &&
        (!['complete', 'lost'].includes(s.value) || j.id === form.job_id),
    ),
  }))
    .filter((g) => g.jobs.length)
    .sort((a, b) => {
      // Active work first: In progress, Scheduled, Ready, then the rest
      const order = ['in_progress', 'scheduled', 'ready']
      const ra = order.indexOf(a.value)
      const rb = order.indexOf(b.value)
      return (ra === -1 ? 9 : ra) - (rb === -1 ? 9 : rb)
    })

  async function handleSubmit(e) {
    e.preventDefault()
    if (isJob && !form.job_id) return setError('Pick the job.')
    if (!isJob && !form.title.trim()) return setError(isOff ? 'Add a label, e.g. "No work" or "Palm Desert".' : 'What is the appointment?')
    if (form.end_date && form.end_date < form.entry_date) return setError('"Through" must be on or after the date.')
    if (form.start_time && form.end_time && form.end_time <= form.start_time)
      return setError('End time must be after the start time.')

    const hoursValue = isJob && shownHours !== '' ? Number(shownHours) : null
    if (hoursValue !== null && (!Number.isFinite(hoursValue) || hoursValue < 0 || hoursValue > 24))
      return setError('Hours must be between 0 and 24.')

    const row = {
      entry_type: form.entry_type,
      job_id: isJob ? form.job_id : null,
      title: isJob ? null : form.title.trim(),
      entry_date: form.entry_date,
      end_date: !isJob && form.end_date && form.end_date !== form.entry_date ? form.end_date : null,
      assigned_to: form.assigned_to || null,
      start_time: isOff ? null : form.start_time || null,
      end_time: isOff ? null : form.end_time || null,
      hours: hoursValue,
      status: isJob ? form.status : 'scheduled',
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    setError(null)
    try {
      const saved = entry
        ? must(
            await supabase
              .from('schedule_entries')
              .update({ ...row, updated_at: new Date().toISOString() })
              .eq('id', entry.id)
              .select(ENTRY_SELECT)
              .single(),
          )
        : must(
            await supabase
              .from('schedule_entries')
              .insert({ ...row, created_by: profile?.id || null })
              .select(ENTRY_SELECT)
              .single(),
          )
      let moved = null
      try {
        moved = await advanceJobForEntry(saved)
      } catch (err) {
        console.error('Could not update the job status', err)
      }
      toast(moved ? `Saved — job moved to ${moved}` : entry ? 'Schedule updated' : 'Added to schedule')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Remove this from the schedule?')) return
    setSaving(true)
    try {
      mustDelete(await supabase.from('schedule_entries').delete().eq('id', entry.id).select('id'), 'this entry')
      toast('Removed from schedule')
      onSaved?.(null)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={entry ? 'Edit schedule' : 'Add to schedule'}
      onClose={onClose}
      footer={
        <Button type="submit" form="entry-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Add to schedule'}
        </Button>
      }
    >
      <form id="entry-form" onSubmit={handleSubmit} className="space-y-4">
        <Segmented options={ENTRY_TYPES} value={form.entry_type} onChange={set('entry_type')} />

        {isJob ? (
          <Field label="Job" required>
            <select className={inputClass} value={form.job_id} onChange={set('job_id')}>
              <option value="">Pick a job…</option>
              {jobGroups.map((g) => (
                <optgroup key={g.value} label={g.label}>
                  {g.jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.job_name}
                      {j.client?.client_name && j.client.client_name !== j.job_name ? ` — ${j.client.client_name}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={isOff ? 'Label' : 'What'} required>
            <input
              className={inputClass}
              value={form.title}
              onChange={set('title')}
              placeholder={isOff ? 'No work, Palm Desert…' : 'Speech, supplier pickup…'}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            <input type="date" className={inputClass} value={form.entry_date} onChange={set('entry_date')} required />
          </Field>
          {!isJob && (
            <Field label="Through" hint="For more than one day">
              <input
                type="date"
                className={inputClass}
                value={form.end_date}
                min={form.entry_date}
                onChange={set('end_date')}
              />
            </Field>
          )}
        </div>

        {!isOff && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <input type="time" className={inputClass} value={form.start_time} onChange={set('start_time')} />
            </Field>
            <Field label="End">
              <input type="time" className={inputClass} value={form.end_time} onChange={set('end_time')} />
            </Field>
          </div>
        )}

        {isJob && (
          <>
            <Field
              label="Hours on site"
              hint={
                !hoursTouched && autoHours
                  ? `From the time window (${formatHours(autoHours)}). Change it if the day ran long or short.`
                  : 'Hours actually worked at the job site.'
              }
            >
              <input
                className={inputClass}
                inputMode="decimal"
                value={shownHours}
                onChange={(e) => {
                  setHoursTouched(true)
                  setForm((f) => ({ ...f, hours: e.target.value }))
                }}
                placeholder="e.g. 4.5"
              />
            </Field>
            <div>
              <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
              <Segmented options={ENTRY_STATUSES} value={form.status} onChange={set('status')} />
            </div>
          </>
        )}

        <Field label="Who">
          <select className={inputClass} value={form.assigned_to} onChange={set('assigned_to')}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Notes">
          <textarea
            className={`${inputClass} min-h-20`}
            value={form.notes}
            onChange={set('notes')}
            placeholder={isJob ? 'Fixed back door, client paid…' : ''}
          />
        </Field>

        <ErrorMessage error={error} />

        {entry && (
          <Button variant="dangerOutline" className="w-full" onClick={handleDelete} disabled={saving}>
            Remove from schedule
          </Button>
        )}
      </form>
    </Sheet>
  )
}
