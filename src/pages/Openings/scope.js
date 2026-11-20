// Scope of work per door — the lines the customer proposal shows for it.

/** The four kinds of work most doors get — shown as checkboxes. */
export function mainScope(openingType) {
  const double = openingType === 'double_door'
  const sweeps = double ? 'door sweeps' : 'door sweep'
  return [
    { label: double ? 'Remove & rehang doors' : 'Remove & rehang door', line: double ? 'Remove and rehang doors' : 'Remove and rehang door' },
    { label: 'Weatherstrip', line: 'Furnish and install weatherstripping' },
    { label: 'Threshold', line: 'Furnish and install threshold' },
    { label: 'Sill cover', line: 'Furnish and install sill cover' },
    { label: openingType === 'double_door' ? 'Door sweeps' : 'Door sweep', line: `Furnish and install ${sweeps}` },
  ]
}

/** One-tap scope lines for a door: the main four, then less common work. */
export function scopePresets(openingType) {
  return [
    ...mainScope(openingType).map((m) => m.line),
    'Furnish and install interlocking weatherstripping',
    'Furnish and install door bottom',
    'Furnish and install astragal',
    'Furnish and install V-seal',
    'Adjust door and hardware',
  ]
}

/** Finishes offered per door; printed into the material lines on the proposal. */
export const FINISHES = ['Brass', 'Dark bronze', 'Mill aluminum', 'Clear anodized', 'Black', 'White']

// Lines that name a part the finish applies to, with optional type words
// before it: "Furnish and install interlocking weatherstripping"
const FINISHABLE = /^(furnish and install )((?:[\w-]+ )*?)(weatherstripping|thresholds?|sill covers?|door sweeps?|door bottoms?|astragals?)$/i

/**
 * "Furnish and install threshold" + Brass → "Furnish and install brass threshold";
 * "Furnish and install interlocking weatherstripping" → "… interlocking brass weatherstripping".
 */
export function withFinish(line, finish) {
  const f = (finish || '').trim()
  if (!f) return line
  const m = line.trim().match(FINISHABLE)
  return m ? `${m[1]}${m[2]}${f.toLowerCase()} ${m[3]}` : line
}

const PART_KEYS = [
  [/weatherstrip/i, 'weatherstrip'],
  [/threshold/i, 'threshold'],
  [/sill cover/i, 'sill cover'],
  [/sweep/i, 'sweep'],
  [/door bottom/i, 'door bottom'],
  [/astragal/i, 'astragal'],
]
/** Which part a "Furnish and install …" line is for, and its type words ("interlocking"). */
export function scopePart(line) {
  const m = (line || '').trim().match(FINISHABLE)
  if (!m) return null
  const key = PART_KEYS.find(([re]) => re.test(m[3]))?.[1]
  return key ? { key, variant: m[2].trim() } : null
}

/** A door's scope lines as the proposal prints them (finish applied, in order). */
export const scopeLines = (opening) =>
  sortScope((opening.scope_items || []).filter((s) => s && s.trim())).map((l) => withFinish(l, opening.finish))

const scopeKey = (items) => items.map((s) => s.trim().toLowerCase()).join('|')

// Proposal order: remove & rehang, then the furnish-and-install work, then anything typed in
const ORDER = [/remove and rehang/i, /weatherstrip/i, /threshold/i, /sill cover/i, /sweep/i, /door bottom/i, /astragal/i, /v-seal/i, /adjust/i]
const rank = (line) => {
  const i = ORDER.findIndex((re) => re.test(line))
  return i === -1 ? ORDER.length : i
}
export const sortScope = (items) => [...items].sort((a, b) => rank(a) - rank(b))

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
    const items = scopeLines(o)
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
