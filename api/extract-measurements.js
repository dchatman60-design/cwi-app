// Vercel serverless function: POST /api/extract-measurements
//
// Runs GPT-4o Vision on one Layer 1 measurement photo and returns the
// extracted values for Mike to review. The OpenAI key lives only here
// (OPENAI_API_KEY — no VITE_ prefix) so it is never shipped to the browser.
// Callers must send a valid Supabase session token.

import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'

const MODEL = 'gpt-4o'

// A 2048px JPEG is well under this; Vercel rejects request bodies over 4.5 MB.
const MAX_IMAGE_CHARS = 4_000_000

const SYSTEM_PROMPT = `You are a precision measurement extraction tool. Analyze this photo of a door/window component and extract all visible measurements. Return a JSON object with: { component: string, measurements: [{ dimension: string, value: number, unit: string, confidence: number }], notes: string }

Rules:
- Prefer inches. Give values as decimal numbers (35.75, not 35 3/4) and set unit to "in".
- confidence is a number from 0 to 1 for how sure you are of that one value.
- Only report dimensions you can actually read or reliably derive from the photo (tape measure, ruler, printed labels, known reference objects). Never invent a value. If nothing is measurable, return an empty measurements array and say why in notes.
- Use notes for condition observations (good, worn, damaged, missing) and anything that should be double-checked on site.`

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'measurement_extraction',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        component: { type: 'string' },
        measurements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string' },
              value: { type: 'number' },
              unit: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['dimension', 'value', 'unit', 'confidence'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string' },
      },
      required: ['component', 'measurements', 'notes'],
      additionalProperties: false,
    },
  },
}

function json(body, status = 200) {
  return Response.json(body, { status })
}

async function isSignedIn(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return false

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  return !error && Boolean(data?.user)
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return json({ error: 'Server is missing OPENAI_API_KEY.' }, 500)
  }

  if (!(await isSignedIn(request))) {
    return json({ error: 'Your session has expired. Please sign in again.' }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const { image, component } = body ?? {}
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return json({ error: 'Expected a JPEG, PNG, or WebP image.' }, 400)
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return json({ error: 'Photo is too large to analyze.' }, 413)
  }

  const componentHint =
    typeof component === 'string' && component.trim()
      ? component.trim().slice(0, 100)
      : 'not specified'

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let completion
  try {
    completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Component being photographed: ${componentHint}` },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    })
  } catch (err) {
    console.error('OpenAI request failed:', err)
    return json({ error: 'The measurement service is unavailable. Please try again.' }, 502)
  }

  const message = completion.choices[0]?.message
  if (message?.refusal) {
    return json({ error: `The photo could not be analyzed: ${message.refusal}` }, 422)
  }

  let result
  try {
    result = JSON.parse(message?.content ?? '')
  } catch {
    console.error('Unparseable OpenAI response:', message?.content)
    return json({ error: 'The measurement service returned an unreadable result.' }, 502)
  }

  result.measurements = result.measurements.map((m) => ({
    ...m,
    confidence: Math.min(1, Math.max(0, m.confidence)),
  }))

  return json(result)
}
