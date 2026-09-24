// Openings: each door or window on a job (Engagement Guide, Step 2).

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
