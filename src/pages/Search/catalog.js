import { useEffect, useState } from 'react'
import { currency } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'

export const PRODUCT_COLUMNS =
  'id, sku, description, original_description, category, uom, list_price, price_per_lf, coverage_notes, notes, series_name, application, fire_rating, install_type, material, available_finishes, available_sizes, companion_skus'

export const CATEGORIES = [
  'Weatherstripping & Thresholds',
  'Thresholds',
  'Weatherstripping',
  'Automatic Door Bottoms',
  'Gaskets & Seals',
  'Acoustic Sets',
  'Seals & Fasteners',
  'Privacy Seal Sets',
  'Modular Ramp Systems',
  'Door Hardware',
  'PemkoHinge',
  'Pin & Barrel Hinges',
  'Floor Closers',
  'Accessories',
]

const MAX_RESULTS = 60

/** Some catalog rows were loaded with a placeholder description. */
export function hasRealDescription(product) {
  return Boolean(product.description) && !/^Pemko Product /i.test(product.description)
}

export function priceLabel(product) {
  if (product.list_price === null || product.list_price === undefined) return 'No price'
  const unit = product.uom === 'ea' || !product.uom ? ' ea' : ` / ${product.uom}`
  return `${currency(product.list_price)}${unit}`
}

// Characters that would break PostgREST's or() filter syntax
const cleanWord = (w) => w.replace(/[,()"'\\%*:]/g, '')

/**
 * Real-time catalog search (debounced). Every word must match the SKU,
 * description, or category. Exact and prefix SKU matches sort first.
 */
export function useProductSearch(query, category = '') {
  const [debounced, setDebounced] = useState(query)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(timer)
  }, [query])

  const words = debounced.trim().split(/\s+/).map(cleanWord).filter(Boolean)
  const enabled = words.length > 0 || Boolean(category)

  const result = useQuery(`products:${category}:${words.join(' ')}`, async () => {
    if (!enabled) return []
    const base = (limit) => {
      const q = supabase.from('pemko_products').select(PRODUCT_COLUMNS).order('sku').limit(limit)
      return category ? q.eq('category', category) : q
    }

    let broad = base(MAX_RESULTS)
    for (const w of words) broad = broad.or(`sku.ilike.*${w}*,description.ilike.*${w}*,category.ilike.*${w}*`)
    // A single word may be a part number: fetch SKUs that start with it separately,
    // so an exact match is never cut off by the result limit.
    const [skuMatches, rows] = await Promise.all([
      words.length === 1 ? base(20).ilike('sku', `${words[0]}*`).then(must) : [],
      broad.then(must),
    ])

    const seen = new Set(skuMatches.map((p) => p.id))
    const merged = [...skuMatches, ...rows.filter((p) => !seen.has(p.id))].slice(0, MAX_RESULTS)

    const first = (words[0] || '').toLowerCase()
    const rank = (p) => {
      const sku = p.sku.toLowerCase()
      return sku === first ? 0 : sku.startsWith(first) ? 1 : 2
    }
    return first ? merged.sort((a, b) => rank(a) - rank(b)) : merged
  })

  // Within the same match quality, parts used most on past quotes come first.
  const usage = useProductUsage()
  const results = (result.data || [])
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const first = (words[0] || '').toLowerCase()
      const r = (x) => (!first ? 0 : x.sku.toLowerCase() === first ? 0 : x.sku.toLowerCase().startsWith(first) ? 1 : 2)
      return r(a.p) - r(b.p) || usesOf(usage, b.p.id) - usesOf(usage, a.p.id) || a.i - b.i
    })
    .map(({ p }) => p)

  return {
    results,
    usage,
    error: result.error,
    searching: enabled && (debounced !== query || result.loading),
    enabled,
    maxed: (result.data?.length || 0) >= MAX_RESULTS,
  }
}

/** Times a part has been put on quotes, from the product_usage view. */
export function usesOf(usage, productId) {
  return usage?.get(productId)?.line_count || 0
}

/** Map of product_id → { line_count, quote_count, last_used }. Cached for the session. */
export function useProductUsage() {
  const { data } = useQuery('product-usage', async () => {
    const { data: rows, error } = await supabase.from('product_usage').select('product_id, line_count, quote_count, last_used')
    if (error) return new Map() // view not installed yet — just skip the ranking
    return new Map(rows.map((r) => [r.product_id, r]))
  })
  return data || EMPTY_USAGE
}
const EMPTY_USAGE = new Map()

/** The parts used most often on quotes, most-used first (recently used breaks ties). */
export function usePopularProducts(limit = 15) {
  const usage = useProductUsage()
  const ids = [...usage.values()]
    .sort((a, b) => b.line_count - a.line_count || String(b.last_used).localeCompare(String(a.last_used)))
    .slice(0, limit)
    .map((r) => r.product_id)
  const key = ids.join(',')
  const { data, loading } = useQuery(`popular-products:${key}`, async () => {
    if (!ids.length) return []
    const rows = must(await supabase.from('pemko_products').select(PRODUCT_COLUMNS).in('id', ids))
    return rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  })
  return { products: data || [], loading: loading && ids.length > 0, usage }
}

/** The parts used most recently on quotes. */
export function useRecentProducts(limit = 8) {
  const usage = useProductUsage()
  const ids = [...usage.values()]
    .sort((a, b) => String(b.last_used).localeCompare(String(a.last_used)))
    .slice(0, limit)
    .map((r) => r.product_id)
  const key = ids.join(',')
  const { data } = useQuery(`recent-products:${key}`, async () => {
    if (!ids.length) return []
    const rows = must(await supabase.from('pemko_products').select(PRODUCT_COLUMNS).in('id', ids))
    return rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  })
  return data || []
}

/**
 * Save a new description (and notes) for a catalog part. The catalog's original
 * text is kept the first time. With `updateDraftQuotes`, lines for this part on
 * draft quotes pick up the new description too. Returns the saved product.
 */
export async function saveProductDescription(product, { description, notes, userId, updateDraftQuotes = true }) {
  const patch = {
    description: description.trim() || product.description,
    notes: notes?.trim() || null,
    description_updated_at: new Date().toISOString(),
    description_updated_by: userId || null,
  }
  if (!product.original_description) patch.original_description = product.description
  const saved = must(
    await supabase.from('pemko_products').update(patch).eq('id', product.id).select(PRODUCT_COLUMNS).single(),
  )
  let linesUpdated = 0
  if (updateDraftQuotes && patch.description !== product.description) {
    const drafts = must(await supabase.from('quotes').select('id').eq('status', 'draft'))
    if (drafts.length) {
      const rows = must(
        await supabase
          .from('quote_items')
          .update({ description: patch.description })
          .eq('product_id', product.id)
          .in('quote_id', drafts.map((q) => q.id))
          .select('id'),
      )
      linesUpdated = rows.length
    }
  }
  return { product: saved, linesUpdated }
}
