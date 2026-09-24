// Openings: each door or window on a job (Engagement Guide, Step 2).

import { supabase } from '../../lib/supabase'
import { must } from '../../lib/useQuery'

export const OPENING_TYPES = [
  { value: 'single_door', label: 'Single door' },
  { value: 'double_door', label: 'Double door' },
  { value: 'window', label: 'Window' },
  { value: 'other', label: 'Other' },
]

export const OPENING_NAME_SUGGESTIONS = [
  'Front entry',
  'Back door',
  'Side door',
  'Garage entry',
  'Patio door',
  'French doors',
  'Kitchen window',
  'Bedroom window',
]

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
