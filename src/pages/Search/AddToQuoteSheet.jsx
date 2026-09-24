import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorMessage, Field, inputClass, Sheet, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { addQuoteItem, createQuote, lastQuoteId, quoteTitle, rememberQuote } from '../Quotes/quotes'
import { priceLabel } from './catalog'

const NEW = '__new__'

/** Pick a draft quote (or start one) and add the product with a quantity. */
export default function AddToQuoteSheet({ product, onClose }) {
  const navigate = useNavigate()
  const [choice, setChoice] = useState(null)
  const [jobId, setJobId] = useState('')
  const [openingChoice, setOpeningChoice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [addedTo, setAddedTo] = useState(null)

  const { data: quotes, loading } = useQuery('draft-quotes', async () =>
    must(
      await supabase
        .from('quotes')
        .select('id, title, job_id, job:job_id(job_name)')
        .eq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(50),
    ),
  )
  const { data: jobs } = useQuery('add-to-quote-jobs', async () =>
    must(await supabase.from('jobs').select('id, job_name').neq('status', 'complete').order('created_at', { ascending: false })),
  )

  const remembered = lastQuoteId()
  const defaultChoice = quotes?.some((q) => q.id === remembered) ? remembered : quotes?.[0]?.id || NEW
  const selected = choice ?? defaultChoice

  // Which opening (door / window) the product is for, when the quote has a job
  const openingsJobId = selected === NEW ? jobId : quotes?.find((q) => q.id === selected)?.job_id
  const { data: openings } = useQuery(`add-to-quote-openings:${openingsJobId}`, async () =>
    openingsJobId
      ? must(await supabase.from('openings').select('id, opening_name').eq('job_id', openingsJobId).order('created_at'))
      : [],
  )
  const openingId = openings?.some((o) => o.id === openingChoice) ? openingChoice : ''

  async function add() {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) return setError('Enter a quantity greater than zero.')
    setSaving(true)
    setError(null)
    try {
      const quoteId = selected === NEW ? (await createQuote({ jobId: jobId || null })).id : selected
      await addQuoteItem(quoteId, product, qty, openingId || null)
      rememberQuote(quoteId)
      toast(`Added ${product.sku} to quote`)
      setAddedTo(quoteId)
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (addedTo) {
    return (
      <Sheet open title="Added to quote" onClose={onClose}>
        <p className="text-slate-700">
          <strong>{product.sku}</strong> × {quantity} was added.
        </p>
        <div className="mt-6 grid gap-3">
          <Button onClick={() => navigate(`/quotes/${addedTo}`)}>Open the quote</Button>
          <Button variant="secondary" onClick={onClose}>
            Keep searching
          </Button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      title="Add to quote"
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={add} disabled={saving || loading}>
          {saving ? 'Adding…' : 'Add to quote'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200">
          <div className="font-bold">{product.sku}</div>
          <div className="text-sm text-slate-600">{priceLabel(product)}</div>
        </div>

        {loading && !quotes ? (
          <Spinner />
        ) : (
          <Field label="Quote">
            <select className={inputClass} value={selected} onChange={(e) => setChoice(e.target.value)}>
              {quotes?.map((q) => (
                <option key={q.id} value={q.id}>
                  {quoteTitle(q)}
                </option>
              ))}
              <option value={NEW}>+ Start a new quote</option>
            </select>
          </Field>
        )}

        {selected === NEW && (
          <Field label="Job for the new quote">
            <select className={inputClass} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job yet</option>
              {jobs?.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {openings?.length > 0 && (
          <Field label="Opening">
            <select className={inputClass} value={openingId} onChange={(e) => setOpeningChoice(e.target.value)}>
              <option value="">General — not a specific opening</option>
              {openings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.opening_name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={`Quantity${product.uom && product.uom !== 'ea' ? ` (${product.uom})` : ''}`}>
          <input
            className={inputClass}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>

        <ErrorMessage error={error} />
      </div>
    </Sheet>
  )
}
