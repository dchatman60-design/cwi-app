import { LogoMark } from '../../components/Logo'
import { COMPANY } from '../../lib/company'
import { currency, formatMeasurement, trimNumber } from '../../lib/format'
import { hasValue, partLabel } from '../Drawing/measurementParts'
import { countOpenings, doorsIn, openingTypeLabel } from '../Openings/openings'
import { scopeLines } from '../Openings/scope'
import { hasRealDescription } from '../Search/catalog'
import { isService } from './quotes'

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
  const worked = sections.filter((s) => s.opening && (s.items.length || (s.opening.scope_items || []).length))
  const general = sections.find((s) => !s.opening)
  const counts = countOpenings(worked.map((s) => s.opening))
  const missing = new Set()
  for (const s of sections) for (const r of materialRows(s.items)) if (!r.material) missing.add(r.sku)

  const block = (sec) => {
    const o = sec.opening
    const rows = materialRows(sec.items)
    const services = sec.items.filter(isService).map((i) => i.description)
    const lines = o ? scopeLines(o) : []
    const n = o ? doorsIn(o) : 0
    return (
      <section key={sec.key} className="break-inside-avoid border-t border-slate-300 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <h3 className="font-bold">{o ? o.opening_name : 'General'}</h3>
          {o && (
            <span className="text-sm text-slate-600">
              {openingTypeLabel(o.opening_type)}
              {n > 1 && ` · ${n} doors`}
              {o.finish && ` · ${o.finish} finish`}
            </span>
          )}
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
        <div className="text-lg font-bold">Total Job: {currency(totals.total)}</div>
        <p className="mt-1 text-sm text-slate-600">
          Materials, installation and labor are included in the Total Job. Quantities are field measured and may be
          adjusted on site to fit.
        </p>
        {quote.total_note && <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{quote.total_note}</p>}
      </div>
    </article>
  )
}
