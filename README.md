# CWI Field App (cwi-app)

Mobile web app (PWA) for Custom Weatherstrip, Inc. — React + Vite + Tailwind, Supabase, OpenAI, Brevo, deployed on Vercel at https://cwi-app-three.vercel.app.

| Module | Route | What it does |
|---|---|---|
| 1 · Product Search | `/search` | Real-time search of the 5,336-SKU `pemko_products` catalog, add to quote |
| Jobs | `/jobs`, `/jobs/:id` | List or **Board** view (`/jobs?view=board`): need proposal → proposal out → ready → scheduled → in progress → complete. Each job: openings, photos & videos, schedule & hours, notes with attachments, tasks, quotes |
| Schedule | `/schedule` | Week and month calendar (replaces the whiteboard): job visits with time window and hours on site, appointments, days off / away |
| 2 · Drawing | `/jobs/:id/openings/:openingId` | Per opening: tape-measure sheet (or measure from a photo, beta) · photos & videos, mark-ups & sketches · Layer 3 diagram · products |
| 3 · Quotes | `/quotes`, `/quotes/:id` | Broken out by opening; Pemko products + labor/service lines; client proposal |
| 4 · CRM | `/tasks`, `/clients` | Tasks with email reminders, offline task creation |
| 5 · Users (admin) | `/admin/users` | Add, edit, deactivate users |

## One-time setup

1. **Database** — Supabase → SQL Editor → run [`supabase/setup.sql`](supabase/setup.sql), then [`002-measurement-notes.sql`](supabase/002-measurement-notes.sql), [`003-openings-notes-services.sql`](supabase/003-openings-notes-services.sql), [`004-openings-fixups.sql`](supabase/004-openings-fixups.sql), [`005-schedule-board.sql`](supabase/005-schedule-board.sql) and [`006-job-media.sql`](supabase/006-job-media.sql), in order. Deploy the app before running 005 — it renames job statuses (draft → need_proposal, active → in_progress) and older app versions still save `draft`.
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
4. **Clients** — to load the Book of Business, run `supabase/private/clients-seed.sql` in the SQL Editor. To load the printed proposal sheet (26 rows → clients plus one job each on the board), run `supabase/private/clients-sheet-seed.sql` after 005. Both are safe to re-run. That folder is git-ignored because it holds customer contact details; keep it out of GitHub.
5. **Reminder schedule** — after deploying, run [`supabase/reminder-schedule.sql`](supabase/reminder-schedule.sql) with your `CRON_SECRET` pasted in. It calls `/api/send-reminders` every 5 minutes. (Vercel's Hobby plan only allows daily cron jobs; on Vercel Pro you could use a `crons` entry in `vercel.json` instead.)

## Local development

```bash
npm install
npm run dev
```

`.env.local` needs the same variables as Vercel. `npm run dev` also serves the `/api` functions, so photo extraction works locally.

## Architecture notes

- **Site photos & videos** (`job_media`, bucket `job-media`) are a separate, fourth set: picked many at a time from the camera roll and uploaded from a queue that keeps going while you use the app (progress in the header). Per-file limit is the Supabase plan's upload limit (Free = 50 MB); after raising it in Supabase → Storage → Settings, set `VITE_MAX_UPLOAD_MB` in Vercel to match. "Mark up" saves a Layer 2 copy and leaves the original.
- **Tape-measure sheet** (`src/pages/Drawing/TapeSheet.jsx`): every standard value and condition for an opening on one screen, using the same component/dimension keys as the photo methods, so diagrams and quotes read them the same way. Shows the opening's photos at the top so the office can enter numbers from photos of the tape.
- **Three drawing photo sets, never mixed.** All drawing uploads go through `uploadLayerFile()` in `src/lib/supabase.js`, which maps layer 1 → `measurement-photos`, 2 → `annotation-photos`, 3 → `diagrams`. Storage policies allow upload and read only — Layer 1 photos can't be overwritten or deleted.
- **Measuring (Layer 1)** defaults to *Trace with card*: one photo shows the opening plus a reference card taped flat beside it (print one at `/measure-card` — 4 targets exactly 7 × 9.5 in apart). The opening's 4 corners correct the camera's perspective and the card sets the scale (`src/pages/Drawing/homography.js`), so each value comes with a ± estimate. The opening is treated as a rectangle — check diagonals with a tape. *AI read* (GPT-4o) is still available and is told the card's size.
- **Layer 3 diagrams are drawn in code** (`src/pages/Drawing/diagram.js`) from confirmed measurements and saved as PNG, so every dimension on the drawing is exactly what was confirmed.
- **AI keys stay server-side.** The browser calls `/api/extract-measurements`, which checks the Supabase session and calls GPT-4o.
- **Offline tasks** are saved to IndexedDB with their final ID and synced on reconnect; their reminders go out once synced.
- **Access control** is enforced in the database (RLS): only signed-in users with an active `app_users` row can read or write anything; only admins can change users.
- **Openings** group everything for one door or window: measurements, photos, sketches, its diagram, and its quote lines (`opening_id`). Quote lines can also sit in a job-wide General section.
- **Pricing** (Engagement Guide §3.2, extended): Proposal = Pemko material + material × multiplier (0.25 / 0.50) + labor/service lines (priced as entered, no markup) + install days × day rate.
- **Job notes** (client correspondence, general, site visit, supplier, scheduling) keep attachments in the private `job-files` bucket.
- **Job board** columns are `jobs.status` values: `need_proposal`, `proposal_out`, `ready`, `scheduled`, `in_progress`, `complete`, `lost` (hidden unless asked for). On phones one column shows at a time with a "Move to" picker on each card; on wide screens all columns sit side by side and cards drag between them.
- **Schedule** (`schedule_entries`): one row per person per day — `job` (time window + hours on site), `appointment`, or `off` (can span days via `end_date`). Booking a visit moves a job to Scheduled; logging it Done moves it to In progress. Jobs never move backward and never to Complete automatically. Hours worked = sum of Done visits.
- **Deleting**: jobs and clients — admins only (a job delete removes its openings, measurements, photos, notes, quotes and schedule entries; tasks are kept). Quotes, openings, notes, annotation photos and diagrams — any team member. Raw Layer 1 photos are only removed with their job.
