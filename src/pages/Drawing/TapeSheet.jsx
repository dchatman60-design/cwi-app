// Tape-measure sheet: every standard measurement for one opening on a single
// screen, typed straight from the tape (in the field or later in the office).
// Rows use the same component/dimension keys as the photo methods, so the
// Layer 3 diagram and quotes read them the same way.

import { useState } from 'react'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { Button, Card, ErrorMessage, inputClass, Sheet } from '../../components/ui'
import { parseMeasurementText } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { useSignedMediaUrl } from '../Media/JobMedia'
import { splitValue } from './measurementParts'

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
const FRACTIONS = [
  { value: 0, label: '—' },
  ...Array.from({ length: 15 }, (_, i) => {
    const n = i + 1
    const d = gcd(n, 16)
    return { value: n / 16, label: `${n / d}/${16 / d}` }
  }),
]

const DOOR_VALUES = [
  { component: 'head_jam', dimension: 'width', label: 'Head jamb width' },
  { component: 'side_jam_left', dimension: 'height', label: 'Left jamb height' },
  { component: 'side_jam_right', dimension: 'height', label: 'Right jamb height' },
  { component: 'threshold', dimension: 'width', label: 'Threshold width' },
  { component: 'threshold', dimension: 'rise', label: 'Threshold rise' },
]
const DOOR_CHOICES = [
  { component: 'doorstop', dimension: 'condition', label: 'Doorstop', options: ['Good', 'Worn', 'Missing'] },
  { component: 'seal', dimension: 'condition', label: 'Seal', options: ['Good', 'Worn', 'Missing'] },
  { component: 'threshold', dimension: 'type', label: 'Threshold type', options: ['Saddle', 'Water return', 'Custom', 'None'] },
  { component: 'sweep', dimension: 'type', label: 'Door sweep', options: ['Auto-drop', 'Surface-mount', 'None'] },
  { component: 'door_bottom', dimension: 'type', label: 'Door bottom', options: ['Automatic', 'Surface-mount', 'None'] },
  { component: 'surface_bolts', dimension: 'position', label: 'Surface bolts', options: ['Top', 'Bottom', 'Both', 'None'] },
]

/** The standard rows for an opening type, in the order they're measured. */
export function tapeTemplate(openingType) {
  if (openingType === 'window') {
    return {
      values: [
        { component: 'window', dimension: 'width', label: 'Window width' },
        { component: 'window', dimension: 'height', label: 'Window height' },
      ],
      choices: [
        { component: 'window', dimension: 'type', label: 'Window type', options: ['Casement', 'Double hung', 'French pair', 'Bifold'] },
        { component: 'window', dimension: 'glass', label: 'Sidelite / transom', options: ['None', 'Sidelite', 'Transom', 'Both'] },
        { component: 'v_seal', dimension: 'condition', label: 'V-seal', options: ['Good', 'Worn', 'Missing', 'None'] },
      ],
    }
  }
  if (openingType === 'double_door') {
    return {
      values: [...DOOR_VALUES, { component: 't_astragal', dimension: 'height', label: 'T-astragal height' }],
      choices: DOOR_CHOICES,
    }
  }
  return { values: DOOR_VALUES, choices: DOOR_CHOICES }
}

// The shared input style is full-width; these boxes size themselves
const boxClass = inputClass.replace('block w-full ', '')

const keyOf = (component, dimension) => `${component}|${(dimension || '').toLowerCase()}`

