import { useEffect, useRef, useState } from 'react'
import { CloseIcon, PlusIcon } from '../../components/icons'
import { Button, ErrorMessage, Field, inputClass, Sheet } from '../../components/ui'
import { useAuth } from '../../context/auth'
import { supabase } from '../../lib/supabase'
import { toast } from '../../lib/toast'
import { must } from '../../lib/useQuery'
import { useOnlineStatus } from '../../lib/useOnlineStatus'
import {
  ATTACHMENT_ACCEPT,
  CHANNELS,
  deleteAttachments,
  formatBytes,
  MAX_FILE_BYTES,
  NOTE_CATEGORIES,
  uploadAttachment,
  USES_CHANNEL,
} from './notes'

/** "2026-09-24T14:05" in the device's time zone, for datetime-local inputs. */
function toLocalInput(date) {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Add or edit a job note with attachments. Mount only while open. */
export default function NoteForm({ jobId, note, onClose, onSaved }) {
  const { profile } = useAuth()
  const online = useOnlineStatus()
  const [form, setForm] = useState(() => ({
    category: note?.category ?? 'client_correspondence',
    channel: note?.channel ?? 'Text message',
    occurredAt: toLocalInput(note?.occurred_at ?? new Date()),
    body: note?.body ?? '',
  }))
  const [newFiles, setNewFiles] = useState([]) // [{ file, url }]
  const [removed, setRemoved] = useState([]) // existing attachments to delete
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value?.target ? value.target.value : value }))

  // After a partial failure, retry against the note already created
  const createdId = useRef(null)

  // Preview URLs for newly picked images, released when the form closes
  const previewUrls = useRef([])
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  function pickFiles(e) {
    const picked = [...(e.target.files || [])]
    e.target.value = ''
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES)
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(', ')} is over 25 MB and wasn't added.`)
    setNewFiles((list) => [
      ...list,
      ...picked
        .filter((f) => f.size <= MAX_FILE_BYTES)
        .map((file) => {
          const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
          if (url) previewUrls.current.push(url)
          return { file, url }
        }),
    ])
  }

  async function save(e) {
    e.preventDefault()
    if (!form.body.trim() && !newFiles.length && !(note?.attachments?.length - removed.length > 0)) {
      return setError('Write a note or attach a file.')
    }
    const row = {
      category: form.category,
      channel: USES_CHANNEL.includes(form.category) ? form.channel : null,
      occurred_at: new Date(form.occurredAt).toISOString(),
      body: form.body.trim() || null,
      updated_at: new Date().toISOString(),
    }
    setSaving(true)
    setError(null)
    try {
      const existingId = note?.id || createdId.current
      const saved = existingId
        ? must(await supabase.from('job_notes').update(row).eq('id', existingId).select().single())
        : must(await supabase.from('job_notes').insert({ ...row, job_id: jobId, author_id: profile.id }).select().single())
      createdId.current = saved.id
      for (const item of newFiles) {
        await uploadAttachment(jobId, saved.id, item.file)
        setNewFiles((list) => list.filter((f) => f !== item)) // uploaded — don't send twice
      }
      await deleteAttachments(removed)
      setRemoved([])
      toast(note ? 'Note updated' : 'Note added')
      onSaved?.()
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  const existing = (note?.attachments || []).filter((a) => !removed.some((r) => r.id === a.id))

  return (
    <Sheet
      open
      title={note ? 'Edit note' : 'Add note'}
      onClose={onClose}
      footer={
        <Button type="submit" form="note-form" className="w-full" disabled={saving || !online}>
          {!online ? 'Needs an internet connection' : saving ? 'Saving…' : note ? 'Save changes' : 'Add note'}
        </Button>
      }
    >
      <form id="note-form" onSubmit={save} className="space-y-4">
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Category</span>
          <div className="flex flex-wrap gap-2">
            {NOTE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => set('category')(c.value)}
                className={`min-h-11 rounded-full border px-3 text-sm font-medium ${
                  form.category === c.value ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {USES_CHANNEL.includes(form.category) && (
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">How it came in</span>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('channel')(c)}
                  className={`min-h-11 rounded-full border px-3 text-sm font-medium ${
                    form.channel === c ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="When" hint="When the message or conversation happened.">
          <input type="datetime-local" className={inputClass} value={form.occurredAt} onChange={set('occurredAt')} />
        </Field>

        <Field label="Note" hint="Paste a text or email thread here, or summarize the conversation.">
          <textarea className={`${inputClass} min-h-40`} value={form.body} onChange={set('body')} />
        </Field>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Attachments</span>
          <p className="mb-2 text-xs text-slate-500">
            Screenshots of text threads, saved emails, PDFs, photos — up to 25 MB each.
          </p>
          <input id="note-files" type="file" multiple accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={pickFiles} />
          <label
            htmlFor="note-files"
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 active:bg-slate-100"
          >
            <PlusIcon className="size-5" /> Attach files
          </label>

          {(existing.length > 0 || newFiles.length > 0) && (
            <ul className="mt-3 space-y-2">
              {existing.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1 ring-1 ring-slate-200">
                  <span className="min-w-0 flex-1 truncate text-sm">{a.file_name}</span>
                  <span className="text-xs text-slate-400">{formatBytes(a.size_bytes)}</span>
                  <button
                    type="button"
                    onClick={() => setRemoved((list) => [...list, a])}
                    className="flex size-11 items-center justify-center text-slate-400"
                    aria-label={`Remove ${a.file_name}`}
                  >
                    <CloseIcon className="size-5" />
                  </button>
                </li>
              ))}
              {newFiles.map((f, i) => (
                <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1 ring-1 ring-slate-200">
                  {f.url && <img src={f.url} alt="" className="size-10 shrink-0 rounded object-cover" />}
                  <span className="min-w-0 flex-1 truncate text-sm">{f.file.name}</span>
                  <span className="text-xs text-slate-400">{formatBytes(f.file.size)}</span>
                  <button
                    type="button"
                    onClick={() => setNewFiles((list) => list.filter((_, j) => j !== i))}
                    className="flex size-11 items-center justify-center text-slate-400"
                    aria-label={`Remove ${f.file.name}`}
                  >
                    <CloseIcon className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <ErrorMessage error={error} />
      </form>
    </Sheet>
  )
}
