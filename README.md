# CWI Field App (cwi-app)

Mobile web app (PWA) for Custom Weatherstrip, Inc. — React + Vite + Tailwind, Supabase, OpenAI, Brevo, deployed on Vercel at https://cwi-app-three.vercel.app.

| Module | Route | What it does |
|---|---|---|
| 1 · Product Search | `/search` | Real-time search of the 5,336-SKU `pemko_products` catalog, add to quote |
| 2 · Drawing | `/jobs/:id` | Layer 1 CV measurement capture · Layer 2 photo annotation · Layer 3 technical diagram |
| 3 · Quotes | `/quotes`, `/quotes/:id` | Takeoff from confirmed measurements, pricing, client proposal |
| 4 · CRM | `/tasks`, `/clients` | Tasks with email reminders, offline task creation |
| 5 · Users (admin) | `/admin/users` | Add, edit, deactivate users |

## One-time setup

1. **Database** — Supabase → SQL Editor → run [`supabase/setup.sql`](supabase/setup.sql).
   First edit section 5 at the bottom to add Mike (and yourself). Everyone who signs in needs a row in `app_users`.
2. **Sign-in emails** — Supabase → Authentication:
   - **Emails → Templates**: in both **Magic Link** and **Confirm signup**, add the code to the body, e.g. `<p>Your CWI Field App sign-in code: <strong>{{ .Token }}</strong></p>`. The app signs people in with this code (links open in Safari, not the installed iPhone app).
   - **Emails → SMTP Settings**: turn on custom SMTP with Brevo — host `smtp-relay.brevo.com`, port `587`, username = your Brevo SMTP login, password = a Brevo **SMTP key** (Brevo → SMTP & API → SMTP). Supabase's built-in email is heavily rate-limited and meant for testing only.
   - **URL Configuration**: Site URL `https://cwi-app-three.vercel.app`; Redirect URLs `https://cwi-app-three.vercel.app/**` and `http://localhost:5173/**`.
3. **Vercel environment variables** (Settings → Environment Variables), then redeploy:

   | Variable | Visible to | Notes |
   |---|---|---|
   | `VITE_SUPABASE_URL` | browser + server | |
   | `VITE_SUPABASE_ANON_KEY` | browser + server | Supabase **publishable** key |
   | `OPENAI_API_KEY` | server only | Photo measurement extraction |
   | `SUPABASE_SECRET_KEY` | server only | Supabase **secret** key — reminder job only |
   | `BREVO_API_KEY` | server only | Reminder emails |
   | `REMINDER_FROM_EMAIL` | server only | Must be a verified sender in Brevo |
   | `REMINDER_FROM_NAME` | server only | Optional (default "CWI Task Reminders") |
   | `CRON_SECRET` | server only | Any long random string, e.g. `openssl rand -hex 32` |

   Never give a secret a `VITE_` prefix — Vite ships every `VITE_` variable to the browser.
4. **Reminder schedule** — after deploying, run [`supabase/reminder-schedule.sql`](supabase/reminder-schedule.sql) with your `CRON_SECRET` pasted in. It calls `/api/send-reminders` every 5 minutes. (Vercel's Hobby plan only allows daily cron jobs; on Vercel Pro you could use a `crons` entry in `vercel.json` instead.)

## Local development

```bash
npm install
npm run dev
```

`.env.local` needs the same variables as Vercel. `npm run dev` also serves the `/api` functions, so photo extraction works locally.

## Architecture notes

- **Three photo sets, never mixed.** All drawing uploads go through `uploadLayerFile()` in `src/lib/supabase.js`, which maps layer 1 → `measurement-photos`, 2 → `annotation-photos`, 3 → `diagrams`. Storage policies allow upload and read only — Layer 1 photos can't be overwritten or deleted.
- **Layer 3 diagrams are drawn in code** (`src/pages/Drawing/diagram.js`) from confirmed measurements and saved as PNG, so every dimension on the drawing is exactly what was confirmed.
- **AI keys stay server-side.** The browser calls `/api/extract-measurements`, which checks the Supabase session and calls GPT-4o.
- **Offline tasks** are saved to IndexedDB with their final ID and synced on reconnect; their reminders go out once synced.
- **Access control** is enforced in the database (RLS): only signed-in users with an active `app_users` row can read or write anything; only admins can change users.
- **Pricing** (Engagement Guide §3.2): Proposal = material + material × multiplier (0.25 / 0.50) + install days × day rate.
