import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlusIcon } from '../../components/icons'
import { Badge, Button, Card, EmptyState, ErrorMessage, inputClass, Spinner } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import OpeningForm from './OpeningForm'
import { openingTypeLabel } from './openings'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The job's doors and windows, each with its own measurements, photos and products. */
export default function OpeningsTab({ job }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [moveTo, setMoveTo] = useState('')
  const [moving, setMoving] = useState(false)

  const { data: openings, error, loading } = useQuery(`openings:${job.id}`, async () =>
    must(await supabase.from('openings').select('*').eq('job_id', job.id).order('created_at')),
  )
  const counts = useQuery(`opening-counts:${job.id}`, async () => {
    const [measurements, photos] = await Promise.all([
      supabase.from('measurements').select('opening_id').eq('job_id', job.id).then(must),
      supabase.from('job_photos').select('opening_id').eq('job_id', job.id).then(must),
    ])
    const tally = (rows) => rows.reduce((acc, r) => ({ ...acc, [r.opening_id ?? 'none']: (acc[r.opening_id ?? 'none'] || 0) + 1 }), {})
    return { measurements: tally(measurements), photos: tally(photos) }
  })

  const unassignedMeasurements = counts.data?.measurements.none || 0
  const unassignedPhotos = counts.data?.photos.none || 0

  async function moveUnassigned() {
    if (!moveTo) return
    setMoving(true)
    try {
      await Promise.all([
        supabase.from('measurements').update({ opening_id: moveTo }).eq('job_id', job.id).is('opening_id', null).then(must),
        supabase.from('job_photos').update({ opening_id: moveTo }).eq('job_id', job.id).is('opening_id', null).then(must),
      ])
      toast('Moved to the opening')
      counts.reload()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setMoving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button className="min-h-14 w-full" onClick={() => setAdding(true)}>
        <PlusIcon className="size-5" /> Add opening
      </Button>

      <ErrorMessage error={error} />
      {loading && !openings && <Spinner />}
      {openings?.length === 0 && (
        <EmptyState title="No openings yet">
          Add each door or window on this job, named the way the site contact knows it — Front entry, Suite 101, Door 3.
        </EmptyState>
      )}

      {openings?.length > 0 && (
        <Card className="divide-y divide-slate-100">
          {openings.map((o) => {
            const m = counts.data?.measurements[o.id] || 0
            const p = counts.data?.photos[o.id] || 0
            return (
              <Link key={o.id} to={`/jobs/${job.id}/openings/${o.id}`} className="block min-h-16 px-4 py-3 active:bg-slate-50">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold break-words">{o.opening_name}</span>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {o.is_fire_rated && <Badge tone="redSoft">Fire-rated</Badge>}
                    {o.is_complex && <Badge tone="amber">Review</Badge>}
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {openingTypeLabel(o.opening_type)}
                  {counts.data && ` · ${plural(m, 'measurement')} · ${plural(p, 'photo')}`}
                </div>
              </Link>
            )
          })}
        </Card>
      )}

      {(unassignedMeasurements > 0 || unassignedPhotos > 0) && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-950">
            {plural(unassignedMeasurements, 'measurement')} and {plural(unassignedPhotos, 'photo')} on this job aren&apos;t in an
            opening yet.
          </p>
          {openings?.length ? (
            <div className="flex gap-2">
              <select className={`${inputClass} flex-1`} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move to opening">
                <option value="">Move them to…</option>
                {openings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.opening_name}
                  </option>
                ))}
              </select>
              <Button onClick={moveUnassigned} disabled={!moveTo || moving}>
                Move
              </Button>
            </div>
          ) : (
            <p className="text-sm text-amber-950">Add an opening first, then move them into it.</p>
          )}
        </div>
      )}

      {adding && (
        <OpeningForm
          jobId={job.id}
          onClose={() => setAdding(false)}
          onSaved={(opening) => navigate(`/jobs/${job.id}/openings/${opening.id}`)}
        />
      )}
    </div>
  )
}
