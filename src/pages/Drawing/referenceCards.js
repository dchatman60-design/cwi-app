// Reference objects of known size. Taped flat on the wall or frame beside
// the opening, they give a photo its real-world scale. Sizes in inches.
export const REFERENCE_CARDS = [
  {
    id: 'cwi',
    label: 'CWI card',
    long: 9.5,
    short: 7,
    hint: 'Use the centers of the 4 round targets.',
  },
  {
    id: 'letter',
    label: 'Letter paper',
    long: 11,
    short: 8.5,
    hint: 'Use the 4 corners of the sheet.',
  },
  {
    id: 'credit',
    label: 'Credit card',
    long: 3.37,
    short: 2.125,
    hint: 'Use where the straight edges would meet (the corners are rounded). Too small for whole doors — close-ups only.',
  },
  { id: 'custom', label: 'Custom', long: null, short: null, hint: 'Use the 4 corners of your reference.' },
  { id: 'none', label: 'No card', long: null, short: null, hint: '' },
]

const STORAGE_KEY = 'cwi:reference-card'

/** Full reference details from a saved { id, long, short } choice. */
export function resolveReference(choice) {
  const preset = REFERENCE_CARDS.find((r) => r.id === choice?.id) || REFERENCE_CARDS[0]
  if (preset.id !== 'custom') return preset
  const a = Number(choice.long) || null
  const b = Number(choice.short) || null
  return { ...preset, long: a && b ? Math.max(a, b) : a, short: a && b ? Math.min(a, b) : b }
}

export function loadReference() {
  try {
    return resolveReference(JSON.parse(localStorage.getItem(STORAGE_KEY)))
  } catch {
    return REFERENCE_CARDS[0]
  }
}

export function saveReference(ref) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: ref.id, long: ref.long, short: ref.short }))
  } catch {
    // storage unavailable — the choice just won't be remembered
  }
}

export function hasSize(ref) {
  return ref.long > 0 && ref.short > 0
}

/** Plain-language description for the AI prompt. */
export function describeReference(ref) {
  if (!hasSize(ref)) return null
  const name = { cwi: 'CWI measurement card (4 round targets)', letter: 'sheet of US letter paper', credit: 'credit card' }[ref.id] || 'reference card'
  const span = ref.id === 'cwi' ? 'target centers are' : 'it measures'
  return `A ${name} is taped flat in the photo for scale: its ${span} ${ref.long} in × ${ref.short} in.`
}
