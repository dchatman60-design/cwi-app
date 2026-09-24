import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorMessage, PageHeader, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, mustDelete, useQuery } from '../../lib/useQuery'
import Layer1Capture from '../Drawing/Layer1Capture'
import Layer2Annotation from '../Drawing/Layer2Annotation'
import Layer3Diagram from '../Drawing/Layer3Diagram'
import OpeningForm from './OpeningForm'
import OpeningProducts from './OpeningProducts'
import { openingTypeLabel } from './openings'

const TABS = [
  { id: 'measure', label: 'Measure', hint: 'Layer 1' },
  { id: 'photos', label: 'Photos', hint: 'Layer 2' },
  { id: 'diagram', label: 'Diagram', hint: 'Layer 3' },
  { id: 'products', label: 'Products' },
]

/** One door or window: its measurements, photos & sketches, diagram, and products. */
export default function OpeningDetail() {
  const { jobId, openingId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'measure'

  const { data: job } = useQuery(`job-summary:${jobId}`, async () =>
    must(await supabase.from('jobs').select('id, job_name, site_address').eq('id', jobId).maybeSingle()),
  )
  const { data: opening, error, loading, reload } = useQuery(`opening:${openingId}`, async () =>
    must(await supabase.from('openings').select('*').eq('id', openingId).maybeSingle()),
  )

  async function deleteOpening() {
    if (
      !window.confirm(
        `Delete "${opening.opening_name}"? Its measurements are deleted. Its photos stay with the job, and its quote lines move to the quote's General section.`,
      )
    )
      return
    setDeleting(true)
    try {
      mustDelete(await supabase.from('openings').delete().eq('id', openingId).select('id'), 'this opening')
      toast('Opening deleted')
      navigate(`/jobs/${jobId}`, { replace: true })
    } catch (err) {
      toast(err.message, 'error')
      setDeleting(false)
    }
  }

  if (loading && !opening) return <Spinner />
  if (error) return <ErrorMessage error={error} className="m-4" />
  if (!opening || !job) return job === undefined ? <Spinner /> : <EmptyState title="Opening not found" />

  return (
    <div>
      <PageHeader
        title={opening.opening_name}
        subtitle={`${openingTypeLabel(opening.opening_type)} · ${job.job_name}`}
        back={`/jobs/${jobId}`}
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      {(opening.is_fire_rated || opening.is_complex || opening.notes) && (
        <div className="space-y-2 px-4 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {opening.is_fire_rated && <Badge tone="redSoft">Fire-rated · FTP-001 testing</Badge>}
            {opening.is_complex && <Badge tone="amber">Complex — office review</Badge>}
          </div>
          {opening.notes && <p className="text-sm whitespace-pre-wrap text-slate-600">{opening.notes}</p>}
        </div>
      )}

      <div
        className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mt-2 flex border-b border-slate-200 bg-slate-50 px-2"
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
        {tab === 'measure' && <Layer1Capture jobId={jobId} openingId={openingId} />}
        {tab === 'photos' && <Layer2Annotation jobId={jobId} openingId={openingId} />}
        {tab === 'diagram' && <Layer3Diagram job={job} opening={opening} />}
        {tab === 'products' && <OpeningProducts job={job} opening={opening} />}
      </div>

      <div className="mt-10 px-4">
        <Button variant="dangerOutline" className="w-full" onClick={deleteOpening} disabled={deleting}>
          {deleting ? 'Deleting…' : 'Delete opening'}
        </Button>
      </div>

      {editing && <OpeningForm jobId={jobId} opening={opening} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  )
}
