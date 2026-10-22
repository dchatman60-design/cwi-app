import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, ErrorMessage } from '../../components/ui'
import { formatShortDate, todayISO } from '../../lib/format'
import { formatHours, sumHours } from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { JOB_STATUSES, jobStatusLabel, normalizeJobStatus } from './jobStatus'

const COMPLETE_SHOWN = 12

/** Hours worked, next visit and last visit per job, from the schedule. */
function useJobVisits() {
  return useQuery('job-board-visits', async () => {
    const rows = must(
      await supabase
        .from('schedule_entries')
        .select('job_id, entry_date, status, hours, start_time, end_time, entry_type')
        .eq('entry_type', 'job')
        .neq('status', 'cancelled'),
    )
    const today = todayISO()
    const byJob = {}
    for (const r of rows) {
      const v = (byJob[r.job_id] ||= { done: [], next: null, last: null })
      if (r.status === 'done') {
        v.done.push(r)
        if (!v.last || r.entry_date > v.last) v.last = r.entry_date
      } else if (r.entry_date >= today && (!v.next || r.entry_date < v.next)) {
        v.next = r.entry_date
      }
    }
    for (const v of Object.values(byJob)) v.hours = sumHours(v.done)
    return byJob
  })
}

function JobCard({ job, visits, onMove, draggable }) {
  const status = normalizeJobStatus(job.status)
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white shadow-sm"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <Link to={`/jobs/${job.id}`} className="block px-3 pt-2.5 pb-1 active:bg-slate-50">
        <div className="font-semibold break-words">{job.job_name}</div>
        {job.client?.client_name && job.client.client_name !== job.job_name && (
          <div className="text-sm break-words text-slate-600">{job.client.client_name}</div>
        )}
        {job.site_address && <div className="text-sm break-words text-slate-500">{job.site_address}</div>}
        {job.notes && <div className="mt-0.5 line-clamp-2 text-xs break-words text-slate-500 italic">{job.notes}</div>}
        {(visits?.next || visits?.hours > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {visits.next && <Badge tone="blue">Next {formatShortDate(visits.next)}</Badge>}
            {visits.hours > 0 && <Badge tone="green">{formatHours(visits.hours)} worked</Badge>}
          </div>
        )}
      </Link>
      <div className="px-3 pt-1 pb-2.5">
        <select
          className="min-h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-medium text-slate-700"
          value={status}
          onChange={(e) => onMove(job, e.target.value)}
          aria-label={`Move ${job.job_name}`}
        >
          {JOB_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.value === status ? s.label : `Move to ${s.label}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * Jobs as a board, one column per pipeline status. On phones one column
 * shows at a time (pick it from the chips); on wide screens all columns sit
 * side by side and cards can be dragged between them.
 */
export default function JobBoard({ jobs, onStatusChange }) {
  const [column, setColumn] = useState('need_proposal')
  const [showLost, setShowLost] = useState(false)
  const [showAllComplete, setShowAllComplete] = useState(false)
  const [dragOver, setDragOver] = useState(null)
  const { data: visits, error } = useJobVisits()

  const columns = JOB_STATUSES.filter((s) => s.value !== 'lost' || showLost)

  const jobsIn = (status) => {
    const list = jobs.filter((j) => normalizeJobStatus(j.status) === status)
    if (status === 'scheduled') {
      // Soonest visit first
      list.sort((a, b) => (visits?.[a.id]?.next || '9999').localeCompare(visits?.[b.id]?.next || '9999'))
    } else {
      list.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    }
    return status === 'complete' && !showAllComplete ? list.slice(0, COMPLETE_SHOWN) : list
  }
  const countIn = (status) => jobs.filter((j) => normalizeJobStatus(j.status) === status).length

  async function move(job, status) {
    if (normalizeJobStatus(job.status) === status) return
    try {
      await onStatusChange(job, status)
      toast(`${job.job_name} → ${jobStatusLabel(status)}`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  function renderColumn(s, { wide }) {
    const list = jobsIn(s.value)
    const total = countIn(s.value)
    return (
      <div className="space-y-2">
        {list.map((job) => (
          <JobCard key={job.id} job={job} visits={visits?.[job.id]} onMove={move} draggable={wide} />
        ))}
        {total === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-400">
            {wide ? 'Drop a job here' : 'No jobs here'}
          </p>
        )}
        {s.value === 'complete' && total > COMPLETE_SHOWN && (
          <button
            type="button"
            onClick={() => setShowAllComplete((v) => !v)}
            className="min-h-11 w-full text-sm font-semibold text-blue-700"
          >
            {showAllComplete ? 'Show recent only' : `Show all ${total}`}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <ErrorMessage error={error} className="mb-2" />

      {/* Phones and tablets: one column at a time */}
      <div className="lg:hidden">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Board column">
          {columns.map((s) => (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={column === s.value}
              onClick={() => setColumn(s.value)}
              className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${
                column === s.value
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {s.label} <span className="opacity-70">{countIn(s.value)}</span>
            </button>
          ))}
        </div>
        <div className="mt-3">{renderColumn(columns.find((c) => c.value === column) || columns[0], { wide: false })}</div>
      </div>

      {/* Wide screens: every column side by side, drag to move */}
      <div className="hidden lg:relative lg:left-1/2 lg:block lg:w-[calc(100vw-3rem)] lg:max-w-[96rem] lg:-translate-x-1/2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((s) => (
            <section
              key={s.value}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(s.value)
              }}
              onDragLeave={() => setDragOver((v) => (v === s.value ? null : v))}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(null)
                const job = jobs.find((j) => j.id === e.dataTransfer.getData('text/plain'))
                if (job) move(job, s.value)
              }}
              className={`min-h-64 rounded-xl p-2 ${dragOver === s.value ? 'bg-blue-100' : 'bg-slate-100'}`}
            >
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-bold text-slate-700">
                {s.label}
                <span className="rounded-full bg-white px-2 text-xs text-slate-500">{countIn(s.value)}</span>
              </h2>
              {renderColumn(s, { wide: true })}
            </section>
          ))}
        </div>
      </div>

      <label className="mt-3 flex min-h-11 items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="size-5 accent-blue-700"
          checked={showLost}
          onChange={(e) => {
            setShowLost(e.target.checked)
            if (!e.target.checked && column === 'lost') setColumn('need_proposal')
          }}
        />
        Show lost / no-sale jobs ({countIn('lost')})
      </label>
    </div>
  )
}
