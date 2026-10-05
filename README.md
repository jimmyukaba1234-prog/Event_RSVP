# 80th Birthday RSVP

A small, production-style RSVP web app built for Stephen Raymond Dapaa-Addo, Esq.'s 80th birthday celebration — a public invitation/RSVP page for guests, plus an admin dashboard for the organizer to view and export responses.

## What it does

Guests visit a public page, see the invitation and event details, and submit their name, email, and attendance status (attending / maybe / not attending). Responses are stored in a Supabase PostgreSQL database, and each guest automatically gets a confirmation email with a QR code check-in ticket. The organizer can then view a live dashboard of all responses — totals by status, a searchable/filterable guest list, CSV export, and on the event day, a live "checked in" count as guests arrive and their QR code is scanned.

## Features

- Elegant, mobile-first invitation page with the real invitation image as the centerpiece
- RSVP form with client-side validation, loading state, and a no-reload success message
- Automatic confirmation email (with a QR code check-in ticket) sent right after RSVP
- Door check-in: scanning/opening the QR code marks the guest checked-in in real time; manual check-in from the admin table also available
- Admin dashboard: live counts (including checked-in), search, status filter, refresh, CSV export, "send to pending guests" email backfill, mobile-friendly sidebar
- All data stored in Supabase PostgreSQL with Row Level Security (RLS) enforced

## Tech stack

- HTML, CSS, vanilla JavaScript — no frontend framework, no build step
- Supabase (PostgreSQL + Auto-generated REST API + Edge Functions)
- Four Supabase Edge Functions (Deno/TypeScript): admin data read, confirmation email (single + batch), and check-in
- SendGrid (transactional email API) for confirmation emails
- Supabase JS client loaded via CDN `<script>` tag (no npm/bundler needed)

## Architecture

```
Guest browser   →  Supabase REST API (anon key)        →  rsvps table   [INSERT only]
Guest browser   →  Edge Function (send-confirmation)    →  rsvps table + SendGrid  [email this one new guest]
Guest's phone   →  Edge Function (checkin)               →  rsvps table   [mark checked_in, via QR link]
Admin browser   →  Edge Function (admin-rsvps)           →  rsvps table   [SELECT, via service_role, server-side only]
Admin browser   →  Edge Function (send-pending-confirmations)  →  rsvps table + SendGrid  [email everyone still pending]
```

The public page and the admin dashboard never talk to the database the same way:

- **Guests** use the public **anon key** directly from the browser to `INSERT` a row. That's the only thing the anon key is allowed to do on this table.
- Right after a successful insert, the browser also calls **`send-confirmation`** with the new guest's id (generated client-side, since the anon key can't read the row back to discover it) — this is fire-and-forget; email failures never block or affect the guest's already-successful RSVP.
- **Admin** reads go through **`admin-rsvps`**, and the "Send to Pending Guests" button calls **`send-pending-confirmations`** — both are the only places that hold the privileged `service_role` key. The browser never sees it.
- **Check-in** (scanning a guest's QR code, or the manual "Check In" button in the admin table) calls **`checkin`**, also backed by `service_role`.

## Security approach (read this before reusing this pattern elsewhere)

- **Row Level Security (RLS) is enabled** on the `rsvps` table with exactly one policy: `anon` can `INSERT`. There is **no SELECT policy** for `anon` or `authenticated` — so the public anon key (the one embedded in frontend code) can write a row but can never read any row back, including the one it just inserted. Verified directly against the live database: anon `SELECT` returns `200, []` (empty, not an error); anon `INSERT` returns `201`.
- **The Edge Function (`admin-rsvps`) uses `service_role`**, which bypasses RLS entirely, to read all RSVP data for the dashboard. The `service_role` key only ever exists as a Supabase Edge Function environment secret — it is never present in any file shipped to the browser, never committed to this repo, and never appears in any frontend JavaScript.
- **The admin dashboard has no login/authentication.** This was a deliberate decision for this short-lived event, not an oversight: anyone who has the `admin.html` URL or the Edge Function URL can view guest names, emails, and attendance status. CORS on the Edge Function only restricts which *browser origins* can call it — it does nothing against a direct `curl`/script request. If you reuse this project for something with more sensitive data or a longer-lived dashboard, add real authentication (e.g. Supabase Auth) in front of the admin page and switch the Edge Function to require a valid session before adding that check back.
- **Never commit or hardcode the `service_role` key anywhere in frontend code.** The only Supabase credential that belongs in the browser is the public **anon** key — it's safe there specifically because RLS, not secrecy of that key, is what protects the data.
- **The SendGrid API key gets the same treatment as `service_role`**: it only ever exists as an Edge Function secret (`SENDGRID_API_KEY`), never in frontend code or this repo. Anyone holding it could send email as your verified sender, so it's just as sensitive as a database credential.
- **The check-in link embedded in each QR code is an unguessable UUID, not a real access-control check.** Anyone who has a specific guest's link can check that one guest in — there's no way to enumerate other guests' links from it, so this is a reasonable, low-risk tradeoff for a short-lived event, not a hardened security boundary.

## Project structure

```
birthday-rsvp/
├── index.html                          # Public invitation + RSVP form
├── admin.html                          # Admin dashboard (no login — see Security above)
├── checkin.html                        # Door check-in page (opened via each guest's QR code)
├── css/
│   ├── style.css                       # Public page styles
│   ├── admin.css                       # Admin dashboard styles
│   └── checkin.css                     # Check-in page styles
├── js/
│   ├── app.js                          # Public RSVP form logic (validation, Supabase insert, triggers confirmation email)
│   ├── admin.js                        # Admin dashboard logic (fetch, render, filter, export, manual check-in, send-pending)
│   ├── checkin.js                      # Check-in page logic (lookup guest, confirm check-in)
│   ├── config.js                       # Supabase URL/anon key (committed — see Environment variables)
│   └── config.example.js               # Template for config.js
├── assets/
│   └── invitation.jpg                  # The actual supplied invitation image
├── supabase/
│   ├── schema.sql                      # Table definition, indexes, RLS policies
│   └── functions/
│       ├── _shared/
│       │   ├── cors.ts                 # Shared CORS allow-list used by every function
│       │   └── email.ts                # Shared QR code + HTML email builder + SendGrid send call
│       ├── admin-rsvps/index.ts        # service_role read for the admin dashboard
│       ├── send-confirmation/index.ts  # Emails one guest right after they RSVP
│       ├── send-pending-confirmations/index.ts  # Admin-triggered backfill for guests missing an email
│       └── checkin/index.ts            # Looks up / marks a guest checked-in
├── .env.example                        # Reference template for the two config values
├── .gitignore
└── README.md
```

## Local setup

1. Clone this repository and `cd` into it.
2. `js/config.js` is already committed with this project's real Supabase URL and anon key (see **Environment variables** below for why that's safe) — no setup needed. If you're reusing this project for a *different* Supabase instance, edit `js/config.js` directly, or copy `js/config.example.js` as a starting template.
3. Serve the project with any static file server (needed for `fetch` to behave correctly — don't just open the HTML files via `file://`):
   ```bash
   python3 -m http.server 5500
   ```
4. Open `http://localhost:5500/index.html` for the public page, `http://localhost:5500/admin.html` for the dashboard.

## Supabase configuration

1. Create a Supabase project.
2. Run `supabase/schema.sql` once in the SQL Editor — creates the `rsvps` table, indexes, and RLS policies.
3. Sign up for [SendGrid](https://sendgrid.com) (free tier: 100 emails/day), verify a **Single Sender** email address under Settings → Sender Authentication, and create an API key with **Mail Send** permission only.
4. Set the email-related secrets (run these yourself — they're sensitive, don't paste them into a shared chat/terminal session):
   ```bash
   supabase secrets set SENDGRID_API_KEY=<your SendGrid API key>
   supabase secrets set SENDGRID_FROM_EMAIL=<the single-sender email you verified>
   supabase secrets set APP_BASE_URL=https://<your-deployed-domain>
   ```
   `APP_BASE_URL` is used to build the full check-in link embedded in each QR code — it must match whatever domain `checkin.html` is actually served from.
5. Deploy all four Edge Functions (requires the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy admin-rsvps --no-verify-jwt
   supabase functions deploy send-confirmation --no-verify-jwt
   supabase functions deploy send-pending-confirmations --no-verify-jwt
   supabase functions deploy checkin --no-verify-jwt
   ```
   `--no-verify-jwt` is used because these functions intentionally have no Supabase-auth layer (see Security above) rather than Supabase's own JWT check getting in the way.
6. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` need no manual setup — they're automatically available to every Edge Function in your project.
7. If you deploy the frontend somewhere other than `http://localhost:5500`, add that origin to the `ALLOWED_ORIGINS` list in `supabase/functions/_shared/cors.ts` and redeploy all four functions (they all import from this shared file).

## Deployment

This is a static site — any static host works (Vercel, Netlify, GitHub Pages, Cloudflare Pages). No build command is needed; the publish directory is the repo root.

Currently deployed on **Vercel**, connected directly to this GitHub repo (auto-deploys on push to `main`). Pages:
- Public RSVP page: `https://<your-domain>/`
- Admin dashboard: `https://<your-domain>/admin.html`

To get a shorter/cleaner domain than Vercel's default preview URLs: Vercel Dashboard → your project → **Settings → General → Project Name**. Renaming the project changes its production `*.vercel.app` subdomain to match (e.g. `stephen-80th.vercel.app`). Note `.vercel.app` subdomains are globally unique across all Vercel users, so very short/generic names may already be taken.

Remember step 7 above whenever the deployed domain changes — the shared CORS allow-list needs the new origin added and all four functions redeployed, or both the admin dashboard and check-in page will fail to load data from that domain. Also update `APP_BASE_URL` (step 4) if the domain changes, so new QR codes point to the right place.

## Database schema

Table `rsvps`: `id` (uuid, client-generated at submit time so the browser can trigger the confirmation email without needing read access), `full_name`, `email`, `attendance_status` (`attending` / `maybe` / `not_attending`, enforced by a CHECK constraint), `created_at` (auto-set), `confirmation_sent` (boolean, prevents duplicate emails), `checked_in` / `checked_in_at` (set by the check-in function). See `supabase/schema.sql` for the full definition and RLS policies.

## Environment variables

| Where | Committed? | Purpose |
|---|---|---|
| `.env.example` | Yes | Documents the two frontend values needed (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) |
| `js/config.js` | **Yes** | Actual frontend values, loaded by `index.html`, `admin.html`, and `checkin.html` |
| `js/config.example.js` | Yes | Generic template, useful if repurposing this project for a different Supabase project |
| `SENDGRID_API_KEY` (Edge Function secret) | **Never** | SendGrid API key, Mail Send permission only — server-side only, same sensitivity as `service_role` |
| `SENDGRID_FROM_EMAIL` (Edge Function secret) | **Never** | The verified single-sender email address emails are sent from |
| `APP_BASE_URL` (Edge Function secret) | **Never** | The deployed site's base URL, used to build check-in links embedded in QR codes |

This is a pure static site with no build step, so there's no tool to inject a `.env` file into the browser at runtime or into a host like Vercel/Netlify without extra configuration. `js/config.js` is committed directly as the simplest correct substitute — **this is safe specifically because it only ever holds the public anon key, never a secret.** The anon key is designed to be public; Row Level Security on the database, not secrecy of this key, is what actually protects the data (see Security approach above). The `service_role` key must never go in this file or anywhere else in this repo.

## Known limitations / future improvements

- No authentication on the admin dashboard (see Security section) — add Supabase Auth before any longer-term or more sensitive use.
- No duplicate-RSVP prevention — a guest can submit more than once. A `UNIQUE` constraint on `email` plus an upsert could be added later if needed.
- No rate limiting on the public submit endpoint.
- No Excel export yet (CSV only).
- `send-pending-confirmations` sends one email at a time in a loop — fine for a guest list of this size, but would need batching/parallelism for a much larger event.
- The check-in link's security is "unguessable UUID," not real access control — acceptable for a short-lived private event, not for anything higher-stakes (see Security approach above).
- If a guest's confirmation email fails to send (e.g. SendGrid hiccup), there's no automatic retry — use "Send to Pending Guests" in the admin dashboard to retry everyone still missing one.
