import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackIcon, ForwardIcon, PlusIcon } from '../../components/icons'
import { Button, Card, ErrorMessage, inputClass, PageHeader, Segmented, Spinner } from '../../components/ui'
import { parseLocalDate, todayISO } from '../../lib/format'
import {
  addDays,
  addMonths,
  compareEntries,
  entryCoversDate,
  fetchEntries,
  formatHours,
  formatMonthYear,
  formatRange,
  isWeekend,
  monthWeeks,
  startOfMonth,
  startOfWeek,
  sumHours,
} from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import { useActiveUsers } from '../../lib/users'
import EntryCard, { EntryChip } from './EntryCard'
import EntryForm from './EntryForm'

const VIEWS = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKENDS_KEY = 'cwi:schedule:weekends'

function readWeekends() {
  try {
    return localStorage.getItem(WEEKENDS_KEY) === '1'
  } catch {
    return false
  }
}

function NavArrows({ label, onPrev, onNext, onToday }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-200"
        aria-label="Previous"
      >
        <BackIcon />
      </button>
      <div className="min-w-0 flex-1 text-center font-semibold">{label}</div>
      <button
        type="button"
        onClick={onNext}
        className="flex size-11 items-center justify-center rounded-full text-slate-600 active:bg-slate-200"
        aria-label="Next"
      >
        <ForwardIcon />
      </button>
      <Button variant="secondary" className="ml-1 px-3" onClick={onToday}>
        Today
      </Button>
    </div>
  )
}

