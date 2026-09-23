import { useState } from 'react'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Card, EmptyState, ErrorMessage, inputClass, Sheet, Spinner } from '../../components/ui'
import ProductRow from '../Search/ProductRow'
import { useProductSearch } from '../Search/catalog'

/** Search the Pemko catalog and add products to the open quote. */
export default function AddProductSheet({ onAdd, onClose }) {
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const { results, error, searching, enabled } = useProductSearch(query)

  async function add(product) {
    setBusyId(product.id)
    await onAdd(product)
    setBusyId(null)
  }

  return (
    <Sheet open title="Add products" onClose={onClose}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          autoFocus
          autoCapitalize="characters"
          autoCorrect="off"
          className={`${inputClass} pl-10`}
          placeholder="SKU or keyword"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="mt-3">
        <ErrorMessage error={error} />
        {!enabled && <EmptyState title="Search the catalog">Tap a product to add it to this quote.</EmptyState>}
        {enabled && searching && results.length === 0 && <Spinner label="Searching…" />}
        {enabled && !searching && results.length === 0 && <EmptyState title="No products found" />}
        {results.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {results.map((p) => (
              <ProductRow
                key={p.id}
                product={p}
                onClick={add}
                trailing={
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    {busyId === p.id ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
                    ) : (
                      <PlusIcon className="size-5" />
                    )}
                  </span>
                }
              />
            ))}
          </Card>
        )}
      </div>
    </Sheet>
  )
}
