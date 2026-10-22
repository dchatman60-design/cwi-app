import { useState } from 'react'
import { PlusIcon } from '../../components/icons'
import { Button, Card, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { todayISO } from '../../lib/format'
import { ENTRY_SELECT, formatHours, sumHours } from '../../lib/schedule'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import EntryCard from './EntryCard'
import EntryForm from './EntryForm'

function Stat({ label, value }) {
  return (
    <Card className="flex-1 px-3 py-3 text-center">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
    </Card>
  )
}

/** Job detail → Schedule tab: visits booked and hours worked on site. */
export default function JobSchedule({ jobId, onJobChanged }) {
  const [editing, setEditing] = useState(null) // null | { entry } | { defaults }
  const today = todayISO()

  const { data, error, loading, reload } = useQuery(`job-schedule:${jobId}`, async () =>
    must(
      await supabase
        .from('schedule_entries')
        .select(ENTRY_SELECT)
        .eq('job_id', jobId)
        .order('entry_date', { ascending: false })
        .order('start_time', { ascending: false, nullsFirst: false }),
    ),
  )

  const entries = data || []
  const done = entries.filter((e) => e.status === 'done')
  const upcoming = entries.filter((e) => e.status === 'scheduled' && e.entry_date >= today).reverse()
  const past = entries.filter((e) => !upcoming.includes(e))
  const workedHours = sumHours(done)
  const daysOnSite = new Set(done.map((e) => e.entry_date)).size

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <Stat label="Hours worked" value={workedHours ? formatHours(workedHours).replace(/ hrs?$/, '') : '0'} />
        <Stat label="Days on site" value={daysOnSite} />
        <Stat label="Upcoming" value={upcoming.length} />
      </div>

      <Button className="w-full" onClick={() => setEditing({ defaults: { job_id: jobId } })}>
        <PlusIcon className="size-5" /> Book or log a visit
      </Button>

      <ErrorMessage error={error} />
      {loading && !data && <Spinner />}
      {data && entries.length === 0 && (
        <EmptyState title="Nothing scheduled yet">Book a visit, or log hours already worked.</EmptyState>
      )}

      {upcoming.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold tracking-wide text-slate-500 uppercase">Coming up</h3>
          <div className="space-y-2">
            {upcoming.map((e) => (
              <EntryCard key={e.id} entry={e} showDate onClick={() => setEditing({ entry: e })} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold tracking-wide text-slate-500 uppercase">History</h3>
          <div className="space-y-2">
            {past.map((e) => (
              <EntryCard key={e.id} entry={e} showDate onClick={() => setEditing({ entry: e })} />
            ))}
          </div>
        </section>
      )}

      {editing && (
        <EntryForm
          entry={editing.entry}
          defaults={editing.defaults}
          onClose={() => setEditing(null)}
          onSaved={() => {
            reload()
            onJobChanged?.()
          }}
        />
      )}
    </div>
  )
}
