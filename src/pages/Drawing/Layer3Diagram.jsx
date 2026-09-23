// LAYER 3 — AI Technical Diagram.
// No new photo: the diagram is generated from confirmed Layer 1 measurements
// and saved as a PNG to the diagrams bucket.

import { useMemo, useState } from 'react'
import SignedImage from '../../components/SignedImage'
import { Button, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { supabase, uploadLayerFile } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import { buildDiagramSvg, svgDataUrl, svgToPngBlob } from './diagram'

export default function Layer3Diagram({ job }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: measurements, loading } = useQuery(`confirmed-measurements:${job.id}`, async () =>
    must(
      await supabase
        .from('measurements')
        .select('*')
        .eq('job_id', job.id)
        .eq('confirmed_by_mike', true)
        .order('created_at'),
    ),
  )
  const { data: diagrams, reload } = useQuery(`layer3:${job.id}`, async () =>
    must(
      await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', job.id)
        .eq('layer', 3)
        .order('created_at', { ascending: false }),
    ),
  )

  const svg = useMemo(
    () => (measurements?.length ? buildDiagramSvg({ job, measurements }) : null),
    [job, measurements],
  )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const png = await svgToPngBlob(svg)
      await uploadLayerFile(3, job.id, png, 'png')
      toast('Diagram saved to the job')
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !measurements) return <Spinner />

  const latest = diagrams?.[0]

  return (
    <div className="space-y-4">
      {!measurements?.length ? (
        <EmptyState title="No confirmed measurements yet">
          Capture and confirm measurements on the Measure tab. The diagram is built from them.
        </EmptyState>
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Preview from {measurements.length} confirmed measurement{measurements.length === 1 ? '' : 's'}
            </h3>
            <img src={svgDataUrl(svg)} alt="Diagram preview" className="w-full rounded-lg border border-slate-200 bg-white" />
          </div>
          <ErrorMessage error={error} />
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : latest ? 'Save updated diagram' : 'Save diagram to job'}
          </Button>
        </>
      )}

      {latest && (
        <section>
          <h3 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            Saved diagram · {formatDateTime(latest.created_at)}
          </h3>
          <SignedImage layer={3} path={latest.storage_path} className="w-full rounded-lg border border-slate-200 object-contain" link />
          <p className="mt-1 text-xs text-slate-500">Tap to open full size for proposals and supplier POs.</p>
        </section>
      )}

      {diagrams?.length > 1 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-600">
            Earlier versions ({diagrams.length - 1})
          </summary>
          <div className="grid grid-cols-2 gap-2">
            {diagrams.slice(1).map((d) => (
              <SignedImage key={d.id} layer={3} path={d.storage_path} className="w-full rounded border border-slate-200 object-contain" link />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
