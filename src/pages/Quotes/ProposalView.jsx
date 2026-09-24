import { BackIcon, PrintIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Button } from '../../components/ui'
import { currency, trimNumber } from '../../lib/format'
import { openingTypeLabel } from '../Openings/openings'
import { hasRealDescription } from '../Search/catalog'
import { isService, linesSubtotal, quoteTitle, SERVICE_UNITS } from './quotes'

function qtyLabel(item) {
  const qty = trimNumber(item.quantity)
  if (isService(item)) {
    if (item.uom === 'lot') return ''
    const unit = SERVICE_UNITS.find((u) => u.value === item.uom)?.label.replace(/^per /, '') || ''
    return unit === 'each' ? qty : `${qty} ${unit}`
  }
  return item.uom === 'ea' || !item.uom ? qty : `${qty} ${item.uom}`
}

/**
 * Client-facing proposal, broken out by opening. Each opening shows its
 * materials and work with a price (materials include markup); the internal
 * multiplier and unit costs are not shown.
 */
export default function ProposalView({ quote, sections, totals, diagramsByOpening, onBack }) {
  const client = quote.job?.client
  const date = new Date(quote.updated_at || quote.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const hasOpenings = sections.some((s) => s.opening)
  const visible = sections.filter((s) => s.items.length > 0 || (s.opening && diagramsByOpening[s.opening.id]))

  return (
    <div className="px-4 pt-4 print:p-0">
      <div className="mb-4 flex gap-3 print:hidden">
        <Button variant="secondary" onClick={onBack}>
          <BackIcon className="size-5" /> Edit quote
        </Button>
        <Button className="flex-1" onClick={() => window.print()}>
          <PrintIcon className="size-5" /> Print / Save PDF
        </Button>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-5 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-lg font-black tracking-tight">CUSTOM WEATHERSTRIP, INC.</div>
            <div className="text-sm text-slate-500">Costa Mesa, California</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold tracking-widest text-slate-700">PROPOSAL</div>
            <div className="text-sm text-slate-500">{date}</div>
          </div>
        </header>

        <section className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Prepared for</div>
            <div className="font-semibold">{client?.client_name || '—'}</div>
            {client?.contact_name && client.contact_name !== client.client_name && (
              <div className="text-sm">{client.contact_name}</div>
            )}
            {client?.address && <div className="text-sm whitespace-pre-wrap text-slate-600">{client.address}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Project</div>
            <div className="font-semibold">{quote.job?.job_name || quoteTitle(quote)}</div>
            {quote.job?.site_address && (
              <div className="text-sm whitespace-pre-wrap text-slate-600">{quote.job.site_address}</div>
            )}
          </div>
        </section>

        {visible.map((section) => {
          const products = section.items.filter((i) => !isService(i))
          const services = section.items.filter(isService)
          const diagram = section.opening && diagramsByOpening[section.opening.id]
          return (
            <section key={section.key} className="mt-4 break-inside-avoid border-t border-slate-200 pt-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-bold">
                  {section.opening ? section.opening.opening_name : hasOpenings ? 'General' : 'Scope of work'}
                  {section.opening && (
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {openingTypeLabel(section.opening.opening_type)}
                    </span>
                  )}
                </h2>
                {section.items.length > 0 && (
                  <span className="font-semibold">{currency(linesSubtotal(quote, section.items))}</span>
                )}
              </div>

              {products.length > 0 && (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {products.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 align-top">
                        <td className="w-20 py-1.5 pr-3 whitespace-nowrap">{qtyLabel(item)}</td>
                        <td className="py-1.5 break-words">
                          <span className="font-semibold">Pemko {item.sku}</span>
                          {hasRealDescription(item) && <span className="text-slate-600"> — {item.description}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {services.length > 0 && (
                <table className="mt-2 w-full text-sm">
                  <tbody>
                    {services.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100 align-top">
                        <td className="w-20 py-1.5 pr-3 whitespace-nowrap">{qtyLabel(item)}</td>
                        <td className="py-1.5 break-words">{item.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {diagram && (
                <SignedImage layer={3} path={diagram} className="mt-3 w-full rounded border border-slate-200 object-contain" />
              )}
            </section>
          )
        })}

        <section className="mt-6 ml-auto max-w-sm break-inside-avoid">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt>Materials &amp; work</dt>
              <dd>{currency(totals.materialWithMarkup + totals.services)}</dd>
            </div>
            {totals.labor > 0 && (
              <div className="flex justify-between">
                <dt>
                  Installation labor ({trimNumber(quote.labor_days)} day{Number(quote.labor_days) === 1 ? '' : 's'})
                </dt>
                <dd>{currency(totals.labor)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t-2 border-slate-900 pt-2 text-lg font-bold">
              <dt>Total</dt>
              <dd>{currency(totals.total)}</dd>
            </div>
          </dl>
        </section>

        {quote.notes && (
          <section className="mt-5">
            <h2 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
          </section>
        )}

        <footer className="mt-10 grid grid-cols-2 gap-6 text-sm text-slate-500 break-inside-avoid">
          <div className="border-t border-slate-400 pt-1">Accepted by</div>
          <div className="border-t border-slate-400 pt-1">Date</div>
        </footer>
      </article>
    </div>
  )
}
