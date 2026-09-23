import { BackIcon, PrintIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Button } from '../../components/ui'
import { currency, trimNumber } from '../../lib/format'
import { hasRealDescription } from '../Search/catalog'
import { quoteTitle } from './quotes'

/**
 * Client-facing proposal summary. Materials are shown with markup included;
 * the internal multiplier and unit costs are not shown to the client.
 */
export default function ProposalView({ quote, items, totals, diagramPath, onBack }) {
  const client = quote.job?.client
  const date = new Date(quote.updated_at || quote.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

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

        <section>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Scope of materials</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-500">
                <th className="py-2 pr-2 font-semibold">Qty</th>
                <th className="py-2 font-semibold">Item</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {trimNumber(item.quantity)} {item.uom === 'ea' || !item.uom ? '' : item.uom}
                  </td>
                  <td className="py-2 break-words">
                    <span className="font-semibold">Pemko {item.sku}</span>
                    {hasRealDescription(item) && <span className="text-slate-600"> — {item.description}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {diagramPath && (
          <section className="mt-5 break-inside-avoid">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Opening diagram</h2>
            <SignedImage layer={3} path={diagramPath} className="w-full rounded border border-slate-200 object-contain" />
          </section>
        )}

        <section className="mt-5 ml-auto max-w-sm break-inside-avoid">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt>Materials</dt>
              <dd>{currency(totals.materialWithMarkup)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>
                Installation labor
                {Number(quote.labor_days) > 0 &&
                  ` (${trimNumber(quote.labor_days)} day${Number(quote.labor_days) === 1 ? '' : 's'})`}
              </dt>
              <dd>{currency(totals.labor)}</dd>
            </div>
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