function ValueInputs({ value, onChange, label }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <input
        className={`${boxClass} w-[4.5rem] text-center text-lg font-semibold`}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder="in"
        value={value.whole}
        onChange={(e) => onChange({ whole: e.target.value })}
        aria-label={`${label}, inches`}
      />
      <select
        className={`${boxClass} w-[5.25rem] px-1.5 text-center text-lg font-semibold`}
        value={value.fraction}
        onChange={(e) => onChange({ fraction: Number(e.target.value) })}
        aria-label={`${label}, fraction`}
      >
        {FRACTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function RefThumb({ media }) {
  const url = useSignedMediaUrl(media.storage_path)
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-slate-200">
      {url && <img src={url} alt={media.caption || ''} className="size-full object-cover" />}
    </a>
  )
}

/** Inches from the whole box (which may itself hold "35 3/4" or "35.75") + fraction. */
function readValue(v) {
  const typed = parseMeasurementText(v.whole)
  if (Number.isNaN(typed)) return NaN
  if (typed === null) return v.fraction ? v.fraction : null
  return typed + (v.fraction || 0)
}

export default function TapeSheet({ jobId, opening, measurements, onClose, onSaved }) {
  const template = tapeTemplate(opening.opening_type)
  const existing = new Map((measurements || []).map((m) => [keyOf(m.component, m.dimension), m]))

  const [values, setValues] = useState(() =>
    Object.fromEntries(
      template.values.map((t) => {
        const m = existing.get(keyOf(t.component, t.dimension))
        const split = m && m.value_confirmed !== null && (m.unit || 'in') === 'in' ? splitValue(m.value_confirmed, 'in') : { confirmed: '', fraction: 0 }
        return [keyOf(t.component, t.dimension), { whole: split.confirmed, fraction: split.fraction, dirty: false }]
      }),
    ),
  )
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(
      template.choices.map((t) => [keyOf(t.component, t.dimension), { note: existing.get(keyOf(t.component, t.dimension))?.note || '', dirty: false }]),
    ),
  )
  const [extras, setExtras] = useState([]) // { id, label, whole, fraction }
  const [notes, setNotes] = useState(opening.notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: refPhotos } = useQuery(`tape-refs:${opening.id}`, async () => {
    const { data } = await supabase
      .from('job_media')
      .select('id, storage_path, caption')
      .eq('opening_id', opening.id)
      .eq('media_type', 'photo')
      .order('created_at', { ascending: false })
      .limit(8)
    return data || [] // table may not exist yet — no reference strip then
  })

  const setValue = (key, change) => setValues((v) => ({ ...v, [key]: { ...v[key], ...change, dirty: true } }))

  async function save() {
    const inserts = []
    const updates = []
    const deletes = []

    for (const t of template.values) {
      const key = keyOf(t.component, t.dimension)
      const v = values[key]
      if (!v.dirty) continue
      const n = readValue(v)
      if (Number.isNaN(n)) return setError(`${t.label}: "${v.whole}" isn't a number.`)
      if (n !== null && (n <= 0 || n > 1200)) return setError(`${t.label}: ${n}" looks wrong.`)
      const m = existing.get(key)
      if (n === null) {
        if (m) deletes.push(m.id)
      } else if (m) {
        updates.push({ id: m.id, value_confirmed: n, unit: 'in', confirmed_by_mike: true })
      } else {
        inserts.push({ component: t.component, dimension: t.dimension, value_confirmed: n, unit: 'in' })
      }
    }

    for (const t of template.choices) {
      const key = keyOf(t.component, t.dimension)
      const c = choices[key]
      if (!c.dirty) continue
      const m = existing.get(key)
      if (!c.note) {
        if (m) deletes.push(m.id)
      } else if (m) {
        updates.push({ id: m.id, note: c.note, confirmed_by_mike: true })
      } else {
        inserts.push({ component: t.component, dimension: t.dimension, value_confirmed: null, unit: 'in', note: c.note })
      }
    }

    for (const x of extras) {
      const n = readValue(x)
      if (!x.label.trim() && n === null) continue
      if (!x.label.trim()) return setError('Name each extra measurement.')
      if (Number.isNaN(n)) return setError(`${x.label}: "${x.whole}" isn't a number.`)
      if (n === null) return setError(`${x.label}: enter a value.`)
      inserts.push({ component: 'site_condition', dimension: x.label.trim(), value_confirmed: n, unit: 'in' })
    }

    const notesChanged = (notes.trim() || null) !== (opening.notes || null)
    if (!inserts.length && !updates.length && !deletes.length && !notesChanged) return onClose()

    setSaving(true)
    setError(null)
    try {
      if (inserts.length) {
        must(
          await supabase
            .from('measurements')
            .insert(inserts.map((r) => ({ ...r, job_id: jobId, opening_id: opening.id, confirmed_by_mike: true }))),
        )
      }
      for (const { id, ...change } of updates) must(await supabase.from('measurements').update(change).eq('id', id))
      if (deletes.length) must(await supabase.from('measurements').delete().in('id', deletes))
      if (notesChanged) must(await supabase.from('openings').update({ notes: notes.trim() || null }).eq('id', opening.id))
      const count = inserts.length + updates.length
      toast(count ? `Saved ${count} measurement${count === 1 ? '' : 's'}` : 'Saved')
      onSaved()
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title={`Tape measurements — ${opening.opening_name}`}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save measurements'}
        </Button>
      }
    >
      <div className="space-y-4">
        {refPhotos?.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Photos of this opening</h3>
            <div className="grid grid-cols-4 gap-2">
              {refPhotos.map((p) => (
                <RefThumb key={p.id} media={p} />
              ))}
            </div>
          </section>
        )}

        <p className="text-sm text-slate-500">Inches, then the fraction. Leave anything you didn&apos;t measure blank.</p>

        <Card className="divide-y divide-slate-100">
          {template.values.map((t) => {
            const key = keyOf(t.component, t.dimension)
            return (
              <div key={key} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm font-medium break-words">{t.label}</span>
                <ValueInputs value={values[key]} onChange={(c) => setValue(key, c)} label={t.label} />
              </div>
            )
          })}
          {extras.map((x) => (
            <div key={x.id} className="flex items-center gap-2 px-3 py-2">
              <input
                className={`${inputClass} min-w-0 flex-1 px-2 text-sm`}
                placeholder="What (e.g. door gap)"
                value={x.label}
                onChange={(e) => setExtras((list) => list.map((i) => (i.id === x.id ? { ...i, label: e.target.value } : i)))}
                aria-label="Measurement name"
              />
              <ValueInputs
                value={x}
                onChange={(c) => setExtras((list) => list.map((i) => (i.id === x.id ? { ...i, ...c } : i)))}
                label={x.label || 'Extra measurement'}
              />
              <button
                type="button"
                onClick={() => setExtras((list) => list.filter((i) => i.id !== x.id))}
                className="flex size-9 shrink-0 items-center justify-center text-slate-400"
                aria-label="Remove"
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          ))}
        </Card>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => setExtras((list) => [...list, { id: crypto.randomUUID(), label: '', whole: '', fraction: 0 }])}
        >
          <PlusIcon className="size-5" /> Add another measurement
        </Button>

        <section className="space-y-3">
          {template.choices.map((t) => {
            const key = keyOf(t.component, t.dimension)
            const current = choices[key].note
            return (
              <div key={key}>
                <div className="mb-1 text-sm font-medium text-slate-700">{t.label}</div>
                <div className="flex flex-wrap gap-2">
                  {t.options.map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setChoices((c) => ({ ...c, [key]: { note: current === o ? '' : o, dirty: true } }))}
                      className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                        current === o ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </section>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Notes for this opening</span>
          <textarea
            className={`${inputClass} min-h-20`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything else the office should know"
          />
        </label>

        <ErrorMessage error={error} />
      </div>
    </Sheet>
  )
}
