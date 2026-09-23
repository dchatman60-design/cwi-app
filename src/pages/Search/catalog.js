import { useEffect, useState } from 'react'
import { currency } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'

export const PRODUCT_COLUMNS =
  'id, sku, description, category, uom, list_price, price_per_lf, coverage_notes, notes, series_name, application, fire_rating, install_type, material, available_finishes, available_sizes, companion_skus'

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

  return {
    results: result.data || [],
    error: result.error,
    searching: enabled && (debounced !== query || result.loading),
    enabled,
    maxed: (result.data?.length || 0) >= MAX_RESULTS,
  }
}
