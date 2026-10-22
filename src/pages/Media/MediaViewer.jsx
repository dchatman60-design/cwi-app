import { lazy, Suspense, useState } from 'react'
import { BackIcon, EditIcon, ForwardIcon, TrashIcon } from '../../components/icons'
import { Button, Field, inputClass, Sheet, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { deleteMedia, updateMedia } from '../../lib/media'
import { toast } from '../../lib/toast'
import { formatBytes } from '../Notes/notes'
import { useSignedMediaUrl } from './JobMedia'

// Konva is large — load the mark-up editor only when it's needed
const AnnotationEditor = lazy(() => import('../Drawing/AnnotationEditor'))

/** Full view of one photo or video, with caption, opening, mark-up and delete. */
export default function MediaViewer({ items, index, onIndexChange, openings, onClose, onChanged }) {
  const media = items[index]
  const url = useSignedMediaUrl(media.storage_path)
  const [busy, setBusy] = useState(false)
  const [markup, setMarkup] = useState(null) // File to annotate
  const isVideo = media.media_type === 'video'

  async function save(change, message) {
    try {
      await updateMedia(media.id, change)
      toast(message)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this ${isVideo ? 'video' : 'photo'}? This can't be undone.`)) return
    setBusy(true)
    try {
      await deleteMedia(media)
      toast('Deleted')
      onChanged()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
      setBusy(false)
    }
  }

  async function startMarkup() {
    setBusy(true)
    try {
      const blob = await (await fetch(url)).blob()
      setMarkup(new File([blob], media.file_name || 'photo.jpg', { type: blob.type || 'image/jpeg' }))
    } catch {
      toast("Couldn't open the photo for mark-up", 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title={`${index + 1} of ${items.length}`} onClose={onClose}>
      <div className="-mx-4 -mt-4 bg-black">
        {!url ? (
          <div className="flex h-72 items-center justify-center text-white">
            <Spinner />
          </div>
        ) : isVideo ? (
          <video key={url} src={url} controls playsInline className="max-h-[60dvh] w-full" />
        ) : (
          <img src={url} alt={media.caption || ''} className="max-h-[60dvh] w-full object-contain" />
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onIndexChange(index - 1)}
          disabled={index === 0}
          className="flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white disabled:opacity-30"
          aria-label="Previous"
        >
          <BackIcon />
        </button>
        <div className="min-w-0 flex-1 text-center text-xs text-slate-500">
          {formatDateTime(media.created_at)}
          {media.uploader?.full_name && ` · ${media.uploader.full_name}`}
          {media.size_bytes ? ` · ${formatBytes(media.size_bytes)}` : ''}
        </div>
        <button
          type="button"
          onClick={() => onIndexChange(index + 1)}
          disabled={index === items.length - 1}
          className="flex size-11 items-center justify-center rounded-full border border-slate-300 bg-white disabled:opacity-30"
          aria-label="Next"
        >
          <ForwardIcon />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <Field label="Caption">
          <input
            key={media.id}
            className={inputClass}
            defaultValue={media.caption || ''}
            placeholder="e.g. Back door threshold, tape reading"
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onBlur={(e) => {
              const caption = e.target.value.trim() || null
              if (caption !== (media.caption || null)) save({ caption }, 'Caption saved')
            }}
          />
        </Field>

        {openings?.length > 0 && (
          <Field label="Opening">
            <select
              className={inputClass}
              value={media.opening_id || ''}
              onChange={(e) => save({ opening_id: e.target.value || null }, 'Moved')}
            >
              <option value="">Whole job</option>
              {openings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.opening_name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <a
            href={url || undefined}
            target="_blank"
            rel="noreferrer"
            download={media.file_name || true}
            className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 active:bg-slate-100"
          >
            Open full size
          </a>
          {!isVideo ? (
            <Button variant="secondary" onClick={startMarkup} disabled={!url || busy}>
              <EditIcon className="size-5" /> Mark up
            </Button>
          ) : (
            <span />
          )}
        </div>
        {!isVideo && (
          <p className="text-xs text-slate-500">Mark up saves a copy to the opening&apos;s annotated photos. This original stays as is.</p>
        )}

        <Button variant="dangerOutline" className="w-full" onClick={remove} disabled={busy}>
          <TrashIcon className="size-5" /> Delete
        </Button>
      </div>

      {markup && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white">
              <Spinner label="Opening editor…" />
            </div>
          }
        >
          <AnnotationEditor
            file={markup}
            jobId={media.job_id}
            openingId={media.opening_id}
            title="Mark up photo"
            onClose={() => setMarkup(null)}
            onSaved={() => {
              setMarkup(null)
              toast('Marked-up copy saved to annotated photos')
            }}
          />
        </Suspense>
      )}
    </Sheet>
  )
}
