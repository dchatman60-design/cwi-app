// Vercel serverless function: GET /api/send-reminders
//
// Emails task reminders that are due, via Brevo. Runs every 5 minutes —
// triggered by Supabase pg_cron (supabase/reminder-schedule.sql), or by
// Vercel Cron on a Pro plan. Callers must send: Authorization: Bearer <CRON_SECRET>.
//
// Server-only environment variables (no VITE_ prefix):
//   CRON_SECRET          shared secret for the scheduler
//   SUPABASE_SECRET_KEY  Supabase secret (service role) key — reads/updates tasks past RLS
//   BREVO_API_KEY        Brevo transactional email key
//   REMINDER_FROM_EMAIL  a sender address verified in Brevo
//   REMINDER_FROM_NAME   optional, defaults to "CWI Task Reminders"
//   APP_URL              optional, defaults to https://cwi-app-three.vercel.app

import { createClient } from '@supabase/supabase-js'

const APP_URL = (process.env.APP_URL || 'https://cwi-app-three.vercel.app').replace(/\/$/, '')
const BATCH_SIZE = 50

const REQUIRED_ENV = ['CRON_SECRET', 'VITE_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'BREVO_API_KEY', 'REMINDER_FROM_EMAIL']

function json(body, status = 200) {
  return Response.json(body, { status })
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function formatDue(dueDate, dueTime) {
  const [y, m, d] = dueDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  if (!dueTime) return date
  const [hh, mm] = dueTime.split(':').map(Number)
  return `${date} at ${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`
}

function buildEmail(task) {
  const link = `${APP_URL}/tasks/${task.id}`
  const clientName = task.client?.client_name || task.job?.client?.client_name || '—'
  const jobAddress = task.job?.site_address || '—'
  const due = formatDue(task.due_date, task.due_time)

  const rows = [
    ['Task type', task.task_type],
    ['Title', task.title],
    ['Client', clientName],
    ['Job address', jobAddress],
    ['Due', due],
    ['Priority', task.priority],
    ['Notes', task.notes || '—'],
  ]

  const subject = `[${task.priority}] Task Reminder — ${task.task_type}: ${task.title}`

  const htmlContent = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0">
    <tr><td style="padding:24px 24px 8px">
      <div style="font-size:12px;letter-spacing:2px;color:#64748b;font-weight:bold">CUSTOM WEATHERSTRIP · TASK REMINDER</div>
      <h1 style="margin:8px 0 0;font-size:22px">${esc(task.title)}</h1>
    </td></tr>
    <tr><td style="padding:8px 24px">
      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:15px">
        ${rows
          .map(
            ([label, value]) =>
              `<tr><td style="padding:8px 12px 8px 0;color:#64748b;vertical-align:top;white-space:nowrap">${esc(label)}</td><td style="padding:8px 0;white-space:pre-wrap">${esc(value)}</td></tr>`,
          )
          .join('')}
      </table>
    </td></tr>
    <tr><td style="padding:16px 24px 24px">
      <a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open task</a>
      <div style="margin-top:12px;font-size:12px;color:#64748b">${esc(link)}</div>
    </td></tr>
  </table>
</body></html>`

  const textContent = `${subject}\n\n${rows.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nOpen task: ${link}\n`

  return { subject, htmlContent, textContent }
}

async function sendWithBrevo(task) {
  const { subject, htmlContent, textContent } = buildEmail(task)
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: {
        email: process.env.REMINDER_FROM_EMAIL,
        name: process.env.REMINDER_FROM_NAME || 'CWI Task Reminders',
      },
      to: [{ email: task.assignee.email, name: task.assignee.full_name || undefined }],
      subject,
      htmlContent,
      textContent,
    }),
  })
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${await response.text()}`)
}

export async function GET(request) {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.includes('CRON_SECRET')) return json({ error: 'Server is missing CRON_SECRET.' }, 500)
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401)
  }
  if (missing.length) return json({ error: `Server is missing: ${missing.join(', ')}` }, 500)

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: dueTasks, error } = await supabase
    .from('tasks')
    .select(
      `id, task_type, title, notes, due_date, due_time, priority,
       assignee:assigned_to(full_name, email, is_active),
       client:client_id(client_name),
       job:job_id(site_address, client:client_id(client_name))`,
    )
    .eq('reminder_sent', false)
    .lte('reminder_scheduled_at', new Date().toISOString())
    .in('status', ['Open', 'In Progress'])
    .order('reminder_scheduled_at')
    .limit(BATCH_SIZE)

  if (error) {
    console.error('Could not load due reminders:', error)
    return json({ error: error.message }, 500)
  }

  const result = { due: dueTasks.length, sent: 0, skipped: 0, failed: 0 }

  for (const task of dueTasks) {
    // Claim the task first so two overlapping runs can never double-send
    const { data: claimed, error: claimError } = await supabase
      .from('tasks')
      .update({ reminder_sent: true })
      .eq('id', task.id)
      .eq('reminder_sent', false)
      .select('id')
    if (claimError || !claimed?.length) continue

    if (!task.assignee?.email || !task.assignee.is_active) {
      console.warn(`Task ${task.id}: no active assignee with an email — reminder skipped`)
      result.skipped++
      continue
    }

    try {
      await sendWithBrevo(task)
      result.sent++
    } catch (err) {
      console.error(`Task ${task.id}: reminder failed —`, err.message)
      result.failed++
      // Release the claim so the next run retries
      await supabase.from('tasks').update({ reminder_sent: false }).eq('id', task.id)
    }
  }

  return json(result)
}

export const POST = GET
