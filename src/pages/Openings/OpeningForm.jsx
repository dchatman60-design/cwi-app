import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Segmented, Sheet } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must } from '../../lib/useQuery'
import { guessOpeningType, OPENING_TYPES, useOpeningNameSuggestions } from './openings'

/** Add or edit an opening. Mount only while open. onSaved receives the saved row. */
export default function OpeningForm({ jobId, opening, onClose, onSaved, onAddSeveral }) {
  const suggestions = useOpeningNameSuggestions()
  const [form, setForm] = useState(() => ({
    opening_name: opening?.opening_name ?? '',
    opening_type: opening?.opening_type ?? 'single_door',
    is_fire_rated: opening?.is_fire_rated ?? false,
    is_complex: opening?.is_complex ?? false,
    notes: opening?.notes ?? '',
  }))
  const [typeTouched, setTypeTouched] = useState(Boolean(opening))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value?.target ? value.target.value : value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.opening_name.trim()) return setError('Give the opening a name — whatever the site contact calls it.')
    const row = { ...form, opening_name: form.opening_name.trim(), notes: form.notes.trim() || null }
    setSaving(true)
    setError(null)
    try {
      const saved = opening
        ? must(await supabase.from('openings').update(row).eq('id', opening.id).select().single())
        : must(await supabase.from('openings').insert({ ...row, job_id: jobId }).select().single())
      toast(opening ? 'Opening updated' : 'Opening added')
      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={opening ? 'Edit opening' : 'Add opening'}
      onClose={onClose}
      footer={
        <Button type="submit" form="opening-form" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : opening ? 'Save changes' : 'Add opening'}
        </Button>
      }
    >
      <form id="opening-form" onSubmit={handleSubmit} className="space-y-4">
        {!opening && onAddSeveral && (
          <button
            type="button"
            onClick={onAddSeveral}
            className="flex min-h-11 w-full items-center justify-between rounded-lg bg-blue-50 px-3 text-sm font-semibold text-blue-800 active:bg-blue-100"
          >
            Adding more than one? Add several at once
            <span aria-hidden="true">→</span>
          </button>
        )}
        <Field label="Name" required hint="Use what the site contact calls it — this is how it appears on the quote.">
          <input
            className={inputClass}
            list="opening-names"
            value={form.opening_name}
            onChange={(e) => {
              const name = e.target.value
              // Picking "French doors" etc. sets the type too (until the type is chosen by hand)
              setForm((f) => ({ ...f, opening_name: name, opening_type: !typeTouched && guessOpeningType(name) ? guessOpeningType(name) : f.opening_type }))
            }}
            placeholder="e.g. Front entry, Suite 101, Door 3"
          />
          <datalist id="opening-names">
            {suggestions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Field>
        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Type</span>
          <Segmented
            options={OPENING_TYPES}
            value={form.opening_type}
            onChange={(v) => {
              setTypeTouched(true)
              set('opening_type')(v)
            }}
          />
        </div>
        <label className="flex min-h-11 items-start gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-blue-700"
            checked={form.is_fire_rated}
            onChange={(e) => set('is_fire_rated')(e.target.checked)}
          />
          <span>
            <span className="font-medium">Fire-rated door</span>
            <span className="block text-xs text-slate-500">Label on the door or frame — needs FTP-001 field testing.</span>
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-blue-700"
            checked={form.is_complex}
            onChange={(e) => set('is_complex')(e.target.checked)}
          />
          <span>
            <span className="font-medium">Complex — office to review</span>
            <span className="block text-xs text-slate-500">Unusual frame, obstructed, oversized or custom profile.</span>
          </span>
        </label>
        <Field label="Notes">
          <textarea className={`${inputClass} min-h-24`} value={form.notes} onChange={set('notes')} />
        </Field>
        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
