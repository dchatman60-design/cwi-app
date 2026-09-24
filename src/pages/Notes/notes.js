import { JOB_FILES_BUCKET, removeFiles, supabase } from '../../lib/supabase'
import { must, mustDelete } from '../../lib/useQuery'

export const NOTE_CATEGORIES = [
  { value: 'client_correspondence', label: 'Client correspondence', tone: 'blue' },
  { value: 'general', label: 'General note', tone: 'slate' },
  { value: 'site_visit', label: 'Site visit', tone: 'green' },
  { value: 'supplier', label: 'Supplier / vendor', tone: 'amber' },
  { value: 'scheduling', label: 'Scheduling', tone: 'redSoft' },
]

export const CHANNELS = ['Text message', 'Email', 'Phone call', 'In person']

/** Categories where "how did it come in?" matters. */
export const USES_CHANNEL = ['client_correspondence', 'supplier', 'scheduling']

export const ATTACHMENT_ACCEPT = 'image/*,application/pdf,.eml,.msg,.txt,.doc,.docx,.xls,.xlsx,.csv'
export const MAX_FILE_BYTES = 25 * 1024 * 1024

export const NOTE_SELECT = '*, author:author_id(full_name), attachments:job_note_attachments(*)'

export function categoryInfo(value) {
  return NOTE_CATEGORIES.find((c) => c.value === value) || NOTE_CATEGORIES[1]
}

export const isImage = (attachment) => (attachment.content_type || '').startsWith('image/')

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file'

/** Upload one file for a note and record it. */
export async function uploadAttachment(jobId, noteId, file) {
  const path = `${jobId}/${noteId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(file.name)}`
  const { error } = await supabase.storage
    .from(JOB_FILES_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`${file.name}: ${error.message}`)
  must(
    await supabase.from('job_note_attachments').insert({
      note_id: noteId,
      job_id: jobId,
      storage_path: path,
      file_name: file.name,
      content_type: file.type || null,
      size_bytes: file.size,
    }),
  )
}

export async function deleteAttachments(attachments) {
  if (!attachments.length) return
  must(
    await supabase
      .from('job_note_attachments')
      .delete()
      .in(
        'id',
        attachments.map((a) => a.id),
      ),
  )
  await removeFiles(
    JOB_FILES_BUCKET,
    attachments.map((a) => a.storage_path),
  ).catch(() => {})
}

export async function deleteNote(note) {
  mustDelete(await supabase.from('job_notes').delete().eq('id', note.id).select('id'), 'this note')
  await removeFiles(
    JOB_FILES_BUCKET,
    (note.attachments || []).map((a) => a.storage_path),
  ).catch(() => {})
}

export function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
