import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Segmented, Sheet } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { JOB_STATUSES } from './jobStatus'

/** Add or edit a job. Mount only while open. onSaved receives the saved row. */
export default function JobForm({ job, defaults = {}, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    job_name: job?.job_name ?? '',
    site_address: job?.site_address ?? '',
    client_id: job?.client_id ?? defaults.client_id ?? '',
    status: job?.status ?? 'draft',
    notes: job?.notes ?? '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: clients } = useQuery('job-form-clients', async () =>
    must(await supabase.from('clients').select('id, client_name').eq('is_active', true).order('client_name')),
  )

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.job_name.trim()) return setError('Job name is required.')

    const row = {
      job_name: form.job_name.trim(),
      site_address: form.site_address.trim() || null,
      client_id: form.client_id || null,
      status: form.status,
      notes: form.notes.trim() || null,
    }

    setSaving(true)
    setError(null)
    try {
      const saved = job
        ? must(
            await supabase
              .from('jobs')
              .update({ ...row, updated_at: new Date().toISOString() })
              .eq('id', job.id)
              .select()
              .single(),
          )
        : must(await supabase.from('jobs').insert(row).select().single())
      toast(job ? 'Job updated' : 'Job created')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={job ? 'Edit job' : 'New job'}
      onClose={onClose}
      footer={
        <Button type="submit" form="job-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : job ? 'Save changes' : 'Create job'}
        </Button>
      }
    >
      <form id="job-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Job name" required>
          <input
            className={inputClass}
            value={form.job_name}
            onChange={set('job_name')}
            placeholder="e.g. Harbor View HOA — Bldg C"
            required
          />
        </Field>
        <Field label="Site address">
          <textarea className={`${inputClass} min-h-20`} value={form.site_address} onChange={set('site_address')} />
        </Field>
        <Field label="Client" hint="Add new clients from the Clients tab.">
          <select className={inputClass} value={form.client_id} onChange={set('client_id')}>
            <option value="">No client</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Status</span>
          <Segmented options={JOB_STATUSES} value={form.status} onChange={set('status')} />
        </div>
        <Field label="Notes">
          <textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={set('notes')} />
        </Field>
        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
