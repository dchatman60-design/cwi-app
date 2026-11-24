import { LogoMark } from '../../components/Logo'
import { COMPANY } from '../../lib/company'
import { currency, formatMeasurement, trimNumber } from '../../lib/format'
import { hasValue, partLabel } from '../Drawing/measurementParts'
import { countOpenings, doorsIn, openingTypeLabel } from '../Openings/openings'
import { scopeLines } from '../Openings/scope'
import { hasRealDescription } from '../Search/catalog'
import { useState } from 'react'
import { isService, linesSubtotal, quoteTotals } from './quotes'

// Finish words pulled out of a catalog description into their own column
const FINISH_RE =
  /^(dark bronze|bronze|white|black|clear( anodized)?|mill( finish)?|gold|brass|gray|grey|satin [a-z]+|aluminum|brown|beige|tan|almond|silver|champagne|ivory)(\s+pk)?$/i

/** "Door Seal, Dark Bronze" → { material: "Door seal", finish: "Dark bronze" }; never shows a brand or part number. */
export function describeMaterial(item) {
  if (!hasRealDescription(item)) return { material: null, finish: '' }
  const text = String(item.description)
    .replace(/\bpemko\b/gi, '')
    .replace(/\((?:for\s+)?[\w\s,./-]*\d[\w\s,./-]*\)/gi, '') // "(For 2173, 2113…)" model references
    .replace(item.sku ? new RegExp(`\\b${item.sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi') : /$^/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean)
  const finishes = parts.filter((p) => FINISH_RE.test(p))
  const rest = parts.filter((p) => !FINISH_RE.test(p))
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)
  return {
    material: cap(rest.join(', ')) || cap(text),
    finish: finishes.map((f) => cap(f.replace(/\s+pk$/i, ''))).join(', '),
  }
}

/** Product lines for one door, same part merged into one row. */
function materialRows(items) {
  const rows = new Map()
  for (const item of items) {
    if (isService(item)) continue
    const key = item.product_id || item.sku || item.description
    const row = rows.get(key)
    if (row) row.quantity += Number(item.quantity || 0)
    else rows.set(key, { ...describeMaterial(item), sku: item.sku, uom: item.uom || 'ea', quantity: Number(item.quantity || 0) })
  }
  return [...rows.values()]
}

/** Materials / labor / total for one door (per door too, for pairs and bi-folds). */
function PriceBox({ p, n }) {
  if (!p || !p.total) return <div className="font-bold">Included</div>
  const row = (label, v, strong) => (
    <div className={`flex justify-between gap-4 tabular-nums ${strong ? 'font-bold' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span>{currency(v)}</span>
    </div>
  )
  return (
    <div className="w-52 text-sm">
      {row('Materials', p.materials)}
      {row('Labor', p.labor)}
      <div className="mt-0.5 border-t border-slate-300 pt-0.5">{row(n > 1 ? `Total (${n} doors)` : 'Total', p.total, true)}</div>
      {n > 1 && <div className="text-right text-xs text-slate-600 tabular-nums">{currency(p.total / n)} per door</div>}
    </div>
  )
}

function Measurements({ list }) {
  const shown = (list || []).filter((m) => hasValue(m))
  if (!shown.length) return null
  return (
    <p className="mt-1 text-sm text-slate-600">
      {shown
        .map((m) => `${[partLabel(m.component), m.dimension].filter(Boolean).join(' ')} ${formatMeasurement(m.value_confirmed, m.unit)}`)
        .join(' · ')}
    </p>
  )
}

/**
 * Contractor cut sheet: every door with its field measurements, scope and the
 * materials going on it (description, finish, quantity). No brand names, part
 * numbers, unit prices, markup or labor — just the one Total Job.
 */
export default function CutSheet({ quote, sections, totals, toName, toCompany, re, date }) {
  const worked = sections.filter(
    (s) => s.opening && (s.items.length || (!quote.items_only && (s.opening.scope_items || []).length)),
  )
  const general = sections.find((s) => !s.opening)
  const counts = countOpenings(worked.map((s) => s.opening))
  const [showPrices, setShowPrices] = useState(true)

  // Price per door: its lines with markup plus its share of install labor (in
  // proportion to its lines), so the door prices add up exactly to Total Job.
  const priced = [...worked, ...(general && general.items.length ? [general] : [])]
  const subs = priced.map((s) => linesSubtotal(quote, s.items))
  const base = subs.reduce((a, b) => a + b, 0)
  const labor = Number(totals.labor || 0)
  const prices = new Map()
  let given = 0
  const lastWithLines = subs.reduce((last, v, i) => (v > 0 ? i : last), -1)
  priced.forEach((s, i) => {
    let share = 0
    if (labor && base > 0 && subs[i] > 0) {
      share = i === lastWithLines ? Math.round((labor - given) * 100) / 100 : Math.round(((labor * subs[i]) / base) * 100) / 100
      given += share
    }
    const t = quoteTotals(quote, s.items)
    const materials = Math.round(t.materialWithMarkup * 100) / 100
    const total = Math.round((subs[i] + share) * 100) / 100
    // Labor = the door's labor/service lines plus its share of install days
    prices.set(s.key, { materials, labor: Math.round((total - materials) * 100) / 100, total })
  })
  const sum = (k) => Math.round([...prices.values()].reduce((a, p) => a + p[k], 0) * 100) / 100
  // If nothing has lines, the labor has nowhere to go — say so rather than show $0 doors
  const pricesComplete = !labor || base > 0

  const missing = new Set()
  for (const s of sections) for (const r of materialRows(s.items)) if (!r.material) missing.add(r.sku)

  const block = (sec) => {
    const o = sec.opening
    const rows = materialRows(sec.items)
    const services = sec.items.filter(isService).map((i) => i.description)
    const lines = o && !quote.items_only ? scopeLines(o) : []
    const n = o ? doorsIn(o) : 0
    return (
      <section key={sec.key} className="break-inside-avoid border-t border-slate-300 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <div className="min-w-0">
            <h3 className="font-bold">{o ? o.opening_name : 'General'}</h3>
            {o && (
              <div className="text-sm text-slate-600">
                {openingTypeLabel(o.opening_type)}
                {n > 1 && ` · ${n} doors`}
                {o.finish && ` · ${o.finish} finish`}
              </div>
            )}
          </div>
          {showPrices && pricesComplete && <PriceBox p={prices.get(sec.key)} n={n} />}
        </div>
        <Measurements list={sec.measurements} />
        {(lines.length > 0 || services.length > 0) && (
          <ul className="mt-1 list-disc pl-5 text-sm">
            {[...new Set([...lines, ...services])].map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
        {rows.length > 0 && (
          <table className="mt-2 w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col className="w-32" />
              <col className="w-20" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <th className="py-1 font-semibold">Material</th>
                <th className="py-1 font-semibold">Finish</th>
                <th className="py-1 text-right font-semibold">Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 align-top">
                  <td className="py-1 pr-2 break-words">
                    {r.material || <span className="text-amber-700 italic">Description needed</span>}
                  </td>
                  <td className="py-1 pr-2">{r.finish}</td>
                  <td className="py-1 text-right tabular-nums">
                    {trimNumber(r.quantity)} {r.uom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    )
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-8 print:border-0 print:p-0 print:text-[13px]">
      <label className="mb-4 flex min-h-11 items-center gap-3 print:hidden">
        <input type="checkbox" className="size-5 accent-blue-700" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
        <span>
          <span className="font-medium">Show price per door</span>
          <span className="block text-xs text-slate-500">
            Materials and labor for each door, with the door total. They add up to Total Job.
          </span>
        </span>
      </label>
      {showPrices && !pricesComplete && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden">
          No door has priced lines yet, so labor can't be split across doors. Add products or labor lines to the doors.
        </div>
      )}
      {missing.size > 0 && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 print:hidden">
          {missing.size === 1 ? 'One part has' : `${missing.size} parts have`} no description yet ({[...missing].join(', ')}), so{' '}
          {missing.size === 1 ? 'it shows' : 'they show'} as &ldquo;Description needed&rdquo;. Add one from the quote line before
          sending. Part numbers never print here.
        </div>
      )}
      <header className="flex items-start gap-4 border-b-2 border-slate-900 pb-4">
        <LogoMark className="size-14 shrink-0" />
        <div className="min-w-0 flex-1 text-sm leading-snug">
          <div className="text-base font-bold tracking-wide uppercase">{COMPANY.name.replace(',', '')}</div>
          <div>{COMPANY.street}</div>
          <div>{COMPANY.cityStateZip}</div>
          <div>Lic. #{COMPANY.license}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tracking-wide uppercase">Materials cut sheet</div>
          <div className="text-sm">{date}</div>
        </div>
      </header>

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">To</div>
          <div className="font-semibold">{toName}</div>
          {toCompany && <div>{toCompany}</div>}
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase">Job</div>
          <div className="font-semibold">{quote.job?.job_name}</div>
          {re.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 className="font-bold uppercase">Openings and materials</h2>
        {counts.openings > 0 && (
          <span className="font-semibold">
            {counts.openings} opening{counts.openings === 1 ? '' : 's'} · {counts.doors} door{counts.doors === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="mt-2 space-y-3">
        {worked.map(block)}
        {general && general.items.length > 0 && block(general)}
        {!worked.length && <p className="text-sm text-slate-500 italic">No doors on this quote yet.</p>}
      </div>

      <div className="mt-6 border-t-2 border-slate-900 pt-3 print:mt-4">
        {showPrices && pricesComplete && (
          <div className="mb-1 max-w-xs text-sm">
            <div className="flex justify-between tabular-nums">
              <span>Materials</span>
              <span>{currency(sum('materials'))}</span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>Labor</span>
              <span>{currency(sum('labor'))}</span>
            </div>
          </div>
        )}
        <div className="text-lg font-bold">Total Job: {currency(totals.total)}</div>
        <p className="mt-1 text-sm text-slate-600">
          {showPrices && pricesComplete
            ? 'Door totals include materials and labor; together they make up the Total Job.'
            : 'Materials, installation and labor are included in the Total Job.'}{' '}
          Quantities are field measured and may be adjusted on site to fit.
        </p>
        {quote.total_note && <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{quote.total_note}</p>}
      </div>
    </article>
  )
}
