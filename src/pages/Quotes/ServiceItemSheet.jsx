import { useState } from 'react'
import { Button, ErrorMessage, Field, inputClass, Sheet } from '../../components/ui'
import { SERVICE_SUGGESTIONS, SERVICE_UNITS } from './quotes'

/**
 * Add a labor / service line — work priced directly rather than from the
 * Pemko price book (e.g. installing customer-supplied material, refurbishing).
 * `onAdd(fields)` does the saving.
 */
export default function ServiceItemSheet({ openingName, onAdd, onClose }) {
  const [form, setForm] = useState({ description: '', quantity: '1', uom: 'ea', unit_price: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }))

  async function save(e) {
    e.preventDefault()
    const quantity = Number(form.quantity)
    const price = Number(form.unit_price)
    if (!form.description.trim()) return setError('Describe the work.')
    if (!(quantity > 0)) return setError('Enter a quantity greater than zero.')
    if (form.unit_price === '' || !Number.isFinite(price) || price < 0) return setError('Enter the price.')
    setSaving(true)
    setError(null)
    try {
      await onAdd({ description: form.description.trim(), quantity, uom: form.uom, unit_price: price })
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      title="Add labor / service"
      onClose={onClose}
      footer={
        <Button type="submit" form="service-form" className="w-full" disabled={saving}>
          {saving ? 'Adding…' : 'Add to quote'}
        </Button>
      }
    >
      <form id="service-form" onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">
          For work priced directly — installing customer-supplied material, refurbishing, adjustments. No markup is added.
          {openingName && (
            <>
              {' '}
              Adding to <strong>{openingName}</strong>.
            </>
          )}
        </p>
        <Field label="Work description" required>
          <input className={inputClass} value={form.description} onChange={set('description')} placeholder="Describe the work" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {SERVICE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => set('description')(s)}
              className={`min-h-11 rounded-full border px-3 text-left text-sm font-medium ${
                form.description === s ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <input className={inputClass} inputMode="decimal" value={form.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Unit">
            <select className={inputClass} value={form.uom} onChange={set('uom')}>
              {SERVICE_UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Price ($)" required>
          <input className={inputClass} inputMode="decimal" value={form.unit_price} onChange={set('unit_price')} placeholder="0.00" />
        </Field>
        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
