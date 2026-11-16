import { useState } from 'react'
import { SearchIcon } from '../../components/icons'
import { EditIcon } from '../../components/icons'
import { Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Sheet, Spinner } from '../../components/ui'
import { currency } from '../../lib/format'
import AddToQuoteSheet from './AddToQuoteSheet'
import EditDescriptionSheet from './EditDescriptionSheet'
import PopularProducts from './PopularProducts'
import ProductRow from './ProductRow'
import { CATEGORIES, hasRealDescription, priceLabel, useProductSearch, usesOf } from './catalog'

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

function ProductDetail({ product, uses, onClose, onAddToQuote, onEdit }) {
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
      <button
        type="button"
        onClick={onEdit}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-3 font-medium text-blue-700 ring-1 ring-slate-200 active:bg-slate-50"
      >
        <EditIcon className="size-4" />
        {hasRealDescription(product) ? 'Edit description' : 'Add a description'}
      </button>
      {uses > 0 && <p className="mt-2 text-sm text-amber-800">Used {uses}× on quotes</p>}
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
  const [editing, setEditing] = useState(null)
  const [edited, setEdited] = useState({}) // id → product saved this visit
  const { results: rawResults, usage, error, searching, enabled, maxed } = useProductSearch(query, category)
  const results = rawResults.map((p) => edited[p.id] || p)
  const current = selected && (edited[selected.id] || selected)

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
          <>
            <EmptyState title="Search 5,336 Pemko products">Type a part number or keyword, or pick a product type.</EmptyState>
            <PopularProducts onPick={setSelected} edited={edited} />
          </>
        )}
        {enabled && searching && results.length === 0 && <Spinner label="Searching…" />}
        {enabled && !searching && results.length === 0 && !error && (
          <EmptyState title="No products found">Try fewer words, or a partial SKU.</EmptyState>
        )}
        {results.length > 0 && (
          <>
            <Card className={`divide-y divide-slate-100 ${searching ? 'opacity-60' : ''}`}>
              {results.map((p) => (
                <ProductRow key={p.id} product={p} uses={usesOf(usage, p.id)} onClick={setSelected} />
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

      {current && !adding && !editing && (
        <ProductDetail
          product={current}
          uses={usesOf(usage, current.id)}
          onClose={() => setSelected(null)}
          onAddToQuote={() => setAdding(current)}
          onEdit={() => setEditing(current)}
        />
      )}
      {editing && (
        <EditDescriptionSheet
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => setEdited((m) => ({ ...m, [saved.id]: saved }))}
        />
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
