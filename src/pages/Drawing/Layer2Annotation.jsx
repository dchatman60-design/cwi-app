// LAYER 2 — Photo Annotation.
// Separate photos from Layer 1 (never the measurement photos), plus blank
// sketches for custom or non-standard configurations. Marked-up images are
// saved to the annotation-photos bucket.

import { lazy, Suspense, useState } from 'react'
import { CameraIcon, EditIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Button, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'

// Konva is large — load the canvas editor only when it's needed
const AnnotationEditor = lazy(() => import('./AnnotationEditor'))

/** A blank sheet of graph paper to sketch on, turned to match the screen. */
async function blankSketch() {
  const portrait = window.innerHeight > window.innerWidth
  const W = portrait ? 1800 : 2400
  const H = portrait ? 2400 : 1800
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  const line = (x1, y1, x2, y2, major) => {
    ctx.strokeStyle = major ? '#bfdbfe' : '#e0f2fe'
    ctx.lineWidth = major ? 2 : 1
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
  }
  for (let x = 0; x <= W; x += 60) line(x, 0, x, H, x % 300 === 0)
  for (let y = 0; y <= H; y += 60) line(0, y, W, y, y % 300 === 0)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  return new File([blob], 'sketch.jpg', { type: 'image/jpeg' })
}

export default function Layer2Annotation({ jobId }) {
  const [file, setFile] = useState(null)
  const [sketching, setSketching] = useState(false)

  const { data: photos, error, loading, reload } = useQuery(`layer2-photos:${jobId}`, async () =>
    must(
      await supabase
        .from('job_photos')
        .select('*')
        .eq('job_id', jobId)
        .eq('layer', 2)
        .order('created_at', { ascending: false }),
    ),
  )

  function pick(e) {
    const chosen = e.target.files?.[0]
    e.target.value = ''
    if (chosen) {
      setSketching(false)
      setFile(chosen)
    }
  }

  async function startSketch() {
    setSketching(true)
    setFile(await blankSketch())
  }

  return (
    <div className="space-y-4">
      <input id="layer2-camera" type="file" accept="image/*" capture="environment" className="sr-only" onChange={pick} />
      <input id="layer2-library" type="file" accept="image/*" className="sr-only" onChange={pick} />

      <label
        htmlFor="layer2-camera"
        className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl bg-red-600 text-lg font-bold text-white active:bg-red-700"
      >
        <CameraIcon className="size-10" />
        Take annotation photo
      </label>
      <label
        htmlFor="layer2-library"
        className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 active:bg-slate-100"
      >
        Choose an existing photo
      </label>
      <Button variant="secondary" className="w-full" onClick={startSketch}>
        <EditIcon className="size-5" /> Draw a sketch
      </Button>
      <p className="text-sm text-slate-500">
        Annotation photos document site conditions; sketches cover custom profiles and non-standard configurations. Both
        are kept separate from measurement photos. To attach a hand-drawn sketch, photograph it with Choose an existing
        photo.
      </p>

      <ErrorMessage error={error} />
      {loading && !photos && <Spinner />}
      {photos?.length === 0 && <EmptyState title="No annotated photos or sketches yet" />}
      {photos?.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <figure key={p.id}>
              <SignedImage layer={2} path={p.storage_path} className="aspect-[4/3] w-full rounded-lg object-cover" link />
              <figcaption className="mt-1 text-xs text-slate-500">{formatDateTime(p.created_at)}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {file && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white">
              <Spinner label="Opening editor…" />
            </div>
          }
        >
          <AnnotationEditor
            file={file}
            jobId={jobId}
            onClose={() => setFile(null)}
            title={sketching ? 'Sketch' : 'Annotate photo'}
            initialColor={sketching ? '#111827' : undefined}
            onSaved={() => {
              setFile(null)
              toast(sketching ? 'Sketch saved' : 'Annotated photo saved')
              reload()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
