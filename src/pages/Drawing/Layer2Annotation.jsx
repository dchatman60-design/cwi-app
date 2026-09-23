// LAYER 2 — Photo Annotation.
// Separate photos from Layer 1 (never the measurement photos). Marked-up
// images are saved to the annotation-photos bucket.

import { lazy, Suspense, useState } from 'react'
import { CameraIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'

// Konva is large — load the canvas editor only when it's needed
const AnnotationEditor = lazy(() => import('./AnnotationEditor'))

export default function Layer2Annotation({ jobId }) {
  const [file, setFile] = useState(null)

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
    if (chosen) setFile(chosen)
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
      <p className="text-sm text-slate-500">
        Annotation photos document site conditions. They're kept separate from measurement photos.
      </p>

      <ErrorMessage error={error} />
      {loading && !photos && <Spinner />}
      {photos?.length === 0 && <EmptyState title="No annotated photos yet" />}
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
            onSaved={() => {
              setFile(null)
              toast('Annotated photo saved')
              reload()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
