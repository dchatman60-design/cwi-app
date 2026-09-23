import { parseMeasurementText } from '../../lib/format'

// Standard door/window components from Mike's field takeoffs. Keys are
// stored in measurements.component; any other text there is a custom
// component typed in the field.
//
// `dims` and `notes` are quick-pick suggestions — any text is allowed.
export const MEASUREMENT_PARTS = [
  { key: 'opening', label: 'Opening (overall)', dims: ['width', 'height'], notes: [] },
  { key: 'head_jam', label: 'Head jamb', dims: ['width', 'depth'], notes: [] },
  { key: 'side_jam_left', label: 'Side jamb — left', dims: ['height', 'depth'], notes: [] },
  { key: 'side_jam_right', label: 'Side jamb — right', dims: ['height', 'depth'], notes: [] },
  { key: 'doorstop', label: 'Doorstop', dims: ['length', 'width', 'depth'], notes: ['Good', 'Worn', 'Missing'] },
  {
    key: 'seal',
    label: 'Seal (weatherstrip)',
    dims: ['length'],
    notes: ['Silicone', 'Vinyl', 'Neoprene', 'Brush', 'Good', 'Worn', 'Missing'],
  },
  { key: 'threshold', label: 'Threshold', dims: ['width', 'rise', 'depth'], notes: ['Saddle', 'Water return', 'Custom / specialty'] },
  { key: 'sweep', label: 'Door sweep', dims: ['width'], notes: ['Manual', 'Automatic'] },
  { key: 'door_bottom', label: 'Door bottom', dims: ['width'], notes: ['Automatic', 'Manual'] },
  { key: 'surface_bolts', label: 'Surface bolts', dims: [], notes: ['Good', 'Sticking — adjust', 'Replace'] },
  { key: 't_astragal', label: 'T-astragal', dims: ['height'], notes: [] },
  { key: 'v_seal', label: 'V-slide / V-silicone seal', dims: ['length'], notes: ['V-slide', 'V-silicone', 'Good', 'Worn'] },
  { key: 'window', label: 'Window', dims: ['width', 'height'], notes: ['Casement', 'Double hung', 'French pair', 'Bifold'] },
  { key: 'site_condition', label: 'Site condition', dims: [], notes: [] },
]

export const UNITS = ['in', 'ft', 'mm', 'cm']

/** Select-box value meaning "type your own component name". */
export const CUSTOM_PART = '__custom__'

export function partInfo(key) {
  return MEASUREMENT_PARTS.find((p) => p.key === key) || null
}

/** Display name: the standard label, or the custom name as typed. */
export function partLabel(key) {
  return partInfo(key)?.label || key || 'Custom component'
}

/** Sort measurements into MEASUREMENT_PARTS order, custom components last. */
export function sortByPart(measurements) {
  const order = (key) => {
    const i = MEASUREMENT_PARTS.findIndex((p) => p.key === key)
    return i === -1 ? MEASUREMENT_PARTS.length : i
  }
  return [...measurements].sort(
    (a, b) => order(a.component) - order(b.component) || new Date(a.created_at) - new Date(b.created_at),
  )
}

export const hasValue = (m) => m.value_confirmed !== null && m.value_confirmed !== undefined

/**
 * Split a value into the whole-number box and the 1/16" fraction picker.
 * Values that aren't whole 16ths (e.g. an AI read of 35.3) stay as decimals.
 */
export function splitValue(value, unit = 'in') {
  if (value === null || value === undefined || value === '') return { confirmed: '', fraction: 0 }
  const n = Number(value)
  const whole = Math.trunc(n)
  const sixteenths = (n - whole) * 16
  if (unit === 'in' && Math.abs(sixteenths - Math.round(sixteenths)) < 1e-6) {
    const fraction = Math.round(sixteenths) / 16
    return { confirmed: whole || !fraction ? String(whole) : '', fraction }
  }
  return { confirmed: String(Math.round(n * 1000) / 1000), fraction: 0 }
}

/** Validate and convert fields to a measurements row (without job/photo). */
export function toMeasurementRow(fields) {
  const component = fields.component.trim()
  const note = fields.note.trim()
  const typed = parseMeasurementText(fields.confirmed)
  const fraction = fields.unit === 'in' ? fields.fraction || 0 : 0
  if (!component) return { error: 'Choose a component or type a custom one.' }
  if (Number.isNaN(typed)) return { error: `"${fields.confirmed}" isn't a number. Use digits, or pick the fraction.` }
  const value = typed === null ? (fraction ? fraction : null) : typed + fraction
  if (value === null && !note) return { error: 'Enter a value or a type / condition note.' }

  const row = {
    component,
    dimension: fields.dimension.trim() || null,
    value_confirmed: value,
    unit: fields.unit,
  }
  // Only send `note` when used, so saves still work before the notes column exists
  if (note) row.note = note
  return { row }
}
