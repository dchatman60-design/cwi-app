import { bucketForLayer, JOB_FILES_BUCKET, removeFiles, supabase } from './supabase'
import { must, mustDelete } from './useQuery'

/**
 * Permanently delete a job (admins only): its openings, measurements,
 * photos, notes and attachments, and its quotes. Linked tasks are kept.
 */
export async function deleteJob(jobId) {
  // Collect what to clean up first — the rows that point to it are about to go
  const [photos, attachments, quotes] = await Promise.all([
    supabase.from('job_photos').select('layer, storage_path').eq('job_id', jobId).then(must),
    supabase.from('job_note_attachments').select('storage_path').eq('job_id', jobId).then(must),
    supabase.from('quotes').select('id').eq('job_id', jobId).then(must),
  ])

  // The job goes first: if this user isn't allowed, nothing else is touched
  mustDelete(await supabase.from('jobs').delete().eq('id', jobId).select('id'), 'this job')
  if (quotes.length) {
    must(
      await supabase
        .from('quotes')
        .delete()
        .in('id', quotes.map((q) => q.id)),
    )
  }

  // Then clear the stored files. A failure here only leaves unused files behind.
  const byBucket = {}
  for (const p of photos) (byBucket[bucketForLayer(p.layer)] ||= []).push(p.storage_path)
  if (attachments.length) byBucket[JOB_FILES_BUCKET] = attachments.map((a) => a.storage_path)
  for (const [bucket, paths] of Object.entries(byBucket)) {
    try {
      await removeFiles(bucket, paths)
    } catch (err) {
      console.error(`Could not remove ${paths.length} file(s) from ${bucket}`, err)
    }
  }
}
