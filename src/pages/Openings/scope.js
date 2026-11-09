// Scope of work per door — the lines the customer proposal shows for it.

/** One-tap scope lines for a door. Double doors get the plural sweeps. */
export function scopePresets(openingType) {
  const sweeps = openingType === 'double_door' ? 'door sweeps' : 'door sweep'
  return [
    'Furnish and install weatherstripping',
    `Furnish and install ${sweeps}`,
    'Furnish and install threshold',
    'Furnish and install sill cover',
    'Furnish and install door bottom',
    'Furnish and install astragal',
    'Furnish and install V-seal',
    'Adjust door and hardware',
  ]
}

const scopeKey = (items) => items.map((s) => s.trim().toLowerCase()).join('|')

/** "French Door 1…8" → "French Doors 1–8"; otherwise the names, comma-separated. */
export function groupLabel(names) {
  if (names.length === 1) return names[0]
  const parts = names.map((n) => n.match(/^(.*?)\s*(\d+)$/))
  if (parts.every(Boolean)) {
    const base = parts[0][1]
    const nums = parts.map((p) => Number(p[2])).sort((a, b) => a - b)
    const sameBase = parts.every((p) => p[1].toLowerCase() === base.toLowerCase())
    const consecutive = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
    if (sameBase && consecutive) {
      const plural = /s$/i.test(base) ? base : `${base}s`
      return `${plural} ${nums[0]}–${nums.at(-1)}`
    }
  }
  return names.join(', ')
}

/**
 * Doors grouped for the proposal: doors with the same scope lines share one
 * heading, in the order they first appear. Doors with no scope set yet each
 * get their own heading with no lines.
 */
export function groupByScope(openings) {
  const groups = []
  const byKey = new Map()
  for (const o of openings) {
    const items = (o.scope_items || []).filter((s) => s && s.trim())
    if (!items.length) {
      groups.push({ key: o.id, openings: [o], items: [] })
      continue
    }
    const key = scopeKey(items)
    if (!byKey.has(key)) {
      const g = { key, openings: [], items }
      byKey.set(key, g)
      groups.push(g)
    }
    byKey.get(key).openings.push(o)
  }
  return groups.map((g) => ({ ...g, label: groupLabel(g.openings.map((o) => o.opening_name)) }))
}
