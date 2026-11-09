import { BackIcon, PrintIcon } from '../../components/icons'
import { LogoMark } from '../../components/Logo'
import SignedImage from '../../components/SignedImage'
import { Button } from '../../components/ui'
import { COMPANY, DEFAULT_SCOPE_INTRO } from '../../lib/company'
import { currency, parseLocalDate, trimNumber } from '../../lib/format'
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

/** "306 Apolena, Balboa Island, Newport Beach, CA" → one line per part, "City, CA" kept together. */
function addressLines(address) {
  if (!address) return []
  const parts = address.includes('\n') ? address.split('\n') : address.split(',')
  const lines = parts.map((p) => p.trim()).filter(Boolean)
  const out = []
  for (const line of lines) {
    if (/^[A-Z]{2}(\s+\d{5})?$/.test(line) && out.length) out[out.length - 1] += `, ${line}`
    else out.push(line)
  }
  return out
}

function formatDate(iso) {
  const d = iso ? parseLocalDate(iso) : new Date()
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/**
 * Client-facing proposal laid out like CWI's printed one: letterhead, TO / RE,
 * scope of work with one priced line per door (plus any general lines), total,
 * sign-off and the acceptance block. Each line's price includes its materials
 * with markup, its service lines and its share of the install labor — markup
 * and labor are never itemized. Materials, quantities and diagrams show only
 * when "Show details" is on; unit costs never do.
 */
export default function ProposalView({ quote, sections, totals, diagramsByOpening, onBack }) {
  const client = quote.job?.client
  const toName = client?.contact_name || client?.client_name || ''
  const toCompany = client?.contact_name && client.contact_name !== client.client_name ? client.client_name : null
  const re = addressLines(quote.job?.site_address)
  const date = formatDate(quote.proposal_date || (quote.created_at || '').slice(0, 10))
  const showDetails = Boolean(quote.show_details)

  // One line per opening; lines not tied to an opening are listed one by one
  const lines = []
  for (const section of sections) {
    if (!section.items.length) continue
    if (section.opening) {
      lines.push({ key: section.key, label: section.opening.opening_name, amount: linesSubtotal(quote, section.items), section })
    } else {
      for (const item of section.items) {
        lines.push({
          key: item.id,
          label: isService(item) ? item.description : `Pemko ${item.sku}${hasRealDescription(item) ? ` — ${item.description}` : ''}`,
          qty: qtyLabel(item),
          amount: linesSubtotal(quote, [item]),
        })
      }
    }
  }
  // Install labor is built into the line prices (in proportion to each line),
  // never shown as its own line; the markup is already in each line.
  if (totals.labor > 0) {
    const base = lines.reduce((sum, l) => sum + l.amount, 0)
    if (!lines.length || base <= 0) {
      lines.splice(0, lines.length, { key: 'install', label: 'Installation', amount: totals.labor })
    } else {
      let given = 0
      lines.forEach((line, i) => {
        const share =
          i === lines.length - 1
            ? Math.round((totals.labor - given) * 100) / 100
            : Math.round(((totals.labor * line.amount) / base) * 100) / 100
        given += share
        line.amount += share
      })
    }
  }

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

      <article className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-8 print:border-0 print:p-0">
        {/* Letterhead */}
        <header className="flex items-start gap-4 border-b-2 border-slate-900 pb-4">
          <LogoMark className="size-16 shrink-0 sm:size-20" />
          <div className="min-w-0 text-sm leading-snug">
            <div className="text-base font-bold tracking-wide uppercase">
              {COMPANY.name.replace(',', '')}
              <span className="ml-2 text-sm font-semibold normal-case">Lic# {COMPANY.license}</span>
            </div>
            <div>
              {COMPANY.street}, {COMPANY.cityStateZip}
            </div>
            {COMPANY.people.map((p, i) => (
              <div key={p.name} className="break-words">
                <span className="font-semibold">{p.name}</span> · Cell {p.cell}
                {i === COMPANY.people.length - 1 && <> · Accting/Fax {COMPANY.accountingFax}</>} · {p.email}
              </div>
            ))}
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xl font-bold tracking-wide uppercase">Weatherstrip Proposal</h1>
          <div className="font-bold">DATE: {date}</div>
        </div>

        {/* TO / RE */}
        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="flex gap-4">
            <div className="w-10 shrink-0 font-bold">TO:</div>
            <div className="min-w-0 font-semibold break-words">
              <div>{toName || '—'}</div>
              {toCompany && <div className="font-normal">{toCompany}</div>}
              {client?.phone && <div>{client.phone}</div>}
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 shrink-0 font-bold">RE:</div>
            <div className="min-w-0 font-semibold break-words">
              {re.length ? re.map((l) => <div key={l}>{l}</div>) : <div>{quote.job?.job_name || quoteTitle(quote)}</div>}
            </div>
          </div>
        </section>

        {/* Scope of work */}
        <section className="mt-8">
          <h2 className="font-bold uppercase">Scope of work:</h2>
          <p className="mt-3 font-semibold">{quote.scope_intro || DEFAULT_SCOPE_INTRO}</p>

          <div className="mt-4 space-y-3">
            {lines.map((line) => {
              const diagram = showDetails && line.section?.opening && diagramsByOpening[line.section.opening.id]
              return (
                <div key={line.key} className="break-inside-avoid">
                  <div className="flex items-baseline justify-between gap-4 pl-4 sm:pl-6">
                    <span className="min-w-0 font-semibold break-words">
                      {showDetails && line.qty ? `${line.qty} × ` : ''}
                      {line.label}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{currency(line.amount)}</span>
                  </div>
                  {showDetails && line.section && (
                    <ul className="mt-1 space-y-0.5 pl-8 text-sm text-slate-600 sm:pl-10">
                      {line.section.items.map((item) => (
                        <li key={item.id} className="break-words">
                          {qtyLabel(item) && <span className="mr-1">{qtyLabel(item)} ×</span>}
                          {isService(item) ? (
                            item.description
                          ) : (
                            <>
                              Pemko {item.sku}
                              {hasRealDescription(item) && ` — ${item.description}`}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {diagram && (
                    <SignedImage layer={3} path={diagram} className="mt-2 ml-8 w-[calc(100%-2rem)] rounded border border-slate-200 object-contain" />
                  )}
                </div>
              )
            })}
            {!lines.length && <p className="pl-6 text-sm text-slate-500 italic">No priced lines yet.</p>}
          </div>
        </section>

        <div className="mt-8 text-lg font-bold">Total Job: {currency(totals.total)}</div>

        {quote.notes && <p className="mt-5 text-sm whitespace-pre-wrap">{quote.notes}</p>}

        <div className="mt-10 font-semibold break-inside-avoid">
          <div>Thank You,</div>
          <div>{COMPANY.signer}</div>
          <div>{COMPANY.name.replace(',', '')}</div>
        </div>

        {/* Acceptance */}
        <footer className="mt-12 space-y-5 border-t border-slate-300 pt-5 text-base break-inside-avoid">
          <p>
            <span className="font-bold">{COMPANY.name}</span> is ordered to install the above. When signed by the
            purchaser, this becomes a contract in the amount of ${' '}
            <span className="inline-block w-32 border-b border-slate-700 align-bottom" /> to be paid upon completion of
            work.
          </p>
          <div className="grid gap-5 sm:grid-cols-[1fr_17rem]">
            <div className="flex items-end gap-2">
              <span className="shrink-0">By Purchaser:</span>
              <span className="h-6 flex-1 border-b border-slate-700" />
            </div>
            <div className="flex items-end gap-2">
              <span className="shrink-0">Date of Acceptance:</span>
              <span className="h-6 flex-1 border-b border-slate-700" />
            </div>
          </div>
        </footer>
      </article>
    </div>
  )
}
