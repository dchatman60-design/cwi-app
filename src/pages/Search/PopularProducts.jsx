import { Card } from '../../components/ui'
import ProductRow from './ProductRow'
import { usePopularProducts, usesOf } from './catalog'

/**
 * "Frequently used" parts — the ones put on quotes most often — shown before
 * anyone types a search. `renderTrailing(product)` adds a button per row.
 * `edited` is a map of id → updated product, so fresh edits show right away.
 */
export default function PopularProducts({ onPick, renderTrailing, edited, limit = 15 }) {
  const { products, usage } = usePopularProducts(limit)
  if (!products.length) return null
  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Frequently used</h3>
      <Card className="divide-y divide-slate-100">
        {products.map((raw) => {
          const p = edited?.[raw.id] || raw
          return (
            <ProductRow key={p.id} product={p} uses={usesOf(usage, p.id)} onClick={onPick} trailing={renderTrailing?.(p)} />
          )
        })}
      </Card>
    </section>
  )
}
