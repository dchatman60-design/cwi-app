// Door/window components Mike photographs in Layer 1. Keys are stored in
// measurements.component.
export const MEASUREMENT_PARTS = [
  { key: 'opening', label: 'Opening (overall)' },
  { key: 'head_jam', label: 'Head jamb' },
  { key: 'side_jam_left', label: 'Side jamb — left' },
  { key: 'side_jam_right', label: 'Side jamb — right' },
  { key: 'threshold', label: 'Threshold' },
  { key: 'doorstop', label: 'Doorstop' },
  { key: 'sweep', label: 'Sweep' },
  { key: 'site_condition', label: 'Site condition' },
]

export function partLabel(key) {
  return MEASUREMENT_PARTS.find((p) => p.key === key)?.label || key
}

/** Sort measurements into MEASUREMENT_PARTS order, unknown parts last. */
export function sortByPart(measurements) {
  const order = (key) => {
    const i = MEASUREMENT_PARTS.findIndex((p) => p.key === key)
    return i === -1 ? MEASUREMENT_PARTS.length : i
  }
  return [...measurements].sort(
    (a, b) => order(a.component) - order(b.component) || new Date(a.created_at) - new Date(b.created_at),
  )
}
