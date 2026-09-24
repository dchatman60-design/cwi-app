import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import NumberInput from '../../components/NumberInput'
import { Badge, Button, Card, EmptyState, ErrorMessage, Field, inputClass, PageHeader, Segmented, Spinner } from '../../components/ui'
import { currency, formatMeasurement, trimNumber } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, mustDelete, useQuery } from '../../lib/useQuery'
import { hasValue, partLabel, sortByPart } from '../Drawing/measurementParts'
import { openingTypeLabel } from '../Openings/openings'
import AddProductSheet from './AddProductSheet'
import ProposalView from './ProposalView'
import QuoteItemRow from './QuoteItemRow'
import {
  addQuoteItem,
  addServiceItem,
  DAY_RATES,
  linesSubtotal,
  MULTIPLIERS,
  QUOTE_STATUSES,
  quoteTitle,
  quoteTotals,
  rememberQuote,
} from './quotes'
import ServiceItemSheet from './ServiceItemSheet'

const QUOTE_SELECT =
  '*, job:job_id(id, job_name, site_address, client:client_id(client_name, contact_name, phone, email, address))'

/** Group quote lines and measurements by opening, plus a General group. */
function buildSections(openings, items, measurements) {
  const ids = new Set(openings.map((o) => o.id))
  const sorted = sortByPart(measurements)
  return [
    ...openings.map((opening) => ({
      key: opening.id,
      opening,
      items: items.filter((i) => i.opening_id === opening.id),
      measurements: sorted.filter((m) => m.opening_id === opening.id),
    })),
    {
      key: 'general',
      opening: null,
      items: items.filter((i) => !i.opening_id || !ids.has(i.opening_id)),
      measurements: sorted.filter((m) => !m.opening_id),
    },
  ]
}

