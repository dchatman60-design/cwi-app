import { supabase } from '../../lib/supabase'
import { must } from '../../lib/useQuery'

// Pricing per CWI Engagement Guide §3.2:
// Proposal Price = Material Cost + (Material Cost × Multiplier) + Labor Cost
export const MULTIPLIERS = [
  { value: 0.25, label: '+25%' },
  { value: 0.5, label: '+50%' },
]
export const DAY_RATES = [2000, 3000, 4000]

export const QUOTE_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
]

export const QUOTE_LIST_SELECT = '*, job:job_id(id, job_name, site_address), items:quote_items(quantity, unit_price)'

export const LAST_QUOTE_KEY = 'cwi:last-quote'

export function quoteTotals(quote, items) {
  const material = items.reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_price || 0), 0)
  const markup = material * Number(quote.multiplier || 0)
  const labor = Number(quote.labor_days || 0) * Number(quote.day_rate || 0)
  return { material, markup, materialWithMarkup: material + markup, labor, total: material + markup + labor }
}

export function quoteTitle(quote) {
  return quote.title || (quote.job ? `Quote — ${quote.job.job_name}` : 'Untitled quote')
}

export async function createQuote({ jobId = null, title = null } = {}) {
  return must(await supabase.from('quotes').insert({ job_id: jobId, title }).select().single())
}

export async function addQuoteItem(quoteId, product, quantity = 1) {
  return must(
    await supabase
      .from('quote_items')
      .insert({
        quote_id: quoteId,
        product_id: product.id,
        sku: product.sku,
        description: product.description,
        uom: product.uom,
        unit_price: product.list_price ?? 0,
        quantity,
      })
      .select()
      .single(),
  )
}

export function rememberQuote(quoteId) {
  try {
    localStorage.setItem(LAST_QUOTE_KEY, quoteId)
  } catch {
    // ignore
  }
}

export function lastQuoteId() {
  try {
    return localStorage.getItem(LAST_QUOTE_KEY)
  } catch {
    return null
  }
}
