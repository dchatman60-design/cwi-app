import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { MapIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { must, useQuery } from '../../lib/useQuery'
import Layer1Capture from '../Drawing/Layer1Capture'
import Layer2Annotation from '../Drawing/Layer2Annotation'
import Layer3Diagram from '../Drawing/Layer3Diagram'
import JobQuotes from '../Quotes/JobQuotes'
import LinkedTasks from '../Tasks/LinkedTasks'
import JobForm from './JobForm'
import { jobStatusLabel, jobStatusTone } from './jobStatus'

const TABS = [
  { id: 'measure', label: 'Measure', hint: 'Layer 1' },
  { id: 'photos', label: 'Photos', hint: 'Layer 2' },
  { id: 'diagram', label: 'Diagram', hint: 'Layer 3' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'quotes', label: 'Quotes' },
]

export default function JobDetail() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'measure'

  const { data: job, error, loading, reload } = useQuery(`job:${id}`, async () =>
    must(await supabase.from('jobs').select('*, client:client_id(id, client_name)').eq('id', id).maybeSingle()),
  )

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
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-slate-500">Status</span>
          <Badge tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</Badge>
        </div>
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
            className={`flex min-h-12 flex-1 flex-col items-center justify-center border-b-2 text-sm font-semibold ${
              tab === t.id ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500'
            }`}
          >
            {t.label}
            {t.hint && <span className="text-[10px] font-medium opacity-70">{t.hint}</span>}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {tab === 'measure' && <Layer1Capture jobId={id} />}
        {tab === 'photos' && <Layer2Annotation jobId={id} />}
        {tab === 'diagram' && <Layer3Diagram job={job} />}
        {tab === 'tasks' && <LinkedTasks jobId={id} />}
        {tab === 'quotes' && <JobQuotes jobId={id} />}
      </div>

      {editing && <JobForm job={job} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  )
}
