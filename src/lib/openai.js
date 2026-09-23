// Browser-side wrapper for the app's AI features. It never talks to OpenAI
// directly: requests go to our Vercel functions in /api, which hold the
// OpenAI key server-side.

import { photoToCanvas } from './photos'
import { supabase } from './supabase'

// OpenAI scales high-detail images down to fit 2048×2048 anyway, so sending
// more pixels only slows the upload. The raw full-size photo is stored
// separately, unmodified, in the measurement-photos bucket via uploadLayerFile().
const MAX_EDGE = 2048
const JPEG_QUALITY = 0.9

async function resizeForAnalysis(file) {
  const canvas = await photoToCanvas(file, MAX_EDGE)
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
}

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You are signed out. Sign in again to continue.')
  return { Authorization: `Bearer ${token}` }
}

/**
 * Send one Layer 1 photo to GPT-4o Vision for measurement extraction.
 *
 * @param {File} file        The photo from the camera input.
 * @param {string} component What Mike says he photographed, e.g. "Head jamb".
 * @param {string} [reference] Description of a reference card in the photo, for scale.
 * @returns {Promise<{ component: string, measurements: { dimension: string, value: number, unit: string, confidence: number }[], notes: string }>}
 */
export async function extractMeasurements(file, component, reference) {
  if (!navigator.onLine) {
    throw new Error('Measurement extraction needs an internet connection.')
  }

  const image = await resizeForAnalysis(file)

  const response = await fetch('/api/extract-measurements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ image, component, reference }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Measurement extraction failed (HTTP ${response.status}).`)
  }
  return body
}
