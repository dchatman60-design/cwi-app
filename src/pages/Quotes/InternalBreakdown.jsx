import { currency, trimNumber } from '../../lib/format'
import { hasRealDescription } from '../Search/catalog'
import { isService, linesSubtotal, quoteTitle, SERVICE_UNITS } from './quotes'

const lineCost = (item) => Number(item.quantity || 0) * Number(item.unit_price || 0)

function unitLabel(item) {
  if (isService(item)) return SERVICE_UNITS.find((u) => u.value === item.uom)?.label.replace(/^per /, '') || ''
  return item.uom || 'ea'
}

/**
 * For CWI only: every line with quantity, list/unit price and cost, the
 * markup, each door's share of install labor and the totals the customer
 * proposal rolls up into one price. Printable, marked internal.
 */
export default function InternalBreakdown({ quote, sections, totals, deposit, balance }) {
  const multiplier = Number(quote.multiplier || 0)
  const laborDays = Number(quote.labor_days || 0)
  const used = sections.filter((s) => s.items.length)

  // Same split the price would carry per door: labor in proportion to each door's subtotal
  const subtotals = used.map((s) => linesSubtotal(quote, s.items))
  const base = subtotals.reduce((a, b) => a + b, 0)
  let given = 0
  const laborShares = subtotals.map((sub, i) => {
    if (!totals.labor || base <= 0) return 0
    const share =
      i === subtotals.length - 1
        ? Math.round((totals.labor - given) * 100) / 100
        : Math.round(((totals.labor * sub) / base) * 100) / 100
    given += share
    return share
  })

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-8 print:border-0 print:p-0">
      <header className="border-b-2 border-red-700 pb-3">
        <div className="text-xs font-bold tracking-widest text-red-700 uppercase">Internal — not for customer</div>
        <h1 className="mt-1 text-xl font-bold">Cost breakdown</h1>
        <div className="text-sm text-slate-600">
          {quote.job?.job_name || quoteTitle(quote)}
          {quote.job?.client?.client_name && ` · ${quote.job.client.client_name}`}
        </div>
      </header>

      {/* Summary */}
      <section className="mt-4 max-w-md break-inside-avoid">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Pemko material at list</dt>
            <dd className="tabular-nums">{currency(totals.material)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Markup ({Math.round(multiplier * 100)}% on material)</dt>
            <dd className="tabular-nums">{currency(totals.markup)}</dd>
          </div>
          {totals.services > 0 && (
            <div className="flex justify-between gap-4">
              <dt>Labor / service lines</dt>
              <dd className="tabular-nums">{currency(totals.services)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt>
              Install labor ({trimNumber(laborDays)} day{laborDays === 1 ? '' : 's'} × {currency(quote.day_rate)})
            </dt>
            <dd className="tabular-nums">{currency(totals.labor)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t-2 border-slate-900 pt-1.5 text-base font-bold">
            <dt>Total Job</dt>
            <dd className="tabular-nums">{currency(totals.total)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-slate-600">
            <dt>50% deposit / 50% on completion</dt>
            <dd className="tabular-nums">
              {currency(deposit)} / {currency(balance)}
            </dd>
          </div>
        </dl>
      </section>

      {/* Per door */}
      <div className="mt-6 space-y-5">
        {used.map((section, i) => {
          const products = section.items.filter((it) => !isService(it))
          const material = products.reduce((sum, it) => sum + lineCost(it), 0)
          return (
            <section key={section.key} className="break-inside-avoid">
              <h2 className="border-b border-slate-300 pb-1 font-bold">
                {section.opening ? section.opening.opening_name : 'Not tied to a door'}
              </h2>
              <ul className="mt-1 divide-y divide-slate-100 text-sm">
                {section.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="min-w-0 break-words">
                      {isService(item) ? (
                        item.description
                      ) : (
                        <>
                          <span className="font-semibold">{item.sku}</span>
                          {hasRealDescription(item) && <span className="text-slate-600"> — {item.description}</span>}
                        </>
                      )}
                      <span className="block text-xs text-slate-500">
                        {trimNumber(item.quantity)} {unitLabel(item)} × {currency(item.unit_price)}
                        {isService(item) ? ' (as entered)' : ' list'}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">{currency(lineCost(item))}</span>
                  </li>
                ))}
              </ul>
              <dl className="mt-1 ml-auto max-w-xs space-y-0.5 text-sm">
                {material > 0 && multiplier > 0 && (
                  <div className="flex justify-between gap-4 text-slate-600">
                    <dt>Markup {Math.round(multiplier * 100)}%</dt>
                    <dd className="tabular-nums">{currency(material * multiplier)}</dd>
                  </div>
                )}
                {laborShares[i] > 0 && (
                  <div className="flex justify-between gap-4 text-slate-600">
                    <dt>Share of install labor</dt>
                    <dd className="tabular-nums">{currency(laborShares[i])}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>Door total</dt>
                  <dd className="tabular-nums">{currency(subtotals[i] + laborShares[i])}</dd>
                </div>
              </dl>
            </section>
          )
        })}
        {!used.length && <p className="text-sm text-slate-500 italic">No lines on this quote yet.</p>}
      </div>
    </article>
  )
}
