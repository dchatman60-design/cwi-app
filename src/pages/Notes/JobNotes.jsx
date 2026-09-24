import { useState } from 'react'
import { EditIcon, PlusIcon, TrashIcon } from '../../components/icons'
import SignedImage from '../../components/SignedImage'
import { Badge, Button, Card, EmptyState, ErrorMessage, Spinner } from '../../components/ui'
import { formatDateTime } from '../../lib/format'
import { getSignedFileUrl, JOB_FILES_BUCKET, supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must, useQuery } from '../../lib/useQuery'
import NoteForm from './NoteForm'
import { categoryInfo, deleteNote, formatBytes, isImage, NOTE_CATEGORIES, NOTE_SELECT } from './notes'

/** A non-image attachment as a download link (signed on demand). */
function FileLink({ attachment }) {
  const { data: url } = useQuery(`job-file:${attachment.storage_path}`, () =>
    getSignedFileUrl(JOB_FILES_BUCKET, attachment.storage_path),
  )
  return (
    <a
      href={url || undefined}
      target="_blank"
      rel="noreferrer"
      download={attachment.file_name || true}
      className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-50 px-3 text-sm ring-1 ring-slate-200"
    >
      <span className="min-w-0 flex-1 truncate font-medium text-blue-700">{attachment.file_name || 'File'}</span>
      <span className="shrink-0 text-xs text-slate-400">{formatBytes(attachment.size_bytes)}</span>
    </a>
  )
}

/** The job's running record: client correspondence, site visits, supplier calls… */
export default function JobNotes({ jobId }) {
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null) // null | 'new' | note

  const { data: notes, error, loading, reload } = useQuery(`job-notes:${jobId}`, async () =>
    must(await supabase.from('job_notes').select(NOTE_SELECT).eq('job_id', jobId).order('occurred_at', { ascending: false })),
  )
  const shown = (notes || []).filter((n) => filter === 'all' || n.category === filter)

  async function remove(note) {
    if (!window.confirm('Delete this note and its attachments?')) return
    try {
      await deleteNote(note)
      toast('Note deleted')
      reload()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <Button className="min-h-14 w-full" onClick={() => setEditing('new')}>
        <PlusIcon className="size-5" /> Add note
      </Button>

      <div className="flex flex-wrap gap-2">
        {[{ value: 'all', label: 'All' }, ...NOTE_CATEGORIES].map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setFilter(c.value)}
            className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
              filter === c.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'
            }`}
          >
            {c.label}
            {c.value !== 'all' && notes ? ` (${notes.filter((n) => n.category === c.value).length})` : ''}
          </button>
        ))}
      </div>

      <ErrorMessage error={error} />
      {loading && !notes && <Spinner />}
      {notes && shown.length === 0 && (
        <EmptyState title={filter === 'all' ? 'No notes yet' : 'No notes in this category'}>
          Log texts, emails and calls with the client, site visits and supplier updates — with screenshots attached.
        </EmptyState>
      )}

      {shown.map((note) => {
        const cat = categoryInfo(note.category)
        const images = (note.attachments || []).filter(isImage)
        const files = (note.attachments || []).filter((a) => !isImage(a))
        return (
          <Card key={note.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={cat.tone}>{cat.label}</Badge>
                  {note.channel && <span className="text-sm text-slate-500">{note.channel}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDateTime(note.occurred_at)}
                  {note.author?.full_name && ` · ${note.author.full_name}`}
                </div>
              </div>
              <div className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(note)}
                  className="flex size-11 items-center justify-center text-slate-500"
                  aria-label="Edit note"
                >
                  <EditIcon className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(note)}
                  className="flex size-11 items-center justify-center text-slate-400"
                  aria-label="Delete note"
                >
                  <TrashIcon className="size-5" />
                </button>
              </div>
            </div>

            {note.body && <p className="mt-2 text-sm break-words whitespace-pre-wrap text-slate-800">{note.body}</p>}

            {images.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {images.map((a) => (
                  <SignedImage
                    key={a.id}
                    bucket={JOB_FILES_BUCKET}
                    path={a.storage_path}
                    alt={a.file_name}
                    className="aspect-square w-full rounded-lg object-cover"
                    link
                  />
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                {files.map((a) => (
                  <FileLink key={a.id} attachment={a} />
                ))}
              </div>
            )}
          </Card>
        )
      })}

      {editing && (
        <NoteForm jobId={jobId} note={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />
      )}
    </div>
  )
}
