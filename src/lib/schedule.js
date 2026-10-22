import { jobStatusLabel, jobStatusRank, normalizeJobStatus } from '../pages/Jobs/jobStatus'
import { parseLocalDate } from './format'
import { supabase } from './supabase'
import { must } from './useQuery'

export const ENTRY_TYPES = [
  { value: 'job', label: 'Job visit' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'off', label: 'No work' },
]

export const ENTRY_STATUSES = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Columns + linked records every schedule view needs. */
export const ENTRY_SELECT = `*,
  job:job_id(id, job_name, site_address, status, client:client_id(id, client_name)),
  person:assigned_to(id, full_name)`

// ---------------------------------------------------------------------
// Dates — all as local YYYY-MM-DD strings, like the date columns
// ---------------------------------------------------------------------

export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addDays(iso, n) {
  const d = parseLocalDate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  const d = parseLocalDate(iso)
  const offset = (d.getDay() + 6) % 7 // Mon = 0 … Sun = 6
  return addDays(iso, -offset)
}

export function startOfMonth(iso) {
  return `${iso.slice(0, 7)}-01`
}

export function addMonths(iso, n) {
  const d = parseLocalDate(startOfMonth(iso))
  d.setMonth(d.getMonth() + n)
  return toISODate(d)
}

/** Weeks (Mon-start, 7 dates each) covering the month that contains `iso`. */
export function monthWeeks(iso) {
  const first = startOfMonth(iso)
  const nextMonth = addMonths(first, 1)
  const weeks = []
  for (let monday = startOfWeek(first); monday < nextMonth; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)))
  }
  return weeks
}

export function isWeekend(iso) {
  const day = parseLocalDate(iso).getDay()
  return day === 0 || day === 6
}

export function formatMonthYear(iso) {
  return parseLocalDate(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function formatDayHeading(iso) {
  return parseLocalDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** "Oct 19 – 23" or "Sep 29 – Oct 3" */
export function formatRange(fromIso, toIso) {
  const from = parseLocalDate(fromIso)
  const to = parseLocalDate(toIso)
  const month = (d) => d.toLocaleDateString('en-US', { month: 'short' })
  if (from.getMonth() === to.getMonth()) return `${month(from)} ${from.getDate()} – ${to.getDate()}`
  return `${month(from)} ${from.getDate()} – ${month(to)} ${to.getDate()}`
}

// ---------------------------------------------------------------------
// Times and hours
// ---------------------------------------------------------------------

function minutesOf(time) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** Hours between two "HH:MM" times, to the nearest quarter hour. */
export function hoursBetween(start, end) {
  const a = minutesOf(start)
  const b = minutesOf(end)
  if (a === null || b === null || b <= a) return null
  return Math.round(((b - a) / 60) * 4) / 4
}

/** "9:30" / "9:30–2" / "10–1:30" — compact like the whiteboard. */
export function formatTimeWindow(start, end) {
  const short = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    const hour = h % 12 || 12
    return m ? `${hour}:${String(m).padStart(2, '0')}` : String(hour)
  }
  if (start && end) return `${short(start)}–${short(end)}`
  return short(start || end)
}

export function formatHours(hours) {
  if (hours === null || hours === undefined || hours === '') return ''
  const n = Math.round(Number(hours) * 100) / 100
  return `${n} hr${n === 1 ? '' : 's'}`
}

/** Hours to count for an entry: logged hours, else the planned time window. */
export function entryHours(entry) {
  if (entry.status === 'cancelled' || entry.entry_type !== 'job') return 0
  if (entry.hours !== null && entry.hours !== undefined) return Number(entry.hours)
  return hoursBetween(entry.start_time, entry.end_time) || 0
}

export function sumHours(entries, { doneOnly = false } = {}) {
  return entries
    .filter((e) => !doneOnly || e.status === 'done')
    .reduce((total, e) => total + entryHours(e), 0)
}

// ---------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------

export function entryCoversDate(entry, iso) {
  return entry.entry_date <= iso && (entry.end_date || entry.entry_date) >= iso
}

export function entryTitle(entry) {
  if (entry.entry_type === 'job') return entry.job?.job_name || entry.title || 'Job'
  return entry.title || (entry.entry_type === 'off' ? 'No work' : 'Appointment')
}

export function initials(name) {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

/** Every entry that touches the date range (multi-day entries included). */
export async function fetchEntries(fromIso, toIso) {
  return must(
    await supabase
      .from('schedule_entries')
      .select(ENTRY_SELECT)
      .lte('entry_date', toIso)
      .or(`end_date.gte.${fromIso},and(end_date.is.null,entry_date.gte.${fromIso})`)
      .order('entry_date')
      .order('start_time', { nullsFirst: true }),
  )
}

/** Sort within a day: days off first, then by start time. */
export function compareEntries(a, b) {
  const rank = (e) => (e.entry_type === 'off' ? 0 : 1)
  return rank(a) - rank(b) || (a.start_time || '').localeCompare(b.start_time || '')
}

/**
 * Move a job forward on the board when work is booked or logged — never
 * backward, and never to Complete (that stays a person's call).
 *   booked → Scheduled · hours logged (done) → In progress
 * Returns the new status label, or null if nothing changed.
 */
export async function advanceJobForEntry(entry) {
  if (entry.entry_type !== 'job' || !entry.job_id || entry.status === 'cancelled') return null
  const job = must(await supabase.from('jobs').select('id, status').eq('id', entry.job_id).maybeSingle())
  if (!job) return null
  const current = normalizeJobStatus(job.status)
  if (current === 'complete' || current === 'lost') return null
  const target = entry.status === 'done' ? 'in_progress' : 'scheduled'
  if (jobStatusRank(current) >= jobStatusRank(target)) return null
  must(
    await supabase
      .from('jobs')
      .update({ status: target, updated_at: new Date().toISOString() })
      .eq('id', job.id),
  )
  return jobStatusLabel(target)
}
