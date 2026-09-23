import { useState } from 'react'
import { REFERENCE_CARDS, resolveReference } from './referenceCards'

/** Choose the reference card in the photo (and its size, for "Custom"). */
export default function ReferencePicker({ value, onChange, allowNone = false, dark = false }) {
  const [custom, setCustom] = useState(() => ({
    long: value.id === 'custom' && value.long ? String(value.long) : '',
    short: value.id === 'custom' && value.short ? String(value.short) : '',
  }))
  const options = REFERENCE_CARDS.filter((r) => allowNone || r.id !== 'none')

  const chipClass = (selected) =>
    dark
      ? selected
        ? 'border-white bg-white text-slate-900'
        : 'border-white/20 bg-white/10 text-slate-200'
      : selected
        ? 'border-blue-700 bg-blue-700 text-white'
        : 'border-slate-300 bg-white text-slate-700'
  const inputClass = dark
    ? 'min-h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-white placeholder:text-slate-400'
    : 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3'

  function setCustomSide(side, text) {
    const next = { ...custom, [side]: text }
    setCustom(next)
    onChange(resolveReference({ id: 'custom', ...next }))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {options.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onChange(resolveReference(r.id === 'custom' ? { id: 'custom', ...custom } : { id: r.id }))}
            className={`min-h-10 rounded-full border px-3 text-sm font-medium ${chipClass(value.id === r.id)}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {value.id === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            inputMode="decimal"
            placeholder="Long side (in)"
            aria-label="Long side in inches"
            className={inputClass}
            value={custom.long}
            onChange={(e) => setCustomSide('long', e.target.value)}
          />
          <input
            inputMode="decimal"
            placeholder="Short side (in)"
            aria-label="Short side in inches"
            className={inputClass}
            value={custom.short}
            onChange={(e) => setCustomSide('short', e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
