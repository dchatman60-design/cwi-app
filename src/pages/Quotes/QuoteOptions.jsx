import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import { Button, Card, Field, inputClass } from '../../components/ui'
import { currency } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { QUOTE_LIST_SELECT, quoteTitle, quoteTotals } from './quotes'

/** "Connelly Residence — Option: Dutch Entry interlock" from the parent's name and the option's own words. */
export function optionTitle(parent, label) {
  const base = parent ? quoteTitle(parent).replace(/^Quote\s*[—–-]\s*/i, '').replace(/^Quote \d+\s*[—–-]\s*/i, '') : 'Option'
  return `${base} — Option: ${label.trim()}`
}

/** The options linked to a main quote (option quotes whose parent is this one). */
export function useQuoteOptions(quoteId) {
  return useQuery(`quote-options:${quoteId}`, async () =>
    quoteId
      ? must(await supabase.from('quotes').select(QUOTE_LIST_SELECT).eq('parent_quote_id', quoteId).order('created_at'))
      : [],
  )
}

/** On a main quote: its options with their prices, and a button to start a new one. */
export function OptionsCard({ quote }) {
  const navigate = useNavigate()
  const { data: options } = useQuoteOptions(quote.id)
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  async function create() {
    if (!label.trim()) return toast('Name the option first', 'error')
    setSaving(true)
    try {
      const created = must(
        await supabase
          .from('quotes')
          .insert({
            job_id: quote.job_id,
            parent_quote_id: quote.id,
            items_only: true,
            title: optionTitle(quote, label),
            multiplier: quote.multiplier,
            day_rate: quote.day_rate,
            labor_days: 0,
          })
          .select('id')
          .single(),
      )
      navigate(`/quotes/${created.id}`)
    } catch (err) {
      toast(err.message, 'error')
      setSaving(false)
    }
  }

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">Options</h3>
        <span className="text-xs text-slate-500">Priced separately</span>
      </div>
      {options?.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {options.map((o) => (
            <li key={o.id}>
              <Link to={`/quotes/${o.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-words">{quoteTitle(o).replace(/^.*— Option:\s*/, '')}</span>
                <span className="shrink-0 font-semibold tabular-nums">{currency(quoteTotals(o, o.items).total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          No options yet. An option is a separate add-on the customer can accept, like a finish upgrade or extra doors.
        </p>
      )}
      {adding ? (
        <div className="mt-3 space-y-2">
          <Field label="Option name">
            <input
              autoFocus
              className={inputClass}
              placeholder="Brass interlocking weatherstrip at the front door"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={create} disabled={saving}>
              {saving ? 'Creating…' : 'Create option'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdding(true)}>
          <PlusIcon className="size-5" /> Add option
        </Button>
      )}
    </Card>
  )
}

/** On an option quote: which main quote it belongs to (same job), with a link back. */
export function ParentPicker({ quote, onChange }) {
  const { data: candidates } = useQuery(`quote-parents:${quote.job_id}`, async () =>
    quote.job_id
      ? must(
          await supabase
            .from('quotes')
            .select('id, title, status, job:job_id(id, job_name)')
            .eq('job_id', quote.job_id)
            .eq('items_only', false)
            .order('created_at'),
        )
      : [],
  )
  const parent = candidates?.find((c) => c.id === quote.parent_quote_id)
  return (
    <Field label="Option for" hint="The main proposal this option belongs to. It's listed there as an add-on.">
      <select
        className={inputClass}
        value={quote.parent_quote_id || ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Not linked</option>
        {candidates?.map((c) => (
          <option key={c.id} value={c.id}>
            {quoteTitle(c)}
          </option>
        ))}
      </select>
      {parent && (
        <Link to={`/quotes/${parent.id}`} className="mt-1 inline-block text-sm font-medium text-blue-700">
          Open {quoteTitle(parent)}
        </Link>
      )}
    </Field>
  )
}
