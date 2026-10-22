import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Segmented, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import JobBoard from './JobBoard'
import JobForm from './JobForm'
import {
  JOB_STATUSES,
  jobStatusLabel,
  jobStatusRank,
  jobStatusTone,
  normalizeJobStatus,
  OPEN_JOB_STATUSES,
} from './jobStatus'

const VIEWS = [
  { value: 'list', label: 'List' },
  { value: 'board', label: 'Board' },
]

export default function JobList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'board' ? 'board' : 'list'
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [adding, setAdding] = useState(false)

  const { data, error, loading, mutate, reload } = useQuery('jobs', async () =>
    must(
      await supabase
        .from('jobs')
        .select('*, client:client_id(id, client_name)')
        .order('created_at', { ascending: false }),
    ),
  )

  const term = search.trim().toLowerCase()
  const matchesSearch = (job) =>
    !term ||
    [job.job_name, job.site_address, job.client?.client_name, job.notes].some((v) => v?.toLowerCase().includes(term))
  const matchesStatus = (job) => {
    const s = normalizeJobStatus(job.status)
    return status === 'all' || (status === 'open' ? OPEN_JOB_STATUSES.includes(s) : s === status)
  }

  const searched = (data || []).filter(matchesSearch)
  const jobs = searched
    .filter(matchesStatus)
    .sort((a, b) => jobStatusRank(a.status) - jobStatusRank(b.status) || b.created_at.localeCompare(a.created_at))

  async function changeStatus(job, nextStatus) {
    const updated_at = new Date().toISOString()
    mutate((list) => list.map((j) => (j.id === job.id ? { ...j, status: nextStatus, updated_at } : j)))
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: nextStatus, updated_at })
      .eq('id', job.id)
    if (updateError) {
      reload()
      throw updateError
    }
  }

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle={view === 'board' ? 'Proposal to complete' : 'Measurements, photos & diagrams'}
        action={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon className="size-5" /> New
          </Button>
        }
      />

      <div className="space-y-3 px-4">
        <Segmented options={VIEWS} value={view} onChange={(v) => setParams(v === 'board' ? { view: v } : {}, { replace: true })} />

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className={`${inputClass} pl-10`}
            placeholder="Search job, address, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {view === 'list' && (
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="open">Open jobs</option>
            <option value="all">All jobs</option>
            {JOB_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}

        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}

        {data && view === 'board' && <JobBoard jobs={searched} onStatusChange={changeStatus} />}

        {data && view === 'list' && jobs.length === 0 && (
          <EmptyState title={data.length ? 'No jobs match' : 'No jobs yet'}>
            {!data.length && 'Create a job to start capturing measurements.'}
          </EmptyState>
        )}

        {view === 'list' && jobs.length > 0 && (
          <Card className="divide-y divide-slate-100">
            {jobs.map((job) => (
              <Link key={job.id} to={`/jobs/${job.id}`} className="block px-4 py-3 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold break-words">{job.job_name}</span>
                  <Badge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
                </div>
                {job.site_address && <div className="text-sm break-words text-slate-500">{job.site_address}</div>}
                {job.client && <div className="text-sm break-words text-slate-500">{job.client.client_name}</div>}
              </Link>
            ))}
          </Card>
        )}
      </div>

      {adding && <JobForm onClose={() => setAdding(false)} onSaved={(job) => navigate(`/jobs/${job.id}`)} />}
    </div>
  )
}
