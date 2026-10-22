import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MapIcon } from '../../components/icons'
import { Button, Card, EmptyState, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { deleteJob } from '../../lib/jobs'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import JobNotes from '../Notes/JobNotes'
import OpeningsTab from '../Openings/OpeningsTab'
import JobQuotes from '../Quotes/JobQuotes'
import JobSchedule from '../Schedule/JobSchedule'
import JobMedia from '../Media/JobMedia'
import LinkedTasks from '../Tasks/LinkedTasks'
import JobForm from './JobForm'
import { JOB_STATUSES, jobStatusLabel, normalizeJobStatus } from './jobStatus'

const TABS = [
  { id: 'openings', label: 'Openings' },
  { id: 'photos', label: 'Photos' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'notes', label: 'Notes' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'quotes', label: 'Quotes' },
]

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'openings'

  const [savingStatus, setSavingStatus] = useState(false)
  const { data: job, error, loading, reload, mutate } = useQuery(`job:${id}`, async () =>
    must(await supabase.from('jobs').select('*, client:client_id(id, client_name)').eq('id', id).maybeSingle()),
  )

  async function changeStatus(status) {
    setSavingStatus(true)
    const updated_at = new Date().toISOString()
    const { error: updateError } = await supabase.from('jobs').update({ status, updated_at }).eq('id', id)
    setSavingStatus(false)
    if (updateError) return toast(updateError.message, 'error')
    mutate((j) => ({ ...j, status, updated_at }))
    toast(`Moved to ${jobStatusLabel(status)}`)
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Delete "${job.job_name}" and everything in it — openings, measurements, photos and videos, notes, attachments, quotes and its schedule (hours logged)? Linked tasks are kept. This can't be undone.`,
      )
    )
      return
    setDeleting(true)
    try {
      await deleteJob(id)
      toast('Job deleted')
      navigate('/jobs', { replace: true })
    } catch (err) {
      toast(err.message, 'error')
      setDeleting(false)
    }
  }

  if (loading && !job) return <Spinner />
  if (error) return <ErrorMessage error={error} className="m-4" />
  if (!job) return <EmptyState title="Job not found" />

  return (
    <div>
      <PageHeader
        title={job.job_name}
        back="/jobs"
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      <Card className="mx-4 divide-y divide-slate-100">
        <label className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="text-sm text-slate-500">Status</span>
          <select
            className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm font-semibold text-slate-800"
            value={normalizeJobStatus(job.status)}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={savingStatus}
          >
            {JOB_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {job.client && (
          <Link to={`/clients/${job.client.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm text-slate-500">Client</span>
            <span className="font-medium break-words text-blue-700">{job.client.client_name}</span>
          </Link>
        )}
        {job.site_address && (
          <a
            href={`https://maps.apple.com/?q=${encodeURIComponent(job.site_address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-12 items-center gap-3 px-4 py-2"
          >
            <MapIcon className="size-5 shrink-0 text-blue-700" />
            <span className="break-words whitespace-pre-wrap">{job.site_address}</span>
          </a>
        )}
        {job.notes && <p className="px-4 py-3 text-sm break-words whitespace-pre-wrap text-slate-700">{job.notes}</p>}
      </Card>

      <div
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mt-4 flex border-b border-slate-200 bg-slate-50 px-2"
        role="tablist"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`flex min-h-12 min-w-0 flex-1 items-center justify-center border-b-2 text-[13px] font-semibold ${
              tab === t.id ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {tab === 'openings' && <OpeningsTab job={job} />}
        {tab === 'photos' && <JobMedia jobId={id} />}
        {tab === 'schedule' && <JobSchedule jobId={id} onJobChanged={reload} />}
        {tab === 'notes' && <JobNotes jobId={id} />}
        {tab === 'tasks' && <LinkedTasks jobId={id} />}
        {tab === 'quotes' && <JobQuotes jobId={id} />}
      </div>

      {isAdmin && (
        <div className="mt-10 px-4">
          <Button variant="dangerOutline" className="w-full" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete job'}
          </Button>
        </div>
      )}

      {editing && <JobForm job={job} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  )
}
