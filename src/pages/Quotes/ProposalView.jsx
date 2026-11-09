import { BackIcon, PrintIcon } from '../../components/icons'
import { LogoMark } from '../../components/Logo'
import SignedImage from '../../components/SignedImage'
import { Button } from '../../components/ui'
import { COMPANY, DEFAULT_SCOPE_INTRO } from '../../lib/company'
import { currency, parseLocalDate, trimNumber } from '../../lib/format'
import { hasRealDescription } from '../Search/catalog'
import { groupByScope } from '../Openings/scope'
import { isService, quoteTitle, SERVICE_UNITS } from './quotes'

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
 * scope of work, one Total Job price (materials with markup, services and
 * install labor — none of it itemized), sign-off and the acceptance block.
 * Scope lists each door's work ("Furnish and install weatherstripping"…),
 * grouping doors with the same scope ("French Doors 1–8"). Products,
 * quantities and diagrams show only when "Show details" is on; no per-door
 * prices or unit costs ever do.
 */
export default function ProposalView({ quote, sections, totals, diagramsByOpening, onBack }) {
  const client = quote.job?.client
  const toName = client?.contact_name || client?.client_name || ''
  const toCompany = client?.contact_name && client.contact_name !== client.client_name ? client.client_name : null
  const re = addressLines(quote.job?.site_address)
  const date = formatDate(quote.proposal_date || (quote.created_at || '').slice(0, 10))
  const showDetails = Boolean(quote.show_details)

  // A door with no scope set yet falls back to what's on its lines
  const fallbackScope = (items) => [
    ...new Set(
      items.map((item) =>
        isService(item) ? item.description : `Furnish and install ${hasRealDescription(item) ? item.description : `Pemko ${item.sku}`}`,
      ),
    ),
  ]
  const doorSections = sections.filter((sec) => sec.opening && (sec.items.length || (sec.opening.scope_items || []).length))
  const doors = doorSections.map((sec) => ({
    ...sec.opening,
    scope_items: (sec.opening.scope_items || []).length ? sec.opening.scope_items : fallbackScope(sec.items),
    section: sec,
  }))
  // With details on, every door is listed on its own with its products
  const groups = showDetails
    ? doors.map((d) => ({ key: d.id, label: d.opening_name, items: d.scope_items, openings: [d] }))
    : groupByScope(doors)
  const generalItems = sections.find((sec) => !sec.opening)?.items || []

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
          {/* The general line repeats the per-door scope, so it shows only when written for this quote */}
          {(quote.scope_intro || !groups.length) && (
            <p className="mt-3 font-semibold">{quote.scope_intro || DEFAULT_SCOPE_INTRO}</p>
          )}

          <div className="mt-4 space-y-4">
            {groups.map((g) => (
              <div key={g.key} className="break-inside-avoid pl-4 sm:pl-6">
                <div className="font-semibold break-words">
                  {g.label}
                  {g.openings.length > 1 && <span className="font-normal text-slate-600"> ({g.openings.length} doors)</span>}
                </div>
                {g.items.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-6">
                    {g.items.map((line) => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
                {showDetails &&
                  g.openings.map((d) =>
                    d.section.items.length ? (
                      <ul key={d.id} className="mt-1 space-y-0.5 pl-6 text-sm text-slate-600">
                        {d.section.items.map((item) => (
                          <li key={item.id} className="break-words">
                            {qtyLabel(item) && <span className="mr-1">{qtyLabel(item)} ×</span>}
                            {isService(item) ? item.description : `Pemko ${item.sku}${hasRealDescription(item) ? ` — ${item.description}` : ''}`}
                          </li>
                        ))}
                      </ul>
                    ) : null,
                  )}
                {showDetails &&
                  g.openings.map((d) =>
                    diagramsByOpening[d.id] ? (
                      <SignedImage
                        key={`dia-${d.id}`}
                        layer={3}
                        path={diagramsByOpening[d.id]}
                        className="mt-2 w-full rounded border border-slate-200 object-contain"
                      />
                    ) : null,
                  )}
              </div>
            ))}
            {generalItems.length > 0 && (
              <div className="break-inside-avoid pl-4 sm:pl-6">
                {groups.length > 0 && <div className="font-semibold">Also included</div>}
                <ul className="mt-1 list-disc space-y-0.5 pl-6">
                  {fallbackScope(generalItems).map((line) => (
                    <li key={line} className="break-words">
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!groups.length && !generalItems.length && <p className="pl-6 text-sm text-slate-500 italic">No doors on this quote yet.</p>}
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