export default function QuoteBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [adding, setAdding] = useState(null) // { kind: 'product' | 'service', opening }
  const [deleting, setDeleting] = useState(false)

  const quoteQ = useQuery(`quote:${id}`, async () =>
    must(await supabase.from('quotes').select(QUOTE_SELECT).eq('id', id).maybeSingle()),
  )
  const itemsQ = useQuery(`quote-items:${id}`, async () =>
    must(await supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order').order('created_at')),
  )
  const quote = quoteQ.data
  const items = useMemo(() => itemsQ.data || [], [itemsQ.data])
  const jobId = quote?.job_id

  const { data: openings } = useQuery(`quote-openings:${jobId}`, async () =>
    jobId ? must(await supabase.from('openings').select('*').eq('job_id', jobId).order('created_at')) : [],
  )
  const { data: measurements } = useQuery(`quote-measurements:${jobId}`, async () =>
    jobId ? must(await supabase.from('measurements').select('*').eq('job_id', jobId).eq('confirmed_by_mike', true)) : [],
  )
  const { data: diagrams } = useQuery(`quote-diagrams:${jobId}`, async () =>
    jobId
      ? must(
          await supabase
            .from('job_photos')
            .select('storage_path, opening_id, created_at')
            .eq('job_id', jobId)
            .eq('layer', 3)
            .order('created_at', { ascending: false }),
        )
      : [],
  )
  const { data: jobs } = useQuery('quote-jobs', async () =>
    must(await supabase.from('jobs').select('id, job_name').order('created_at', { ascending: false })),
  )

  const sections = useMemo(() => buildSections(openings || [], items, measurements || []), [openings, items, measurements])

  // Latest diagram per opening, for the proposal
  const diagramsByOpening = useMemo(() => {
    const map = {}
    for (const d of diagrams || []) if (d.opening_id && !map[d.opening_id]) map[d.opening_id] = d.storage_path
    return map
  }, [diagrams])

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
    if (!window.confirm(`Remove ${item.sku || item.description} from this quote?`)) return
    itemsQ.mutate((list) => list.filter((i) => i.id !== item.id))
    const { error } = await supabase.from('quote_items').delete().eq('id', item.id)
    if (error) {
      toast(error.message, 'error')
      itemsQ.reload()
    }
  }

  async function addProduct(product) {
    try {
      const item = await addQuoteItem(id, product, 1, adding?.opening?.id ?? null)
      itemsQ.mutate((list) => [...(list || []), item])
      toast(`Added ${product.sku}`)
    } catch (err) {
      toast(err.message || 'Could not add the product', 'error')
    }
  }

  async function addService(fields) {
    const item = await addServiceItem(id, fields, adding?.opening?.id ?? null)
    itemsQ.mutate((list) => [...(list || []), item])
    toast('Labor / service added')
  }

  async function deleteQuote() {
    if (!window.confirm(`Delete "${quoteTitle(quote)}" and all its lines? This can't be undone.`)) return
    setDeleting(true)
    try {
      mustDelete(await supabase.from('quotes').delete().eq('id', id).select('id'), 'this quote')
      toast('Quote deleted')
      navigate('/quotes', { replace: true })
    } catch (err) {
      toast(err.message, 'error')
      setDeleting(false)
    }
  }

  if (quoteQ.loading && !quote) return <Spinner />
  if (quoteQ.error) return <ErrorMessage error={quoteQ.error} className="m-4" />
  if (!quote) return <EmptyState title="Quote not found" />

  const totals = quoteTotals(quote, items)
  const hasOpenings = (openings || []).length > 0

  if (params.get('view') === 'proposal') {
    return (
      <ProposalView
        quote={quote}
        sections={sections}
        totals={totals}
        diagramsByOpening={diagramsByOpening}
        onBack={() => setParams({}, { replace: true })}
      />
    )
  }

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

      {quote.job && !hasOpenings && (
        <p className="mx-4 mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Add openings to the job to break this quote out by door and window.
        </p>
      )}

      {sections.map((section) => {
        const { opening } = section
        if (!opening && hasOpenings && section.items.length === 0 && section.measurements.length === 0) {
          // Keep General available but compact when every line belongs to an opening
          return (
            <div key={section.key} className="mt-6 px-4">
              <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">General — job-wide</h2>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => setAdding({ kind: 'product', opening: null })}>
                  <PlusIcon className="size-5" /> Product
                </Button>
                <Button variant="secondary" onClick={() => setAdding({ kind: 'service', opening: null })}>
                  <PlusIcon className="size-5" /> Labor
                </Button>
              </div>
            </div>
          )
        }
        const numeric = section.measurements.filter(hasValue)
        return (
          <section key={section.key} className="mt-6 px-4">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold break-words">
                  {opening ? opening.opening_name : hasOpenings ? 'General — job-wide' : 'Products & work'}
                </h2>
                {opening && (
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                    {openingTypeLabel(opening.opening_type)}
                    {opening.is_fire_rated && <Badge tone="redSoft">Fire-rated</Badge>}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-bold">{currency(linesSubtotal(quote, section.items))}</span>
            </div>

            {section.measurements.length > 0 && (
              <details className="mb-3 rounded-xl border border-slate-200 bg-white">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold">
                  Measurements ({section.measurements.length})
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {section.measurements.map((m) => (
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
              </details>
            )}

            <div className="space-y-3">
              {section.items.map((item) => (
                <QuoteItemRow
                  key={item.id}
                  item={item}
                  measurements={numeric}
                  onUpdate={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item)}
                />
              ))}
              {section.items.length === 0 && <p className="text-sm text-slate-500">No products or work yet.</p>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setAdding({ kind: 'product', opening })}>
                <PlusIcon className="size-5" /> Product
              </Button>
              <Button variant="secondary" onClick={() => setAdding({ kind: 'service', opening })}>
                <PlusIcon className="size-5" /> Labor
              </Button>
            </div>
          </section>
        )
      })}

      <section className="mt-8 px-4">
        <h2 className="mb-2 text-lg font-bold">Pricing</h2>
        <Card className="space-y-4 p-4">
          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Material markup (Pemko products)</span>
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
              <dt>Pemko material (list)</dt>
              <dd>{currency(totals.material)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Markup (×{trimNumber(quote.multiplier)})</dt>
              <dd>+ {currency(totals.markup)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>Labor / service lines</dt>
              <dd>+ {currency(totals.services)}</dd>
            </div>
            <div className="flex justify-between text-slate-600">
              <dt>
                Install days ({trimNumber(quote.labor_days || 0)} × {currency(quote.day_rate)})
              </dt>
              <dd>+ {currency(totals.labor)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-xl font-bold">
              <dt>Proposal price</dt>
              <dd>{currency(totals.total)}</dd>
            </div>
          </dl>
        </Card>

        <Button variant="dangerOutline" className="mt-8 w-full" onClick={deleteQuote} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete quote'}
        </Button>
      </section>

      {adding?.kind === 'product' && <AddProductSheet onAdd={addProduct} onClose={() => setAdding(null)} />}
      {adding?.kind === 'service' && (
        <ServiceItemSheet openingName={adding.opening?.opening_name} onAdd={addService} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}
