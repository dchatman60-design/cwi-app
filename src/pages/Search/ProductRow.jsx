import { hasRealDescription, priceLabel } from './catalog'

/** One search result: part number, description, type, and price. */
export default function ProductRow({ product, onClick, trailing, uses = 0 }) {
  return (
    <button
      type="button"
      onClick={() => onClick(product)}
      className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left active:bg-slate-50"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-bold break-all text-slate-900">{product.sku}</span>
          <span className="shrink-0 text-sm font-semibold text-slate-700">{priceLabel(product)}</span>
        </div>
        <div className={`text-sm break-words ${hasRealDescription(product) ? 'text-slate-700' : 'text-slate-400 italic'}`}>
          {hasRealDescription(product) ? product.description : 'No description on file'}
        </div>
        {(product.category || uses > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-medium">
            {product.category && <span className="text-blue-700">{product.category}</span>}
            {uses > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Used {uses}×
              </span>
            )}
          </div>
        )}
      </div>
      {trailing}
    </button>
  )
}
