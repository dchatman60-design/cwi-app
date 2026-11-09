// Openings: each door or window on a job (Engagement Guide, Step 2).

import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'

export const OPENING_TYPES = [
  { value: 'single_door', label: 'Single door' },
  { value: 'double_door', label: 'Double door' },
  { value: 'window', label: 'Window' },
  { value: 'other', label: 'Other' },
]

export const OPENING_NAME_SUGGESTIONS = [
  'French doors',
  'Front entry',
  'Dutch entry door',
  'Rear entry Dutch door',
  'Side door',
  'Back door',
  'House to garage door',
  'Garage to exterior door',
  'Patio door',
  'Sliding door',
  'Kitchen window',
  'Bedroom window',
]

/** Best-guess type from a name: pairs / French doors are double, windows are windows. */
export function guessOpeningType(name) {
  const n = (name || '').toLowerCase()
  if (/french|pair|double|astragal/.test(n)) return 'double_door'
  if (/window|sidelite|transom/.test(n)) return 'window'
  if (/door|entry|dutch|garage|gate|suite|unit/.test(n)) return 'single_door'
  return null
}

/**
 * Opening names for the pick lists: the ones the team has already used on
 * jobs (most-used first, numbered ones like "Pair 3" folded into "Pair"),
 * then the standard suggestions.
 */
export function useOpeningNameSuggestions() {
  const { data } = useQuery('opening-name-suggestions', async () => {
    const rows = must(await supabase.from('openings').select('opening_name').limit(2000))
    const counts = new Map()
    for (const { opening_name } of rows) {
      const name = (opening_name || '').trim().replace(/\s+\d+$/, '')
      if (!name) continue
      const key = name.toLowerCase()
      const entry = counts.get(key) || { name, n: 0 }
      entry.n += 1
      counts.set(key, entry)
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).map((e) => e.name)
  })
  const seen = new Set()
  return [...(data || []), ...OPENING_NAME_SUGGESTIONS].filter((n) => {
    const key = n.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function openingTypeLabel(type) {
  return OPENING_TYPES.find((t) => t.value === type)?.label || 'Opening'
}

/**
 * Move measurements, photos and quote lines to an opening (toOpeningId null =
 * General). A measurement photo also follows its measurements once all of
 * them are in the new opening, so the opening's photo library stays with its
 * numbers.
 */
export async function moveToOpening({ jobId, toOpeningId, measurementIds = [], photoIds = [], itemIds = [] }) {
  const patch = { opening_id: toOpeningId }
  if (measurementIds.length) {
    const moved = must(await supabase.from('measurements').update(patch).in('id', measurementIds).select('photo_url'))
    const paths = [...new Set(moved.map((m) => m.photo_url).filter(Boolean))]
    if (paths.length) {
      const siblings = must(
        await supabase.from('measurements').select('photo_url, opening_id').eq('job_id', jobId).in('photo_url', paths),
      )
      const follow = paths.filter((p) => siblings.every((m) => m.photo_url !== p || m.opening_id === toOpeningId))
      if (follow.length) {
        must(await supabase.from('job_photos').update(patch).eq('job_id', jobId).eq('layer', 1).in('storage_path', follow))
      }
    }
  }
  if (photoIds.length) must(await supabase.from('job_photos').update(patch).in('id', photoIds))
  if (itemIds.length) must(await supabase.from('quote_items').update(patch).in('id', itemIds))
}
