// LAYER 3 — Technical diagram, one per opening.
// No new photo: the diagram is generated from the opening's confirmed Layer 1
// measurements and saved as a PNG to the diagrams bucket.

import { useMemo, useState } from 'react'
import { TrashIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Button, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { bucketForLayer, removeFiles, supabase, uploadLayerFile } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, mustDelete, useQuery } from '../../lib/useQuery'
import { buildDiagramSvg, svgDataUrl, svgToPngBlob } from './diagram'

export default function Layer3Diagram({ job, opening }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const { data: measurements, loading } = useQuery(`confirmed-measurements:${opening.id}`, async () =>
    must(
      await supabase
        .from('measurements')
        .select('*')
        .eq('opening_id', opening.id)
        .eq('confirmed_by_mike', true)
        .order('created_at'),
    ),
  )
  const { data: diagrams, reload } = useQuery(`layer3:${opening.id}`, async () =>
    must(
      await supabase
        .from('job_photos')
        .select('*')
        .eq('opening_id', opening.id)
        .eq('layer', 3)
        .order('created_at', { ascending: false }),
    ),
  )

  const svg = useMemo(
    () => (measurements?.length ? buildDiagramSvg({ job, opening, measurements }) : null),
    [job, opening, measurements],
  )

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const png = await svgToPngBlob(svg)
      await uploadLayerFile(3, job.id, png, 'png', opening.id)
      toast('Diagram saved to the opening')
      reload()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  async function remove(diagram) {
    if (!window.confirm('Delete this saved diagram?')) return
    try {
      mustDelete(await supabase.from('job_photos').delete().eq('id', diagram.id).select('id'), 'this diagram')
      await removeFiles(bucketForLayer(3), [diagram.storage_path]).catch(() => {})
      toast('Diagram deleted')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (loading && !measurements) return <Spinner />

  const latest = diagrams?.[0]
  const deleteButton = (d) => (
    <button
      type="button"
      onClick={() => remove(d)}
      className="flex size-11 items-center justify-center text-slate-400"
      aria-label="Delete diagram"
    >
      <TrashIcon className="size-5" />
    </button>
  )

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
              Preview from {measurements.length} confirmed entr{measurements.length === 1 ? 'y' : 'ies'}
            </h3>
            <img src={svgDataUrl(svg)} alt="Diagram preview" className="w-full rounded-lg border border-slate-200 bg-white" />
          </div>
          <ErrorMessage error={error} />
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : latest ? 'Save updated diagram' : 'Save diagram'}
          </Button>
        </>
      )}

      {latest && (
        <section>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              Saved · {formatDateTime(latest.created_at)}
            </h3>
            {deleteButton(latest)}
          </div>
          <SignedImage layer={3} path={latest.storage_path} className="w-full rounded-lg border border-slate-200 object-contain" link />
          <p className="mt-1 text-xs text-slate-500">Tap to open full size. The latest diagram goes on the proposal.</p>
        </section>
      )}

      {diagrams?.length > 1 && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-3 font-medium text-slate-600">
            Earlier versions ({diagrams.length - 1})
          </summary>
          <div className="grid grid-cols-2 gap-2">
            {diagrams.slice(1).map((d) => (
              <figure key={d.id}>
                <SignedImage layer={3} path={d.storage_path} className="w-full rounded border border-slate-200 object-contain" link />
                <figcaption className="flex items-center justify-between text-xs text-slate-500">
                  {formatDateTime(d.created_at)}
                  {deleteButton(d)}
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
