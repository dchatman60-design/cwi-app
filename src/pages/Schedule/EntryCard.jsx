import { todayISO } from '../../lib/format'
import {
  entryHours,
  entryTitle,
  formatDayHeading,
  formatHours,
  formatRange,
  formatTimeWindow,
  initials,
} from '../../lib/schedule'

const ACCENT = {
  job: 'border-l-blue-600',
  appointment: 'border-l-emerald-500',
  off: 'border-l-slate-400',
}

function needsHours(entry) {
  return entry.entry_type === 'job' && entry.status === 'scheduled' && entry.entry_date < todayISO()
}

/** One booking in the week list — job visit, appointment or day off. */
export default function EntryCard({ entry, onClick, showDate = false }) {
  const isJob = entry.entry_type === 'job'
  const hours = entryHours(entry)
  const cancelled = entry.status === 'cancelled'
  // Inside a job's own schedule the job name is redundant: lead with the date
  const dateLed = showDate && isJob
  const subtitle = dateLed
    ? ''
    : isJob
    ? [entry.job?.client?.client_name !== entry.job?.job_name ? entry.job?.client?.client_name : null, entry.job?.site_address]
        .filter(Boolean)
        .join(' · ')
    : entry.end_date
      ? formatRange(entry.entry_date, entry.end_date)
      : ''

  // A plain block when the parent is already a link (e.g. the dashboard)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2 text-left active:bg-slate-50 ${
        ACCENT[entry.entry_type]
      } ${entry.entry_type === 'off' ? 'bg-slate-100' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <div className={`font-semibold break-words ${cancelled ? 'text-slate-400 line-through' : ''}`}>
          {dateLed ? formatDayHeading(entry.entry_date) : entryTitle(entry)}
        </div>
        {subtitle && <div className="text-sm break-words text-slate-500">{subtitle}</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
          {showDate && !dateLed && (
            <span className="font-medium text-slate-800">{formatDayHeading(entry.entry_date)}</span>
          )}
          {(entry.start_time || entry.end_time) && (
            <span className="font-medium">{formatTimeWindow(entry.start_time, entry.end_time)}</span>
          )}
          {entry.person && (
            <span
              className="inline-flex size-6 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-700"
              title={entry.person.full_name}
            >
              {initials(entry.person.full_name)}
            </span>
          )}
          {entry.status === 'done' && isJob && <span className="font-semibold text-green-700">✓ Done</span>}
          {cancelled && <span className="font-semibold text-slate-500">Cancelled</span>}
          {needsHours(entry) && <span className="font-semibold text-amber-700">Log hours</span>}
        </div>
        {entry.notes && <div className="mt-0.5 text-sm break-words text-slate-500 italic">{entry.notes}</div>}
      </div>
      {isJob && hours > 0 && !cancelled && (
        <span
          className={`shrink-0 rounded-full border-2 px-2 py-0.5 text-sm font-bold ${
            entry.status === 'done' ? 'border-green-600 text-green-700' : 'border-slate-300 text-slate-500'
          }`}
          title={entry.status === 'done' ? 'Hours worked' : 'Hours planned'}
        >
          {formatHours(hours)}
        </span>
      )}
    </Tag>
  )
}

const CHIP = {
  job: 'bg-blue-50 text-blue-900',
  appointment: 'bg-emerald-50 text-emerald-900',
  off: 'bg-slate-200 text-slate-700',
}

/** Compact label for a month-grid cell. */
export function EntryChip({ entry }) {
  const done = entry.status === 'done' && entry.entry_type === 'job'
  return (
    <span
      className={`line-clamp-2 rounded px-1 py-0.5 text-[11px] leading-tight font-medium break-words ${CHIP[entry.entry_type]} ${
        entry.status === 'cancelled' ? 'line-through opacity-60' : ''
      } ${done ? 'ring-1 ring-green-600/40' : ''}`}
    >
      {entryTitle(entry)}
    </span>
  )
}
