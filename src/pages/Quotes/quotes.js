import { inchesToBillableFeet } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { must } from '../../lib/useQuery'

// Pricing per CWI Engagement Guide §3.2, plus labor/service lines:
// Proposal = Material + (Material × Multiplier) + Labor/service lines + Days × Day rate
// Pemko products are marked up; labor/service lines are priced as entered.
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

// Labor / service lines: installing customer-supplied material, refurbishing, etc.
export const SERVICE_UNITS = [
  { value: 'ea', label: 'each' },
  { value: 'opening', label: 'per opening' },
  { value: 'hr', label: 'per hour' },
  { value: 'ft', label: 'per foot' },
  { value: 'lot', label: 'lump sum' },
]
export const SERVICE_SUGGESTIONS = [
  'Install customer-supplied threshold',
  'Install customer-supplied door bottom',
  'Install customer-supplied weatherstrip',
  'Refurbish existing threshold',
  'Refurbish door bottom',
  'Adjust / repair surface bolts',
  'Remove & dispose of existing',
  'Trip charge',
]

export const QUOTE_LIST_SELECT =
  '*, job:job_id(id, job_name, site_address), items:quote_items(quantity, unit_price, item_type)'

export const LAST_QUOTE_KEY = 'cwi:last-quote'

export const isService = (item) => item.item_type === 'service'
const lineTotal = (item) => Number(item.quantity || 0) * Number(item.unit_price || 0)

export function quoteTotals(quote, items) {
  const material = items.filter((i) => !isService(i)).reduce((sum, i) => sum + lineTotal(i), 0)
  const services = items.filter(isService).reduce((sum, i) => sum + lineTotal(i), 0)
  const markup = material * Number(quote.multiplier || 0)
  const labor = Number(quote.labor_days || 0) * Number(quote.day_rate || 0)
  return {
    material,
    markup,
    materialWithMarkup: material + markup,
    services,
    labor,
    total: material + markup + services + labor,
  }
}

/** Price of a group of lines (one opening): products with markup + labor/service. */
export function linesSubtotal(quote, items) {
  const t = quoteTotals(quote, items)
  return t.materialWithMarkup + t.services
}

export function quoteTitle(quote) {
  return quote.title || (quote.job ? `Quote — ${quote.job.job_name}` : 'Untitled quote')
}

/** A measurement → billable linear feet, rounded up to the nearest 0.5 LF. */
export function toBillableFeet(m) {
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

export async function createQuote({ jobId = null, title = null } = {}) {
  return must(await supabase.from('quotes').insert({ job_id: jobId, title }).select().single())
}

/** The quote a job is currently working from: the latest one not declined. */
export async function findCurrentQuote(jobId) {
  return must(
    await supabase
      .from('quotes')
      .select('*')
      .eq('job_id', jobId)
      .neq('status', 'declined')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )
}

export async function addQuoteItem(quoteId, product, quantity = 1, openingId = null) {
  return must(
    await supabase
      .from('quote_items')
      .insert({
        quote_id: quoteId,
        opening_id: openingId,
        item_type: 'product',
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

export async function addServiceItem(quoteId, { description, quantity, uom, unit_price }, openingId = null) {
  return must(
    await supabase
      .from('quote_items')
      .insert({ quote_id: quoteId, opening_id: openingId, item_type: 'service', sku: null, description, quantity, uom, unit_price })
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
