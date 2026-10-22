import { useState } from 'react'
import { CameraIcon, PlusIcon } from '../../components/icons'
import { EmptyState, ErrorMessage, Field, inputClass, Spinner } from '../../components/ui'
import { useAuth } from '../../context/auth'
import {
  enqueueMedia,
  MAX_UPLOAD_MB,
  MEDIA_ACCEPT,
  MEDIA_BUCKET,
  MEDIA_SELECT,
  useMediaChanged,
  useUploads,
} from '../../lib/media'
import { getSignedFileUrl, supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import MediaViewer from './MediaViewer'

export function useSignedMediaUrl(path) {
  return useQuery(`signed:${MEDIA_BUCKET}:${path}`, () => getSignedFileUrl(MEDIA_BUCKET, path, 6 * 3600)).data
}

function Thumb({ media, onClick }) {
  const url = useSignedMediaUrl(media.storage_path)
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-square w-full overflow-hidden rounded-lg bg-slate-200"
      aria-label={media.caption || media.file_name || (media.media_type === 'video' ? 'Video' : 'Photo')}
    >
      {url &&
        (media.media_type === 'video' ? (
          <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="size-full object-cover" />
        ) : (
          <img src={url} alt="" loading="lazy" className="size-full object-cover" />
        ))}
      {media.media_type === 'video' && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-lg text-white">▶</span>
        </span>
      )}
      {media.caption && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[11px] text-white">
          {media.caption}
        </span>
      )}
    </button>
  )
}

/**
 * Site photos and videos for a job — picked many at a time from the camera
 * roll, or shot on the spot. Pass `openingId` to show and add only that
 * door/window's files.
 */
export default function JobMedia({ jobId, openingId = null }) {
  const { profile } = useAuth()
  const [target, setTarget] = useState('') // '' = whole job (job-level view only)
  const [filter, setFilter] = useState('all')
  const [viewing, setViewing] = useState(null) // index into shown
  const uploads = useUploads()
  const inFlight = uploads.filter(
    (u) => u.jobId === jobId && (u.status === 'queued' || u.status === 'uploading') && (!openingId || u.openingId === openingId),
  ).length

  const { data: media, error, loading, reload } = useQuery(`job-media:${jobId}:${openingId}`, async () => {
    let query = supabase.from('job_media').select(MEDIA_SELECT).eq('job_id', jobId)
    if (openingId) query = query.eq('opening_id', openingId)
    return must(await query.order('created_at', { ascending: false }))
  })
  useMediaChanged(jobId, reload)

  const { data: openings } = useQuery(`media-openings:${jobId}`, async () =>
    openingId ? [] : must(await supabase.from('openings').select('id, opening_name').eq('job_id', jobId).order('created_at')),
  )

  const shown = (media || []).filter(
    (m) => filter === 'all' || (filter === 'none' ? !m.opening_id : m.opening_id === filter),
  )

  function pick(e) {
    const files = e.target.files
    if (!files?.length) return
    const accepted = enqueueMedia({
      jobId,
      openingId: openingId || target || null,
      files,
      uploadedBy: profile?.id || null,
    })
    e.target.value = ''
    if (accepted) toast(`Uploading ${accepted} file${accepted === 1 ? '' : 's'}…`)
    if (accepted < files.length) toast(`${files.length - accepted} file(s) over ${MAX_UPLOAD_MB} MB — see the upload list`, 'error')
  }

  const inputId = `media-${openingId || 'job'}`
  return (
    <div className="space-y-3">
      {!openingId && openings?.length > 0 && (
        <Field label="Add to">
          <select className={inputClass} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Whole job</option>
            {openings.map((o) => (
              <option key={o.id} value={o.id}>
                {o.opening_name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <input id={`${inputId}-library`} type="file" multiple accept={MEDIA_ACCEPT} className="sr-only" onChange={pick} />
      <input id={`${inputId}-camera`} type="file" accept={MEDIA_ACCEPT} capture="environment" className="sr-only" onChange={pick} />
      <label
        htmlFor={`${inputId}-library`}
        className="flex min-h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-lg font-bold text-white active:bg-blue-800"
      >
        <PlusIcon className="size-7" />
        Add photos & videos
      </label>
      <label
        htmlFor={`${inputId}-camera`}
        className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 active:bg-slate-100"
      >
        <CameraIcon className="size-5" /> Take a photo or video now
      </label>
      <p className="text-xs text-slate-500">
        Pick as many as you like from the camera roll. Videos up to {MAX_UPLOAD_MB} MB each — about a minute at 1080p.
        {inFlight > 0 && <strong className="text-blue-700"> {inFlight} uploading…</strong>}
      </p>

      {!openingId && openings?.length > 0 && (media?.length || 0) > 0 && (
        <select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Show">
          <option value="all">All photos & videos ({media.length})</option>
          <option value="none">Whole job only</option>
          {openings.map((o) => (
            <option key={o.id} value={o.id}>
              {o.opening_name}
            </option>
          ))}
        </select>
      )}

      <ErrorMessage error={error} />
      {loading && !media && <Spinner />}
      {media && shown.length === 0 && (
        <EmptyState title={media.length ? 'Nothing here' : 'No photos or videos yet'}>
          {!media.length && 'Take them with the phone camera as usual, then add them here in one go.'}
        </EmptyState>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {shown.map((m, i) => (
            <Thumb key={m.id} media={m} onClick={() => setViewing(i)} />
          ))}
        </div>
      )}

      {viewing !== null && shown[viewing] && (
        <MediaViewer
          items={shown}
          index={viewing}
          onIndexChange={setViewing}
          openings={openingId ? null : openings}
          onClose={() => setViewing(null)}
          onChanged={reload}
        />
      )}
    </div>
  )
}
