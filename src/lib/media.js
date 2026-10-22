// Job photos & videos — uploaded straight from the phone's camera roll.
// A separate set from the three drawing layers: own table (job_media) and
// own bucket (job-media).
//
// Uploads run from a queue that lives outside any screen, so people can pick
// 20 photos and keep using the app while they go up. Progress shows in the
// app header (see UploadStatus).

import { useEffect, useState } from 'react'
import { removeFiles, supabase } from './supabase'
import { must, mustDelete } from './useQuery'

export const MEDIA_BUCKET = 'job-media'
export const MEDIA_ACCEPT = 'image/*,video/*'
export const MEDIA_SELECT = '*, uploader:uploaded_by(full_name), opening:opening_id(id, opening_name)'

/** Per-file limit. Supabase Free allows 50 MB; raise with VITE_MAX_UPLOAD_MB on a paid plan. */
export const MAX_UPLOAD_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 50
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024
const PARALLEL = 2

export const MEDIA_CHANGED_EVENT = 'cwi:media-changed'

export const mediaKind = (file) => ((file.type || '').startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name) ? 'video' : 'photo')
const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file'

// ---------------------------------------------------------------------
// Upload queue (module-level store)
// ---------------------------------------------------------------------

let items = []
const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn(items))
const patch = (id, change) => {
  items = items.map((it) => (it.id === id ? { ...it, ...change } : it))
  emit()
}

/** Live view of the queue. */
export function useUploads() {
  const [state, setState] = useState(items)
  useEffect(() => {
    listeners.add(setState)
    setState(items)
    return () => listeners.delete(setState)
  }, [])
  return state
}

/** Add files to the queue. Returns how many were accepted. */
export function enqueueMedia({ jobId, openingId = null, files, uploadedBy = null }) {
  const added = [...files].map((file) => {
    const tooBig = file.size > MAX_UPLOAD_BYTES
    return {
      id: crypto.randomUUID(),
      jobId,
      openingId,
      uploadedBy,
      file,
      name: file.name,
      kind: mediaKind(file),
      size: file.size,
      progress: 0,
      status: tooBig ? 'error' : 'queued',
      error: tooBig
        ? `${(file.size / 1024 / 1024).toFixed(0)} MB is over the ${MAX_UPLOAD_MB} MB limit. Trim the video or record at 1080p.`
        : null,
    }
  })
  items = [...items, ...added]
  emit()
  pump()
  return added.filter((a) => a.status === 'queued').length
}

export function retryUpload(id) {
  const it = items.find((i) => i.id === id)
  if (!it || it.status !== 'error' || it.file.size > MAX_UPLOAD_BYTES) return
  patch(id, { status: 'queued', progress: 0, error: null })
  pump()
}

/** Clear finished and failed uploads from the list. */
export function clearFinished() {
  items = items.filter((i) => i.status === 'queued' || i.status === 'uploading')
  emit()
}

function pump() {
  while (items.filter((i) => i.status === 'uploading').length < PARALLEL) {
    const next = items.find((i) => i.status === 'queued')
    if (!next) return
    patch(next.id, { status: 'uploading' })
    uploadOne(next).then(
      () => {
        patch(next.id, { status: 'done', progress: 1, file: null })
        window.dispatchEvent(new CustomEvent(MEDIA_CHANGED_EVENT, { detail: { jobId: next.jobId } }))
        pump()
      },
      (err) => {
        patch(next.id, { status: 'error', error: err.message || 'Upload failed' })
        pump()
      },
    )
  }
}

/**
 * Upload with progress. supabase-js uploads with fetch, which can't report
 * progress, so this posts to the same Storage endpoint with XHR.
 */
async function putObject(path, file, onProgress) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Signed out — sign in again, then retry.')
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = `Upload failed (${xhr.status})`
      try {
        message = JSON.parse(xhr.responseText).message || message
      } catch {
        // keep the status message
      }
      if (xhr.status === 413 || /maximum allowed size/i.test(message)) {
        message = `Too large for the storage plan's upload limit. Trim the video or record at 1080p.`
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Connection lost — tap Retry when you have signal.'))
    xhr.send(file)
  })
}

async function uploadOne(item) {
  const path = `${item.jobId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName(item.name)}`
  await putObject(path, item.file, (p) => patch(item.id, { progress: Math.min(p, 0.99) }))
  const { error } = await supabase.from('job_media').insert({
    job_id: item.jobId,
    opening_id: item.openingId,
    media_type: item.kind,
    storage_path: path,
    file_name: item.name,
    content_type: item.file.type || null,
    size_bytes: item.size,
    uploaded_by: item.uploadedBy,
  })
  if (error) {
    await removeFiles(MEDIA_BUCKET, [path]).catch(() => {})
    throw error
  }
}

// Leaving the page mid-upload loses the rest — warn first
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (items.some((i) => i.status === 'queued' || i.status === 'uploading')) e.preventDefault()
  })
}

// ---------------------------------------------------------------------
// Reading and changing saved media
// ---------------------------------------------------------------------

/** Reload a gallery whenever an upload for its job finishes. */
export function useMediaChanged(jobId, reload) {
  useEffect(() => {
    const onChange = (e) => e.detail?.jobId === jobId && reload()
    window.addEventListener(MEDIA_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(MEDIA_CHANGED_EVENT, onChange)
  }, [jobId, reload])
}

export async function deleteMedia(media) {
  mustDelete(await supabase.from('job_media').delete().eq('id', media.id).select('id'), 'this file')
  await removeFiles(MEDIA_BUCKET, [media.storage_path]).catch(() => {})
}

export async function updateMedia(id, change) {
  return must(await supabase.from('job_media').update(change).eq('id', id).select(MEDIA_SELECT).single())
}
