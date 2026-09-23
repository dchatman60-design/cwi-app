import { useState } from 'react'
import { SearchIcon } from '../../components/icons'
import { Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Sheet, Spinner } from '../../components/ui'
import { currency } from '../../lib/format'
import AddToQuoteSheet from './AddToQuoteSheet'
import ProductRow from './ProductRow'
import { CATEGORIES, hasRealDescription, priceLabel, useProductSearch } from './catalog'

const DETAIL_FIELDS = [
  ['category', 'Product type'],
  ['uom', 'Unit of measure'],
  ['coverage_notes', 'Coverage / size'],
  ['series_name', 'Series'],
  ['application', 'Application'],
  ['fire_rating', 'Fire rating'],
  ['install_type', 'Install type'],
  ['material', 'Material'],
  ['available_finishes', 'Finishes'],
  ['available_sizes', 'Sizes'],
  ['companion_skus', 'Companion SKUs'],
  ['notes', 'Notes'],
]

function ProductDetail({ product, onClose, onAddToQuote }) {
  return (
    <Sheet
      open
      title={product.sku}
      onClose={onClose}
      footer={
        <Button className="w-full" onClick={onAddToQuote}>
          Add to Quote
        </Button>
      }
    >
      <div className="text-2xl font-bold">{priceLabel(product)}</div>
      {product.price_per_lf !== null && product.uom !== 'ft' && (
        <div className="text-sm text-slate-500">{currency(product.price_per_lf)} per linear foot</div>
      )}
      <p className={`mt-3 ${hasRealDescription(product) ? 'text-slate-800' : 'text-slate-400 italic'}`}>
        {hasRealDescription(product) ? product.description : 'No description on file for this SKU.'}
      </p>
      <Card className="mt-4 divide-y divide-slate-100">
        <div className="px-4 py-3">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Part number</div>
          <div className="font-medium break-all">{product.sku}</div>
        </div>
        {DETAIL_FIELDS.filter(([key]) => product[key]).map(([key, label]) => (
          <div key={key} className="px-4 py-3">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</div>
            <div className="break-words">{product[key]}</div>
          </div>
        ))}
      </Card>
    </Sheet>
  )
}

export default function ProductSearch() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState(null)
  const [adding, setAdding] = useState(null)
  const { results, error, searching, enabled, maxed } = useProductSearch(query, category)

  return (
    <div>
      <PageHeader title="Product Search" subtitle="Pemko catalog · July 2026 list prices" />

      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 space-y-2 bg-slate-50 px-4 pb-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            enterKeyHint="search"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`${inputClass} pl-10`}
            placeholder="SKU or keyword — e.g. 315CN, sweep"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Product type">
          <option value="">All product types</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="px-4">
        <ErrorMessage error={error} />
        {!enabled && (
          <EmptyState title="Search 5,336 Pemko products">Type a part number or keyword, or pick a product type.</EmptyState>
        )}
        {enabled && searching && results.length === 0 && <Spinner label="Searching…" />}
        {enabled && !searching && results.length === 0 && !error && (
          <EmptyState title="No products found">Try fewer words, or a partial SKU.</EmptyState>
        )}
        {results.length > 0 && (
          <>
            <Card className={`divide-y divide-slate-100 ${searching ? 'opacity-60' : ''}`}>
              {results.map((p) => (
                <ProductRow key={p.id} product={p} onClick={setSelected} />
              ))}
            </Card>
            {maxed && (
              <p className="py-3 text-center text-sm text-slate-500">
                Showing the first {results.length} matches — add more words to narrow it down.
              </p>
            )}
          </>
        )}
      </div>

      {selected && !adding && (
        <ProductDetail product={selected} onClose={() => setSelected(null)} onAddToQuote={() => setAdding(selected)} />
      )}
      {adding && (
        <AddToQuoteSheet
          product={adding}
          onClose={() => {
            setAdding(null)
            setSelected(null)
          }}
        />
      )}
    </div>
  )
}
