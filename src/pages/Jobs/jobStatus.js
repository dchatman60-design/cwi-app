/**
 * Job pipeline — the columns of the job board, left to right.
 * `lost` is a closed state shown only when asked for.
 */
export const JOB_STATUSES = [
  { value: 'need_proposal', label: 'Need proposal', tone: 'slate' },
  { value: 'proposal_out', label: 'Proposal out', tone: 'amber' },
  { value: 'ready', label: 'Ready to schedule', tone: 'violet' },
  { value: 'scheduled', label: 'Scheduled', tone: 'blue' },
  { value: 'in_progress', label: 'In progress', tone: 'teal' },
  { value: 'complete', label: 'Complete', tone: 'green' },
  { value: 'lost', label: 'Lost / no sale', tone: 'redSoft' },
]

export const DEFAULT_JOB_STATUS = 'need_proposal'

/** Statuses that count as open work (not complete or lost). */
export const OPEN_JOB_STATUSES = ['need_proposal', 'proposal_out', 'ready', 'scheduled', 'in_progress']

// Older rows (before the board) used draft / active
const LEGACY = { draft: 'need_proposal', active: 'in_progress' }

export function normalizeJobStatus(status) {
  return LEGACY[status] || status || DEFAULT_JOB_STATUS
}

export function jobStatusLabel(status) {
  const value = normalizeJobStatus(status)
  return JOB_STATUSES.find((s) => s.value === value)?.label || value
}

export function jobStatusTone(status) {
  const value = normalizeJobStatus(status)
  return JOB_STATUSES.find((s) => s.value === value)?.tone || 'slate'
}

/** Position on the board (lost sorts last). */
export function jobStatusRank(status) {
  const i = JOB_STATUSES.findIndex((s) => s.value === normalizeJobStatus(status))
  return i === -1 ? 0 : i
}
