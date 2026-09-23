import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PlusIcon, TrashIcon } from '../../components/icons'
import { Button, Card, EmptyState, ErrorMessage, Field, inputClass, PageHeader, Segmented, Spinner } from '../../components/ui'
import { currency, formatMeasurement, inchesToBillableFeet, trimNumber } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { hasValue, partLabel, sortByPart } from '../Drawing/measurementParts'
import { hasRealDescription } from '../Search/catalog'
import AddProductSheet from './AddProductSheet'
import ProposalView from './ProposalView'
import { addQuoteItem, DAY_RATES, MULTIPLIERS, QUOTE_STATUSES, quoteTitle, quoteTotals, rememberQuote } from './quotes'

const QUOTE_SELECT =
  '*, job:job_id(id, job_name, site_address, client:client_id(client_name, contact_name, phone, email, address))'

/** Measurement → billable linear feet, rounded up to the nearest 0.5 LF. */
function toBillableFeet(m) {
  const v = Number(m.value_confirmed)
  switch (m.unit) {
    case 'ft':
      return Math.ceil(v * 2) / 2
    case 'mm':
      return inchesToBillableFeet(v / 25.4)
    case 'cm':
      return inchesToBillableFeet(v / 2.54)
    default:
      return inchesToBillableFeet(v)
  }
}

/** Uncontrolled number input that saves on blur (or Enter). */
function NumberInput({ value, onCommit, className = '', ...props }) {
  return (
    <input
      key={String(value)}
      defaultValue={value ?? ''}
      inputMode="decimal"
      className={`${inputClass} ${className}`}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onBlur={(e) => {
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n !== Number(value)) onCommit(n)
        else e.target.value = value ?? ''
      }}
      {...props}
    />
  )
}

