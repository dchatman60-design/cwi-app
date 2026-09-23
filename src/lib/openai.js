// Browser-side wrapper for the app's AI features. It never talks to OpenAI
// directly: requests go to our Vercel functions in /api, which hold the
// OpenAI key server-side.

import { supabase } from './supabase'

// OpenAI scales high-detail images down to fit 2048×2048 anyway, so sending
// more pixels only slows the upload. The raw full-size photo is stored
// separately, unmodified, in the measurement-photos bucket via uploadLayerFile().
const MAX_EDGE = 2048
const JPEG_QUALITY = 0.9

async function resizeForAnalysis(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
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
 * @param {string} component What Mike says he photographed, e.g. "head_jam".
 * @returns {Promise<{ component: string, measurements: { dimension: string, value: number, unit: string, confidence: number }[], notes: string }>}
 */
export async function extractMeasurements(file, component) {
  if (!navigator.onLine) {
    throw new Error('Measurement extraction needs an internet connection.')
  }

  const image = await resizeForAnalysis(file)

  const response = await fetch('/api/extract-measurements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ image, component }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Measurement extraction failed (HTTP ${response.status}).`)
  }
  return body
}
