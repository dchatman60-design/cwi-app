import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (local) and in Vercel → Settings → Environment Variables (production).'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// ---------------------------------------------------------------------------
// Drawing module storage — THREE SEPARATE PHOTO SETS, NEVER MIXED.
// Each layer maps to exactly one bucket and one job_photos.photo_type.
// All uploads must go through uploadLayerFile() so a file can never land
// in another layer's bucket.
// ---------------------------------------------------------------------------
export const LAYERS = {
  1: { bucket: 'measurement-photos', photoType: 'cv_capture' }, // raw CV captures, never modified
  2: { bucket: 'annotation-photos', photoType: 'annotation' }, // separate annotated site photos
  3: { bucket: 'diagrams', photoType: 'diagram' }, // AI-generated diagrams, no photo taken
}

function layerConfig(layer) {
  const config = LAYERS[layer]
  if (!config) throw new Error(`Invalid drawing layer: ${layer}. Must be 1, 2, or 3.`)
  return config
}

/**
 * Upload a file (File or Blob) for a job — and optionally one of its
 * openings — into the bucket that belongs to `layer`, and record it in
 * job_photos. Returns the job_photos row.
 *
 * Layer 1 photos are uploaded with upsert: false so an existing raw
 * measurement photo can never be overwritten.
 */
export async function uploadLayerFile(layer, jobId, file, extension = 'jpg', openingId = null) {
  const { bucket, photoType } = layerConfig(layer)
  const storagePath = `${jobId}/${Date.now()}-${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file, {
      contentType: file.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data, error: insertError } = await supabase
    .from('job_photos')
    .insert({ job_id: jobId, photo_type: photoType, storage_path: storagePath, layer, ...(openingId && { opening_id: openingId }) })
    .select()
    .single()
  if (insertError) throw insertError

  return data
}

/**
 * All buckets are private, so files must be opened through a short-lived
 * signed URL rather than a public URL.
 */
export async function getSignedFileUrl(bucket, storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export function getSignedUrl(layer, storagePath, expiresInSeconds = 3600) {
  return getSignedFileUrl(layerConfig(layer).bucket, storagePath, expiresInSeconds)
}

export function bucketForLayer(layer) {
  return layerConfig(layer).bucket
}

// Note attachments (emails, screenshots, text threads) — kept apart from drawings
export const JOB_FILES_BUCKET = 'job-files'

/** Delete storage files, in batches. */
export async function removeFiles(bucket, paths) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}
