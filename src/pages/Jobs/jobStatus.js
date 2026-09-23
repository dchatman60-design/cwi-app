export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft', tone: 'slate' },
  { value: 'active', label: 'Active', tone: 'blue' },
  { value: 'complete', label: 'Complete', tone: 'green' },
]

export function jobStatusLabel(status) {
  return JOB_STATUSES.find((s) => s.value === status)?.label || status || 'Draft'
}

export function jobStatusTone(status) {
  return JOB_STATUSES.find((s) => s.value === status)?.tone || 'slate'
}
