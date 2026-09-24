import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import { Badge, Button, Card, ErrorMessage, Spinner } from '../../components/ui'
import { currency } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { hasValue } from '../Drawing/measurementParts'
import AddProductSheet from '../Quotes/AddProductSheet'
import QuoteItemRow from '../Quotes/QuoteItemRow'
import { addQuoteItem, addServiceItem, createQuote, findCurrentQuote, linesSubtotal, QUOTE_STATUSES, quoteTitle } from '../Quotes/quotes'
import ServiceItemSheet from '../Quotes/ServiceItemSheet'

/**
 * Products and work for one opening. Lines live on the job's current quote
 * (the latest one not declined), tagged to this opening — so the quote is
 * always broken out the same way. A draft quote is started if there's none.
 */
export default function OpeningProducts({ job, opening }) {
  const [adding, setAdding] = useState(null) // 'product' | 'service'

  const quoteQ = useQuery(`current-quote:${job.id}`, () => findCurrentQuote(job.id))
  const quote = quoteQ.data
  const itemsQ = useQuery(`opening-items:${quote?.id}:${opening.id}`, async () =>
    quote
      ? must(
          await supabase
            .from('quote_items')
            .select('*')
            .eq('quote_id', quote.id)
            .eq('opening_id', opening.id)
            .order('sort_order')
            .order('created_at'),
        )
      : [],
  )
  const { data: measurements } = useQuery(`opening-numeric:${opening.id}`, async () =>
    must(await supabase.from('measurements').select('*').eq('opening_id', opening.id).eq('confirmed_by_mike', true)),
  )
  const items = itemsQ.data || []

  async function ensureQuote() {
    if (quote) return quote
    const created = await createQuote({ jobId: job.id })
    quoteQ.reload()
    return created
  }

  async function addProduct(product) {
    try {
      const q = await ensureQuote()
      const item = await addQuoteItem(q.id, product, 1, opening.id)
      if (q === quote) itemsQ.mutate((list) => [...(list || []), item])
      toast(`Added ${product.sku}`)
    } catch (err) {
      toast(err.message || 'Could not add the product', 'error')
    }
  }

  async function addService(fields) {
    const q = await ensureQuote()
    const item = await addServiceItem(q.id, fields, opening.id)
    if (q === quote) itemsQ.mutate((list) => [...(list || []), item])
    toast('Labor / service added')
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
    if (!window.confirm(`Remove ${item.sku || item.description}?`)) return
    itemsQ.mutate((list) => list.filter((i) => i.id !== item.id))
    const { error } = await supabase.from('quote_items').delete().eq('id', item.id)
    if (error) {
      toast(error.message, 'error')
      itemsQ.reload()
    }
  }

  if (quoteQ.loading && quote === undefined) return <Spinner />

  return (
    <div className="space-y-3">
      <ErrorMessage error={quoteQ.error || itemsQ.error} />
      {quote ? (
        <Card className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">On quote</div>
            <div className="font-semibold break-words">{quoteTitle({ ...quote, job })}</div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge>{QUOTE_STATUSES.find((s) => s.value === quote.status)?.label || quote.status}</Badge>
            <Link to={`/quotes/${quote.id}`} className="text-sm font-medium text-blue-700">
              Open quote →
            </Link>
          </div>
        </Card>
      ) : (
        <p className="text-sm text-slate-500">No quote yet — adding a product or labor line starts a draft quote for this job.</p>
      )}

      {items.map((item) => (
        <QuoteItemRow
          key={item.id}
          item={item}
          measurements={(measurements || []).filter(hasValue)}
          onUpdate={(patch) => updateItem(item.id, patch)}
          onRemove={() => removeItem(item)}
        />
      ))}

      {quote && items.length > 0 && (
        <div className="flex justify-between px-1 font-semibold">
          <span>Opening subtotal</span>
          <span>{currency(linesSubtotal(quote, items))}</span>
        </div>
      )}
      {quote && items.length > 0 && Number(quote.multiplier) > 0 && (
        <p className="px-1 text-xs text-slate-500">Includes the quote&apos;s material markup on Pemko products.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setAdding('product')}>
          <PlusIcon className="size-5" /> Pemko product
        </Button>
        <Button variant="secondary" onClick={() => setAdding('service')}>
          <PlusIcon className="size-5" /> Labor / service
        </Button>
      </div>

      {adding === 'product' && <AddProductSheet onAdd={addProduct} onClose={() => setAdding(null)} />}
      {adding === 'service' && (
        <ServiceItemSheet openingName={opening.opening_name} onAdd={addService} onClose={() => setAdding(null)} />
      )}
    </div>
  )
}
