import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Segmented, Sheet } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must } from '../../lib/useQuery'
import { guessOpeningType, OPENING_TYPES, useOpeningNameSuggestions } from './openings'

const MODES = [
  { value: 'list', label: 'Pick names' },
  { value: 'numbered', label: 'Numbered' },
]

const BASE_NAMES = ['French doors', 'Pair', 'Door', 'Window', 'Unit', 'Suite', 'Gate']
const SHOWN = 24
const MAX = 50

/** Highest number already used after `base` (e.g. "Pair 4" → 4), so new ones carry on. */
function lastNumber(existing, base) {
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`, 'i')
  return existing.reduce((max, name) => {
    const m = name.match(re)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
}

/**
 * Add several doors or windows at once — "Pair 1 … Pair 9", or a typed list
 * of names. Every one gets the same type and flags; each can be edited later.
 * Mount only while open. onSaved receives the new rows.
 */
export default function BulkOpeningsForm({ jobId, existingNames = [], onClose, onSaved }) {
  const suggestions = useOpeningNameSuggestions()
  const [mode, setMode] = useState('list')
  const [showAll, setShowAll] = useState(false)
  const [count, setCount] = useState('2')
  const [base, setBase] = useState('Door')
  const [list, setList] = useState('')
  const [type, setType] = useState('auto') // 'auto' = from each name
  const [fireRated, setFireRated] = useState(false)
  const [complex, setComplex] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const n = Math.min(Math.max(parseInt(count, 10) || 0, 0), MAX)
  const start = lastNumber(existingNames, base.trim()) + 1
  const names =
    mode === 'numbered'
      ? base.trim()
        ? Array.from({ length: n }, (_, i) => `${base.trim()} ${start + i}`)
        : []
      : list
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX)
  const taken = new Set(existingNames.map((x) => x.toLowerCase()))
  const picked = new Set(names.map((x) => x.toLowerCase()))

  function togglePick(name) {
    const lines = list.split('\n').map((s) => s.trim()).filter(Boolean)
    const next = picked.has(name.toLowerCase())
      ? lines.filter((l) => l.toLowerCase() !== name.toLowerCase())
      : [...lines, name]
    setList(next.join('\n'))
  }
  const duplicates = names.filter((x) => taken.has(x.toLowerCase()))

  async function save() {
    if (!names.length) return setError(mode === 'numbered' ? 'Enter how many and a name.' : 'Type at least one name.')
    setSaving(true)
    setError(null)
    try {
      const rows = must(
        await supabase
          .from('openings')
          .insert(
            names.map((opening_name) => ({
              job_id: jobId,
              opening_name,
              opening_type: type === 'auto' ? guessOpeningType(opening_name) || 'single_door' : type,
              is_fire_rated: fireRated,
              is_complex: complex,
            })),
          )
          .select(),
      )
      toast(`Added ${rows.length} opening${rows.length === 1 ? '' : 's'}`)
      onSaved?.(rows)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title="Add several openings"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={save} disabled={saving || !names.length}>
          {saving ? 'Adding…' : `Add ${names.length || ''} opening${names.length === 1 ? '' : 's'}`}
        </Button>
      }
    >
      <div className="space-y-4">
        <Segmented options={MODES} value={mode} onChange={setMode} />

        {mode === 'numbered' ? (
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="How many">
              <input
                className={`${inputClass} text-center text-lg font-semibold`}
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="Called">
              <input className={inputClass} list="bulk-base-names" value={base} onChange={(e) => setBase(e.target.value)} />
              <datalist id="bulk-base-names">
                {BASE_NAMES.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </Field>
          </div>
        ) : (
          <>
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Tap to add</span>
            <div className="flex flex-wrap gap-2">
              {(showAll ? suggestions : suggestions.slice(0, SHOWN)).map((name) => {
                const on = picked.has(name.toLowerCase())
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => togglePick(name)}
                    aria-pressed={on}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                      on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    {on ? '✓ ' : '+ '}
                    {name}
                  </button>
                )
              })}
              {!showAll && suggestions.length > SHOWN && (
                <button type="button" onClick={() => setShowAll(true)} className="min-h-10 px-2 text-sm font-semibold text-blue-700">
                  More…
                </button>
              )}
            </div>
          </div>
          <Field label="Names" hint="One per line — tap names above or type your own. Use a name twice to add two.">
            <textarea
              className={`${inputClass} min-h-32`}
              value={list}
              onChange={(e) => setList(e.target.value)}
              placeholder={'Living room\nMaster bedroom\nDining room'}
            />
          </Field>
          </>
        )}

        <Field label="Type" hint={type === 'auto' ? 'French doors and pairs become double doors, windows become windows, the rest single doors.' : 'Every opening gets this type.'}>
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="auto">Match each name</option>
            {OPENING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                All {t.label.toLowerCase()}s
              </option>
            ))}
          </select>
        </Field>

        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-blue-700" checked={fireRated} onChange={(e) => setFireRated(e.target.checked)} />
            Fire-rated
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="size-5 accent-blue-700" checked={complex} onChange={(e) => setComplex(e.target.checked)} />
            Complex — office to review
          </label>
        </div>

        {names.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Will add</span>
            <div className="flex flex-wrap gap-1.5">
              {names.map((x, i) => (
                <span
                  key={`${x}-${i}`}
                  className={`rounded-full px-2.5 py-1 text-sm font-medium ${
                    taken.has(x.toLowerCase()) ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {x}
                  <span className="ml-1 text-xs opacity-70">
                    · {(OPENING_TYPES.find((t) => t.value === (type === 'auto' ? guessOpeningType(x) || 'single_door' : type)) || OPENING_TYPES[0]).label.toLowerCase()}
                  </span>
                </span>
              ))}
            </div>
            {duplicates.length > 0 && (
              <p className="mt-1 text-xs text-amber-800">Highlighted names are already on this job — they&apos;ll be added again.</p>
            )}
            {mode === 'numbered' && start > 1 && (
              <p className="mt-1 text-xs text-slate-500">
                Numbering carries on from {base.trim()} {start - 1}.
              </p>
            )}
          </div>
        )}

        <ErrorMessage error={error} />
      </div>
    </Sheet>
  )
}