export default function ScheduleCalendar() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'month' ? 'month' : 'week'
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : todayISO()
  const [showWeekends, setShowWeekends] = useState(readWeekends)
  const [person, setPerson] = useState('all')
  const [editing, setEditing] = useState(null) // null | { entry } | { defaults }
  const users = useActiveUsers()
  const today = todayISO()

  const go = (next) => setParams({ view: next.view ?? view, date: next.date ?? anchor }, { replace: true })

  // Date range on screen
  const weekStart = startOfWeek(anchor)
  const weeks = view === 'month' ? monthWeeks(anchor) : [Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))]
  const rangeFrom = weeks[0][0]
  const rangeTo = weeks.at(-1)[6]

  const { data, error, loading, reload } = useQuery(`schedule:${rangeFrom}:${rangeTo}`, () =>
    fetchEntries(rangeFrom, rangeTo),
  )

  const { data: readyJobs, reload: reloadReady } = useQuery('schedule-ready-jobs', async () =>
    must(
      await supabase
        .from('jobs')
        .select('id, job_name, site_address, client:client_id(client_name)')
        .eq('status', 'ready')
        .order('updated_at', { ascending: false }),
    ),
  )

  const entries = (data || []).filter((e) => person === 'all' || e.assigned_to === person || !e.assigned_to)
  const entriesOn = (iso) => entries.filter((e) => entryCoversDate(e, iso)).sort(compareEntries)

  // Show weekend columns when asked, or when work or an appointment falls on
  // one (a multi-day "away" block alone doesn't count)
  const weekendBooked = entries.some(
    (e) => e.entry_type !== 'off' && weeks.flat().some((d) => isWeekend(d) && entryCoversDate(e, d)),
  )
  const dayIndexes = showWeekends || weekendBooked ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]

  const visibleDays = weeks.flatMap((w) => dayIndexes.map((i) => w[i]))
  const inRange = (e) => visibleDays.some((d) => entryCoversDate(e, d))
  const rangeEntries = entries.filter(inRange)
  const doneHours = sumHours(rangeEntries, { doneOnly: true })
  const bookedHours = sumHours(rangeEntries.filter((e) => e.status === 'scheduled'))

  function toggleWeekends(checked) {
    setShowWeekends(checked)
    try {
      localStorage.setItem(WEEKENDS_KEY, checked ? '1' : '0')
    } catch {
      // per-device convenience only
    }
  }

  const onSaved = () => {
    reload()
    reloadReady()
  }

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={
          data &&
          [doneHours ? `${formatHours(doneHours)} worked` : null, bookedHours ? `${formatHours(bookedHours)} booked` : null]
            .filter(Boolean)
            .join(' · ')
        }
        action={
          <Button onClick={() => setEditing({ defaults: { entry_date: view === 'week' && anchor < today ? anchor : today } })}>
            <PlusIcon className="size-5" /> Add
          </Button>
        }
      />

      <div className="space-y-3 px-4">
        <Segmented options={VIEWS} value={view} onChange={(v) => go({ view: v })} />

        <NavArrows
          label={view === 'month' ? formatMonthYear(anchor) : formatRange(weekStart, addDays(weekStart, dayIndexes.length - 1))}
          onPrev={() => go({ date: view === 'month' ? addMonths(anchor, -1) : addDays(weekStart, -7) })}
          onNext={() => go({ date: view === 'month' ? addMonths(anchor, 1) : addDays(weekStart, 7) })}
          onToday={() => go({ date: today })}
        />

        <div className="flex items-center gap-3">
          {users.length > 1 && (
            <select
              className={`${inputClass} flex-1`}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              aria-label="Whose schedule"
            >
              <option value="all">Everyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          )}
          <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="size-5 accent-blue-700"
              checked={showWeekends}
              onChange={(e) => toggleWeekends(e.target.checked)}
            />
            Weekends
          </label>
        </div>

        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}

        {data && view === 'week' && (
          <div className="space-y-3">
            {dayIndexes.map((i) => {
              const day = weeks[0][i]
              const dayEntries = entriesOn(day)
              const dayHours = sumHours(dayEntries)
              const isToday = day === today
              return (
                <section key={day}>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <h2 className={`text-sm font-bold ${isToday ? 'text-blue-700' : 'text-slate-700'}`}>
                      {parseLocalDate(day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                      {isToday && <span className="ml-2 rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">Today</span>}
                    </h2>
                    <div className="flex items-center gap-1">
                      {dayHours > 0 && <span className="text-sm font-semibold text-slate-500">{formatHours(dayHours)}</span>}
                      <button
                        type="button"
                        onClick={() => setEditing({ defaults: { entry_date: day } })}
                        className="flex size-11 items-center justify-center rounded-full text-blue-700 active:bg-blue-50"
                        aria-label={`Add to ${day}`}
                      >
                        <PlusIcon className="size-5" />
                      </button>
                    </div>
                  </div>
                  {dayEntries.length ? (
                    <div className="space-y-2">
                      {dayEntries.map((e) => (
                        <EntryCard key={e.id} entry={e} day={day} onClick={() => setEditing({ entry: e })} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-400">
                      Nothing booked
                    </p>
                  )}
                </section>
              )
            })}

            {readyJobs?.length > 0 && (
              <section className="pt-3">
                <h2 className="mb-1.5 text-sm font-semibold tracking-wide text-slate-500 uppercase">
                  Ready to schedule ({readyJobs.length})
                </h2>
                <Card className="divide-y divide-slate-100">
                  {readyJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => setEditing({ defaults: { job_id: job.id, entry_date: anchor < today ? today : anchor } })}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-slate-50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium break-words">{job.job_name}</div>
                        <div className="text-sm break-words text-slate-500">
                          {[job.client?.client_name, job.site_address].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-blue-700">Book</span>
                    </button>
                  ))}
                </Card>
              </section>
            )}
          </div>
        )}

        {data && view === 'month' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div
              className="grid border-b border-slate-200 bg-slate-100"
              style={{ gridTemplateColumns: `repeat(${dayIndexes.length}, minmax(0, 1fr))` }}
            >
              {dayIndexes.map((i) => (
                <div key={i} className="py-1.5 text-center text-xs font-semibold text-slate-600">
                  {WEEKDAY_LABELS[i]}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div
                key={week[0]}
                className="grid border-b border-slate-200 last:border-b-0"
                style={{ gridTemplateColumns: `repeat(${dayIndexes.length}, minmax(0, 1fr))` }}
              >
                {dayIndexes.map((i) => {
                  const day = week[i]
                  const inMonth = startOfMonth(day) === startOfMonth(anchor)
                  const dayEntries = entriesOn(day)
                  const dayHours = sumHours(dayEntries)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => go({ view: 'week', date: day })}
                      className={`flex min-h-24 min-w-0 flex-col gap-0.5 border-r border-slate-200 p-1 text-left last:border-r-0 active:bg-blue-50 ${
                        inMonth ? '' : 'bg-slate-50 text-slate-400'
                      }`}
                      aria-label={`${day}: ${dayEntries.length} item${dayEntries.length === 1 ? '' : 's'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            day === today ? 'rounded-full bg-blue-700 px-1.5 text-white' : ''
                          }`}
                        >
                          {Number(day.slice(8))}
                        </span>
                        {dayHours > 0 && <span className="text-[10.5px] font-semibold text-slate-500">{dayHours}h</span>}
                      </div>
                      {dayEntries.slice(0, 3).map((e) => (
                        <EntryChip key={e.id} entry={e} />
                      ))}
                      {dayEntries.length > 3 && (
                        <span className="text-[10.5px] font-medium text-slate-500">+{dayEntries.length - 3} more</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}
        {data && view === 'month' && (
          <p className="pb-2 text-center text-xs text-slate-500">Tap a day to open its week.</p>
        )}
      </div>

      {editing && (
        <EntryForm
          entry={editing.entry}
          defaults={editing.defaults}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
