import { useState } from 'react'
import { clearFinished, retryUpload, useUploads } from '../lib/media'

/** Header strip showing photo/video uploads in progress, on every screen. */
export default function UploadStatus() {
  const uploads = useUploads()
  const [open, setOpen] = useState(false)
  if (!uploads.length) return null

  const active = uploads.filter((u) => u.status === 'queued' || u.status === 'uploading')
  const failed = uploads.filter((u) => u.status === 'error')
  const done = uploads.filter((u) => u.status === 'done')
  const totalBytes = uploads.reduce((s, u) => s + u.size, 0) || 1
  const sentBytes = uploads.reduce((s, u) => s + (u.status === 'error' ? 0 : u.size * u.progress), 0)
  const pct = Math.round((sentBytes / totalBytes) * 100)

  const tone = active.length ? 'bg-blue-700' : failed.length ? 'bg-red-700' : 'bg-green-700'
  const summary = active.length
    ? `Uploading ${done.length + 1} of ${uploads.length - failed.length} · ${pct}% — keep the app open`
    : failed.length
      ? `${failed.length} upload${failed.length === 1 ? '' : 's'} failed`
      : `${done.length} uploaded`

  return (
    <div className={`${tone} text-sm text-white`} role="status">
      <div className="flex min-h-11 items-center gap-2 px-4">
        <button type="button" className="min-h-11 min-w-0 flex-1 truncate text-left font-medium" onClick={() => setOpen((o) => !o)}>
          {summary} <span className="opacity-75">{open ? '▴' : '▾'}</span>
        </button>
        {!active.length && (
          <button type="button" className="min-h-11 shrink-0 px-2 font-semibold underline" onClick={clearFinished}>
            Dismiss
          </button>
        )}
      </div>
      {active.length > 0 && (
        <div className="h-1 bg-white/25">
          <div className="h-1 bg-white transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {open && (
        <ul className="max-h-64 divide-y divide-white/15 overflow-y-auto bg-black/15 px-4">
          {uploads.map((u) => (
            <li key={u.id} className="flex min-h-11 items-center gap-2 py-1">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{u.name}</span>
                {u.error && <span className="block text-xs opacity-90">{u.error}</span>}
              </span>
              {u.status === 'error' ? (
                <button type="button" className="min-h-11 shrink-0 px-2 font-semibold underline" onClick={() => retryUpload(u.id)}>
                  Retry
                </button>
              ) : (
                <span className="shrink-0 tabular-nums opacity-90">
                  {u.status === 'done' ? '✓' : u.status === 'queued' ? 'Waiting' : `${Math.round(u.progress * 100)}%`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
