import { TrashIcon } from '../../components/icons'
import NumberInput from '../../components/NumberInput'
import { Badge, Card, inputClass } from '../../components/ui'
import { currency, formatMeasurement, trimNumber } from '../../lib/format'
import { partLabel } from '../Drawing/measurementParts'
import { hasRealDescription } from '../Search/catalog'
import { isService, SERVICE_UNITS, toBillableFeet } from './quotes'

/**
 * One quote line — a Pemko product or a labor/service line — with editable
 * quantity and price. `measurements` (numeric, same opening) power
 * "Set qty from a measurement" for products sold by the foot.
 */
export default function QuoteItemRow({ item, measurements = [], onUpdate, onRemove }) {
  const service = isService(item)
  const unitLabel = service
    ? SERVICE_UNITS.find((u) => u.value === item.uom)?.label || item.uom || 'each'
    : item.uom && item.uom !== 'ea'
      ? item.uom
      : ''

  return (
    <Card className="p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {service ? (
            <>
              <Badge tone="blue">Labor / service</Badge>
              <input
                key={item.description ?? ''}
                className={`${inputClass} mt-2`}
                defaultValue={item.description ?? ''}
                onBlur={(e) => {
                  const text = e.target.value.trim()
                  if (text && text !== item.description) onUpdate({ description: text })
                  else e.target.value = item.description ?? ''
                }}
                aria-label="Work description"
              />
            </>
          ) : (
            <>
              <div className="font-bold break-all">{item.sku}</div>
              <div className="text-sm break-words text-slate-600">
                {hasRealDescription(item) ? item.description : 'No description on file'}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center text-slate-400"
          aria-label={`Remove ${item.sku || item.description}`}
        >
          <TrashIcon className="size-5" />
        </button>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <label className="w-24">
          <span className="block text-xs text-slate-500">Qty{unitLabel ? ` (${unitLabel})` : ''}</span>
          <NumberInput value={item.quantity} onCommit={(quantity) => onUpdate({ quantity })} />
        </label>
        <span className="pb-3 text-slate-400">×</span>
        <label className="w-28">
          <span className="block text-xs text-slate-500">{service ? 'Price' : 'Unit price'}</span>
          <NumberInput value={item.unit_price} onCommit={(unit_price) => onUpdate({ unit_price })} />
        </label>
        <div className="flex-1 pb-2.5 text-right font-semibold">{currency(item.quantity * item.unit_price)}</div>
      </div>

      {!service && item.uom === 'ft' && measurements.length > 0 && (
        <select
          className={`${inputClass} mt-2 text-sm`}
          value=""
          onChange={(e) => {
            const m = measurements.find((x) => x.id === e.target.value)
            if (m) onUpdate({ quantity: toBillableFeet(m) })
          }}
          aria-label="Set quantity from a measurement"
        >
          <option value="">Set qty from a measurement…</option>
          {measurements.map((m) => (
            <option key={m.id} value={m.id}>
              {partLabel(m.component)} {m.dimension}: {formatMeasurement(m.value_confirmed, m.unit)} → {trimNumber(toBillableFeet(m))} ft
            </option>
          ))}
        </select>
      )}
    </Card>
  )
}
