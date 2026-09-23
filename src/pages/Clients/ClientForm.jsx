import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Sheet } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must } from '../../lib/useQuery'

const FIELDS = ['client_name', 'contact_name', 'phone', 'email', 'address', 'notes']

/** Add or edit a client. Mount only while open. onSaved receives the saved row. */
export default function ClientForm({ client, onClose, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((f) => [f, client?.[f] ?? ''])))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.client_name.trim()) return setError('Client name is required.')

    const row = Object.fromEntries(FIELDS.map((f) => [f, form[f].trim() || null]))
    if (row.email) row.email = row.email.toLowerCase()

    setSaving(true)
    setError(null)
    try {
      const saved = client
        ? must(await supabase.from('clients').update(row).eq('id', client.id).select().single())
        : must(await supabase.from('clients').insert({ ...row, is_active: true }).select().single())
      toast(client ? 'Client updated' : 'Client added')
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
      title={client ? 'Edit client' : 'New client'}
      onClose={onClose}
      footer={
        <Button type="submit" form="client-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : client ? 'Save changes' : 'Add client'}
        </Button>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Client / company name" required>
          <input className={inputClass} value={form.client_name} onChange={set('client_name')} required />
        </Field>
        <Field label="Contact name">
          <input className={inputClass} value={form.contact_name} onChange={set('contact_name')} autoComplete="off" />
        </Field>
        <Field label="Phone">
          <input type="tel" inputMode="tel" className={inputClass} value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            className={inputClass}
            value={form.email}
            onChange={set('email')}
          />
        </Field>
        <Field label="Address">
          <textarea className={`${inputClass} min-h-20`} value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Notes">
          <textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={set('notes')} />
        </Field>
        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
