import { inputClass } from '../../components/ui'
import { CUSTOM_PART, MEASUREMENT_PARTS, partInfo, UNITS } from './measurementParts'

const gcd = (a, b) => (b ? gcd(b, a % b) : a)
// 1/16" steps, reduced: 1/16, 1/8, 3/16, 1/4 …
const FRACTIONS = [
  { value: 0, label: '+ 0' },
  ...Array.from({ length: 15 }, (_, i) => {
    const n = i + 1
    const d = gcd(n, 16)
    return { value: n / 16, label: `${n / d}/${16 / d}` }
  }),
]

/**
 * The editable parts of one measurement: component (standard or custom),
 * dimension, value (whole/decimal + 1/16" fraction) + unit, and a type /
 * condition note. `value` holds { component, dimension, confirmed, fraction,
 * unit, note }; onChange gets a patch.
 */
export default function MeasurementFields({ value, onChange, idPrefix }) {
  const info = partInfo(value.component)
  const isCustom = !info

  return (
    <div className="space-y-2">
      <select
        className={inputClass}
        value={isCustom ? CUSTOM_PART : value.component}
        onChange={(e) => onChange({ component: e.target.value === CUSTOM_PART ? '' : e.target.value })}
        aria-label="Component"
      >
        {MEASUREMENT_PARTS.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
        <option value={CUSTOM_PART}>Custom component…</option>
      </select>
      {isCustom && (
        <input
          className={inputClass}
          placeholder="Custom component name (e.g. transom seal)"
          value={value.component}
          onChange={(e) => onChange({ component: e.target.value })}
          aria-label="Custom component name"
        />
      )}

      <input
        className={inputClass}
        placeholder="Dimension (e.g. width)"
        list={`${idPrefix}-dims`}
        value={value.dimension}
        onChange={(e) => onChange({ dimension: e.target.value })}
        aria-label="Dimension"
      />
      <datalist id={`${idPrefix}-dims`}>
        {(info?.dims || ['width', 'height', 'length', 'depth']).map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <input
            className={`${inputClass} text-lg font-semibold`}
            inputMode="decimal"
            placeholder={value.unit === 'in' ? 'Inches' : 'Value'}
            value={value.confirmed}
            onChange={(e) => onChange({ confirmed: e.target.value })}
            aria-label="Confirmed value"
          />
        </div>
        {value.unit === 'in' && (
          <div className="w-24 shrink-0">
            <select
              className={`${inputClass} text-lg font-semibold`}
              value={value.fraction || 0}
              onChange={(e) => onChange({ fraction: Number(e.target.value) })}
              aria-label="Fraction of an inch"
            >
              {FRACTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="w-20 shrink-0">
          <select className={inputClass} value={value.unit} onChange={(e) => onChange({ unit: e.target.value })} aria-label="Unit">
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      <input
        className={inputClass}
        placeholder="Type / condition / notes (optional)"
        value={value.note}
        onChange={(e) => onChange({ note: e.target.value })}
        aria-label="Type, condition or notes"
      />
      {info?.notes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {info.notes.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ note: value.note === n ? '' : n })}
              className={`min-h-11 rounded-full border px-3 text-sm font-medium ${
                value.note === n ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