export default function QuoteBuilder() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(false)

  const quoteQ = useQuery(`quote:${id}`, async () =>
    must(await supabase.from('quotes').select(QUOTE_SELECT).eq('id', id).maybeSingle()),
  )
  const itemsQ = useQuery(`quote-items:${id}`, async () =>
    must(await supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order').order('created_at')),
  )
  const quote = quoteQ.data
  const items = itemsQ.data || []
  const jobId = quote?.job_id

  const { data: measurements } = useQuery(`quote-measurements:${jobId}`, async () =>
    jobId
      ? must(await supabase.from('measurements').select('*').eq('job_id', jobId).eq('confirmed_by_mike', true))
      : [],
  )
  const { data: diagrams } = useQuery(`quote-diagram:${jobId}`, async () =>
    jobId
      ? must(
          await supabase
            .from('job_photos')
            .select('storage_path')
            .eq('job_id', jobId)
            .eq('layer', 3)
            .order('created_at', { ascending: false })
            .limit(1),
        )
      : [],
  )
  const { data: jobs } = useQuery('quote-jobs', async () =>
    must(await supabase.from('jobs').select('id, job_name').order('created_at', { ascending: false })),
  )

  useEffect(() => {
    if (quote?.status === 'draft') rememberQuote(id)
  }, [id, quote?.status])

  async function updateQuote(patch) {
    quoteQ.mutate((q) => ({ ...q, ...patch }))
    const { error } = await supabase
      .from('quotes')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      toast(error.message, 'error')
      quoteQ.reload()
    }
  }

  async function changeJob(nextJobId) {
    await updateQuote({ job_id: nextJobId || null })
    quoteQ.reload() // refresh the embedded job + client details
  }

  async function updateItem(itemId, patch) {
    itemsQ.mutate((list) => list.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))
    const { error } = await supabase.from('quote_items').update(patch).eq('id', itemId)
    if (error) {
      toast(error.message, 'error')
      itemsQ.reload()
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Remove ${item.sku} from this quote?`)) return
    itemsQ.mutate((list) => list.filter((i) => i.id !== item.id))
    const { error } = await supabase.from('quote_items').delete().eq('id', item.id)
    if (error) {
      toast(error.message, 'error')
      itemsQ.reload()
    }
  }

  async function addProduct(product) {
    try {
      const item = await addQuoteItem(id, product, 1)
      itemsQ.mutate((list) => [...(list || []), item])
      toast(`Added ${product.sku}`)
    } catch (err) {
      toast(err.message || 'Could not add the product', 'error')
    }
  }

  if (quoteQ.loading && !quote) return <Spinner />
  if (quoteQ.error) return <ErrorMessage error={quoteQ.error} className="m-4" />
  if (!quote) return <EmptyState title="Quote not found" />

  const totals = quoteTotals(quote, items)

  if (params.get('view') === 'proposal') {
    return (
      <ProposalView
        quote={quote}
        items={items}
        totals={totals}
        diagramPath={diagrams?.[0]?.storage_path}
        onBack={() => setParams({}, { replace: true })}
      />
    )
  }

  const sortedMeasurements = sortByPart(measurements || [])
  const numericMeasurements = sortedMeasurements.filter(hasValue)

  return (
    <div className="pb-4">
      <PageHeader
        title={quoteTitle(quote)}
        subtitle={quote.job?.site_address}
        back="/quotes"
        action={<Button onClick={() => setParams({ view: 'proposal' })}>Proposal</Button>}
      />

      <Card className="mx-4 space-y-4 p-4">
        <Field label="Quote title">
          <input
            key={quote.title ?? ''}
            className={inputClass}
            defaultValue={quote.title ?? ''}
            placeholder={quote.job ? `Quote — ${quote.job.job_name}` : 'Untitled quote'}
            onBlur={(e) => e.target.value.trim() !== (quote.title ?? '') && updateQuote({ title: e.target.value.trim() || null })}
          />
        </Field>
        <Field label="Job">
          <select className={inputClass} value={quote.job_id ?? ''} onChange={(e) => changeJob(e.target.value)}>
            <option value="">No job</option>
            {jobs?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.job_name}
              </option>
            ))}
          </select>
        </Field>
        {quote.job && (
          <Link to={`/jobs/${quote.job.id}`} className="block text-sm font-medium text-blue-700">
            Open job record →
          </Link>
        )}
        <Field label="Status">
          <select className={inputClass} value={quote.status} onChange={(e) => updateQuote({ status: e.target.value })}>
            {QUOTE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      {quote.job_id && (
        <details className="mx-4 mt-4 rounded-xl border border-slate-200 bg-white" open>
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-semibold">
            Confirmed measurements ({sortedMeasurements.length})
          </summary>
          {sortedMeasurements.length ? (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {sortedMeasurements.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 break-words text-slate-600">
                    {[partLabel(m.component), m.dimension].filter(Boolean).join(' · ')}
                  </span>
                  <span className="shrink-0 text-right font-semibold">
                    {hasValue(m) ? formatMeasurement(m.value_confirmed, m.unit) : m.note}
                    {hasValue(m) && m.note && <span className="block text-xs font-normal text-slate-500">{m.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              No confirmed measurements on this job yet.
            </p>
          )}
        </details>
      )}

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Products</h2>
        <ErrorMessage error={itemsQ.error} />
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold break-all">{item.sku}</div>
                  <div className="text-sm break-words text-slate-600">
                    {hasRealDescription(item) ? item.description : 'No description on file'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="flex size-11 shrink-0 items-center justify-center text-slate-400"
                  aria-label={`Remove ${item.sku}`}
                >
                  <TrashIcon className="size-5" />
                </button>
              </div>

              <div className="mt-2 flex items-end gap-2">
                <label className="w-24">
                  <span className="block text-xs text-slate-500">Qty{item.uom && item.uom !== 'ea' ? ` (${item.uom})` : ''}</span>
                  <NumberInput value={item.quantity} onCommit={(quantity) => updateItem(item.id, { quantity })} />
                </label>
                <span className="pb-3 text-slate-400">×</span>
                <label className="w-28">
                  <span className="block text-xs text-slate-500">Unit price</span>
                  <NumberInput value={item.unit_price} onCommit={(unit_price) => updateItem(item.id, { unit_price })} />
                </label>
                <div className="flex-1 pb-2.5 text-right font-semibold">{currency(item.quantity * item.unit_price)}</div>
              </div>

              {item.uom === 'ft' && numericMeasurements.length > 0 && (
                <select
                  className={`${inputClass} mt-2 text-sm`}
                  value=""
                  onChange={(e) => {
                    const m = numericMeasurements.find((x) => x.id === e.target.value)
                    if (m) updateItem(item.id, { quantity: toBillableFeet(m) })
                  }}
                  aria-label="Set quantity from a measurement"
                >
                  <option value="">Set qty from a measurement…</option>
                  {numericMeasurements.map((m) => (
                    <option key={m.id} value={m.id}>
                      {partLabel(m.component)} {m.dimension}: {formatMeasurement(m.value_confirmed, m.unit)} →{' '}
                      {trimNumber(toBillableFeet(m))} ft
                    </option>
                  ))}
                </select>
              )}
            </Card>
          ))}
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdding(true)}>
          <PlusIcon className="size-5" /> Add product
        </Button>
      </section>

      <section className="mt-6 px-4">
        <h2 className="mb-2 text-lg font-bold">Pricing</h2>
        <Card className="space-y-4 p-4">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Material markup</span>
            <Segmented
              options={MULTIPLIERS}
              value={Number(quote.multiplier)}
              onChange={(multiplier) => updateQuote({ multiplier })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Install days">
              <NumberInput value={quote.labor_days} onCommit={(labor_days) => updateQuote({ labor_days })} />
            </Field>
            <Field label="Day rate ($)">
              <NumberInput value={quote.day_rate} onCommit={(day_rate) => updateQuote({ day_rate })} />
            </Field>
          </div>
          <Segmented
            options={DAY_RATES.map((r) => ({ value: r, label: `$${r / 1000}k` }))}
            value={Number(quote.day_rate)}
            onChange={(day_rate) => updateQuote({ day_rate })}
          />
          <Field label="Notes (shown on the proposal)">
            <textarea
              key={quote.notes ?? ''}
              className={`${inputClass} min-h-20`}
              defaultValue={quote.notes ?? ''}
              onBlur={(e) => e.target.value !== (quote.notes ?? '') && updateQuote({ notes: e.target.value || null })}
            />
          </Field>
        </Card>

        <Card className="mt-3 p-4">
          <dl className="space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <dt>Material cost (list)</dt>
              <dd>{currency(totals.material)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Markup (×{trimNumber(quote.multiplier)})</dt>
              <dd>+ {currency(totals.markup)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>
                Labor ({trimNumber(quote.labor_days || 0)} × {currency(quote.day_rate)})
              </dt>
              <dd>+ {currency(totals.labor)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold">
              <dt>Proposal price</dt>
              <dd>{currency(totals.total)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {adding && <AddProductSheet onAdd={addProduct} onClose={() => setAdding(false)} />}
    </div>
  )
}
