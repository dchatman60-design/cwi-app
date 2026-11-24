import { BackIcon, PrintIcon } from '../../components/icons'
import { LogoMark } from '../../components/Logo'
import SignedImage from '../../components/SignedImage'
import { useRef, useState } from 'react'
import { Button, Segmented } from '../../components/ui'
import { COMPANY, DEFAULT_SCOPE_INTRO, DEFAULT_UNWORKED_NOTE } from '../../lib/company'
import { currency, parseLocalDate, trimNumber } from '../../lib/format'
import { elementToPdf, printUnsupported, sharePdf } from '../../lib/pdf'
import { toast } from '../../lib/toast'
import { countOpenings, doorsIn } from '../Openings/openings'
import { groupByScope, scopeLines } from '../Openings/scope'
import CutSheet, { describeMaterial } from './CutSheet'
import InternalBreakdown from './InternalBreakdown'
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

/** A product as the customer sees it: plain description and finish — never the brand or part number. */
function materialText(item) {
  const { material, finish } = describeMaterial(item)
  return [material || 'Weatherstripping material', finish].filter(Boolean).join(', ')
}

function formatDate(iso) {
  const d = iso ? parseLocalDate(iso) : new Date()
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

/**
 * Client-facing proposal laid out like CWI's printed one: letterhead, TO / RE,
 * scope of work, one Total Job price (materials with markup, services and
 * install labor — none of it itemized), payment terms (50% deposit on
 * signing, 50% on completion), sign-off and the acceptance block.
 * Scope lists each door's work ("Furnish and install weatherstripping"…),
 * grouping doors with the same scope ("French Doors 1–8"). Products,
 * quantities and diagrams show only when "Show details" is on; no per-door
 * prices or unit costs ever do.
 */
const VIEWS = [
  { value: 'customer', label: 'Customer proposal' },
  { value: 'cutsheet', label: 'Cut sheet' },
  { value: 'internal', label: 'Internal breakdown' },
]

export default function ProposalView({ quote, sections, totals, diagramsByOpening, onBack }) {
  const [view, setView] = useState('customer')
  const docRef = useRef(null)
  // iPhone home-screen app can't print: build the PDF, then a second tap opens the share sheet
  const [pdf, setPdf] = useState({ status: 'idle', blob: null, view: null })
  const pdfName = `${quoteTitle(quote).replace(/[\\/:*?"<>|]+/g, '-')} - ${VIEWS.find((v) => v.value === view)?.label}.pdf`
  const ready = pdf.status === 'ready' && pdf.view === view

  async function handlePrint() {
    if (!printUnsupported()) return window.print()
    if (ready) return sharePdf(pdf.blob, pdfName)
    const el = docRef.current?.querySelector('article')
    if (!el) return
    setPdf({ status: 'building', blob: null, view })
    try {
      const blob = await elementToPdf(el)
      setPdf({ status: 'ready', blob, view })
    } catch (err) {
      setPdf({ status: 'idle', blob: null, view: null })
      toast(err.message || "Couldn't make the PDF", 'error')
    }
  }
  const printLabel = !printUnsupported()
    ? 'Print / Save PDF'
    : pdf.status === 'building'
      ? 'Making PDF…'
      : ready
        ? 'Share / save PDF'
        : 'Make PDF'
  const client = quote.job?.client
  const toName = client?.contact_name || client?.client_name || ''
  const toCompany = client?.contact_name && client.contact_name !== client.client_name ? client.client_name : null
  const re = addressLines(quote.job?.site_address)
  const date = formatDate(quote.proposal_date || (quote.created_at || '').slice(0, 10))
  const showDetails = Boolean(quote.show_details)
  // 50% on signing, 50% on completion — the balance takes any odd cent
  const deposit = Math.round(Number(totals.total || 0) * 50) / 100
  const balance = Math.round((Number(totals.total || 0) - deposit) * 100) / 100

  // A door with no scope set yet falls back to what's on its lines
  const fallbackScope = (items) => [
    ...new Set(
      items.map((item) =>
        isService(item) ? item.description : `Furnish and install ${materialText(item).toLowerCase()}`,
      ),
    ),
  ]
  // Option / add-on quotes: only the doors with lines here, described by those lines
  const itemsOnly = Boolean(quote.items_only)
  const doorSections = sections.filter(
    (sec) => sec.opening && (sec.items.length || (!itemsOnly && (sec.opening.scope_items || []).length)),
  )
  const doors = doorSections.map((sec) => ({
    ...sec.opening,
    finish: itemsOnly ? null : sec.opening.finish,
    scope_items:
      !itemsOnly && (sec.opening.scope_items || []).length ? sec.opening.scope_items : fallbackScope(sec.items),
    section: sec,
  }))
  // With details on, every door is listed on its own with its products
  const toGroups = (list) =>
    showDetails
      ? list.map((d) => ({ key: d.id, label: d.opening_name, items: scopeLines(d), openings: [d] }))
      : groupByScope(list)
  // Doors and windows print as separate sections (headed only when both are present)
  const doorList = doors.filter((d) => d.opening_type !== 'window')
  const windowList = doors.filter((d) => d.opening_type === 'window')
  const scopeSections = [
    { key: 'doors', title: 'Doors', groups: toGroups(doorList) },
    { key: 'windows', title: 'Windows', groups: toGroups(windowList) },
  ].filter((sec) => sec.groups.length)
  const groups = scopeSections.flatMap((sec) => sec.groups)
  // Openings with no work this time — listed (with a recommendation) when the quote asks for it
  const unworked = quote.show_unworked
    ? sections
        .filter((sec) => sec.opening && !sec.items.length && !(sec.opening.scope_items || []).length)
        .map((sec) => sec.opening)
    : []
  const isOutOfScope = (o) => /out of scope/i.test(o.notes || '')
  const recommended = unworked.filter((o) => !isOutOfScope(o))
  const outOfScope = unworked.filter(isOutOfScope)
  const unworkedSections = [
    { key: 'doors', title: 'Doors', list: recommended.filter((o) => o.opening_type !== 'window') },
    { key: 'windows', title: 'Windows', list: recommended.filter((o) => o.opening_type === 'window') },
  ].filter((sec) => sec.list.length)
  const headed = scopeSections.length > 1
  const generalItems = sections.find((sec) => !sec.opening)?.items || []
  const counts = countOpenings(doors)
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  // "(3 doors)" — or "(5 openings · 10 doors)" when French doors make them differ
  const groupCount = (g) => {
    const n = g.openings.length
    const d = g.openings.reduce((sum, o) => sum + doorsIn(o), 0)
    if (n <= 1 && d <= 1) return null
    return d && d !== n ? `${plural(n, 'opening')} · ${plural(d, 'door')}` : plural(d || n, d ? 'door' : 'opening')
  }

  return (
    <div className="px-4 pt-4 print:p-0">
      <div className="mb-4 flex gap-3 print:hidden">
        <Button variant="secondary" onClick={onBack}>
          <BackIcon className="size-5" /> Edit quote
        </Button>
        <Button className="flex-1" onClick={handlePrint} disabled={pdf.status === 'building'}>
          <PrintIcon className="size-5" /> {printLabel}
        </Button>
      </div>
      <div className="mb-4 print:hidden">
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </div>

      <div ref={docRef}>
      {view === 'cutsheet' ? (
        <CutSheet quote={quote} sections={sections} totals={totals} toName={toName} toCompany={toCompany} re={re} date={date} />
      ) : view === 'internal' ? (
        <InternalBreakdown quote={quote} sections={sections} totals={totals} deposit={deposit} balance={balance} />
      ) : (

      <article className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-8 print:border-0 print:p-0 print:text-[14px]">
        {/* Letterhead */}
        <header className="flex items-start gap-4 border-b-2 border-slate-900 pb-4">
          <LogoMark className="size-16 shrink-0 sm:size-20 print:size-16" />
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

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2 print:mt-3">
          <h1 className="text-xl font-bold tracking-wide uppercase">Weatherstrip Proposal</h1>
          <div className="font-bold">DATE: {date}</div>
        </div>

        {/* TO / RE */}
        <section className="mt-5 grid gap-4 sm:grid-cols-2 print:mt-3">
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
        <section className="mt-8 print:mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 className="font-bold uppercase">Scope of work:</h2>
            {counts.openings > 0 && (
              <div className="font-semibold">
                {plural(counts.openings, 'opening')} · {plural(counts.doors, 'door')}
              </div>
            )}
          </div>
          {/* The general line repeats the per-door scope, so it shows only when written for this quote */}
          {(quote.scope_intro || !groups.length) && (
            <p className="mt-3 font-semibold">{quote.scope_intro || DEFAULT_SCOPE_INTRO}</p>
          )}

          <div className="mt-4 space-y-4 print:mt-2 print:space-y-2">
            {scopeSections.map((sec) => (
              <div key={sec.key} className="space-y-4 print:space-y-2">
                {headed && (
                  <h3 className="border-b border-slate-300 pb-0.5 text-sm font-bold tracking-wide uppercase">{sec.title}</h3>
                )}
                {sec.groups.map((g) => (
                  <div key={g.key} className="break-inside-avoid pl-4 sm:pl-6">
                    <div className="font-semibold break-words">
                      {g.label}
                      {groupCount(g) && <span className="font-normal text-slate-600"> ({groupCount(g)})</span>}
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
                                {isService(item) ? item.description : materialText(item)}
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

        {unworked.length > 0 && (
          <section className="mt-6 print:mt-4">
            <h2 className="font-bold uppercase">Not included at this time:</h2>
            {recommended.length > 0 && <p className="mt-2">{quote.unworked_note || DEFAULT_UNWORKED_NOTE}</p>}
            <div className="mt-3 space-y-3 pl-4 sm:pl-6 print:mt-2 print:space-y-2">
              {unworkedSections.map((sec) => (
                <div key={sec.key} className="break-inside-avoid">
                  {unworkedSections.length > 1 && <div className="font-semibold">{sec.title}</div>}
                  <ul className="mt-1 list-disc gap-x-8 pl-6 sm:columns-2 print:columns-2 print:text-[13px]">
                    {sec.list.map((o) => (
                      <li key={o.id} className="break-inside-avoid break-words">
                        {o.opening_name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {outOfScope.length > 0 && (
                <div className="break-inside-avoid">
                  <div className="font-semibold">Out of scope</div>
                  <ul className="mt-1 list-disc pl-6">
                    {outOfScope.map((o) => (
                      <li key={o.id} className="break-words">
                        {o.opening_name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        <div className="mt-8 text-lg font-bold print:mt-4">Total Job: {currency(totals.total)}</div>
        {quote.total_note && (
          <p className="mt-1 max-w-2xl text-sm whitespace-pre-line text-slate-700 print:text-[13px]">{quote.total_note}</p>
        )}

        {/* Payment terms: half on signing, half on completion */}
        <section className="mt-4 max-w-md break-inside-avoid print:mt-2">
          <h2 className="font-bold uppercase">Payment terms:</h2>
          <dl className="mt-2 space-y-1">
            <div className="flex justify-between gap-4">
              <dt>50% deposit due upon signing</dt>
              <dd className="font-semibold tabular-nums">{currency(deposit)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>50% balance due upon completion of work</dt>
              <dd className="font-semibold tabular-nums">{currency(balance)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm">
            Payment accepted by <span className="font-semibold">Zelle</span> or{' '}
            <span className="font-semibold">check</span> payable to {COMPANY.name}
            {COMPANY.zelle && <> Zelle to {COMPANY.zelle}.</>}
          </p>
        </section>

        {quote.notes && <p className="mt-5 text-sm whitespace-pre-wrap">{quote.notes}</p>}

        <div className="mt-10 font-semibold break-inside-avoid print:mt-5">
          <div>Thank You,</div>
          <div>{COMPANY.signer}</div>
          <div>{COMPANY.name.replace(',', '')}</div>
        </div>

        {/* Acceptance */}
        <footer className="mt-12 space-y-5 border-t border-slate-300 pt-5 text-base break-inside-avoid print:mt-5 print:space-y-3 print:pt-3 print:text-[14px]">
          <p>
            <span className="font-bold">{COMPANY.name}</span> is ordered to install the above. When signed by the
            purchaser, this becomes a contract in the amount of{' '}
            <span className="inline-block min-w-32 border-b border-slate-700 px-1 text-center font-semibold">
              {currency(totals.total)}
            </span>
            , to be paid 50% upon signing ({currency(deposit)}) and the remaining 50% upon completion of work (
            {currency(balance)}).
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
          <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
            <span className="shrink-0">Deposit paid by:</span>
            <span className="flex items-center gap-2">
              <span className="inline-block size-4 border border-slate-700" aria-hidden="true" /> Zelle
            </span>
            <span className="flex min-w-0 flex-1 items-end gap-2">
              <span className="inline-block size-4 shrink-0 border border-slate-700" aria-hidden="true" />
              <span className="shrink-0">Check #</span>
              <span className="h-5 min-w-24 flex-1 border-b border-slate-700" />
            </span>
          </div>
        </footer>
      </article>
      )}
      </div>
    </div>
  )
}
