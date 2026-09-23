import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, inputClass, PageHeader, Segmented, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import JobForm from './JobForm'
import { JOB_STATUSES, jobStatusLabel, jobStatusTone } from './jobStatus'

const STATUS_FILTERS = [{ value: 'all', label: 'All' }, ...JOB_STATUSES]

export default function JobList() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [adding, setAdding] = useState(false)

  const { data, error, loading } = useQuery('jobs', async () =>
    must(
      await supabase
        .from('jobs')
        .select('*, client:client_id(id, client_name)')
        .order('created_at', { ascending: false }),
    ),
  )

  const term = search.trim().toLowerCase()
  const jobs = (data || []).filter(
    (job) =>
      (status === 'all' || job.status === status) &&
      (!term ||
        [job.job_name, job.site_address, job.client?.client_name].some((v) => v?.toLowerCase().includes(term))),
  )

  return (
    <div>
      <PageHeader
        title="Jobs"
        subtitle="Measurements, photos & diagrams"
        action={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon className="size-5" /> New
          </Button>
        }
      />

      <div className="space-y-3 px-4">
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
        <Segmented options={STATUS_FILTERS} value={status} onChange={setStatus} />

        <ErrorMessage error={error} />
        {loading && !data && <Spinner />}
        {data && jobs.length === 0 && (
          <EmptyState title={term || status !== 'all' ? 'No jobs match' : 'No jobs yet'}>
            {!term && status === 'all' && 'Create a job to start capturing measurements.'}
          </EmptyState>
        )}

        {jobs.length > 0 && (
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
