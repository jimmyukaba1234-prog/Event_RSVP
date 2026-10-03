# 80th Birthday RSVP

A small, production-style RSVP web app built for Stephen Raymond Dapaa-Addo, Esq.'s 80th birthday celebration — a public invitation/RSVP page for guests, plus an admin dashboard for the organizer to view and export responses.

## What it does

Guests visit a public page, see the invitation and event details, and submit their name, email, and attendance status (attending / maybe / not attending). Responses are stored in a Supabase PostgreSQL database. The organizer can then view a live dashboard of all responses — totals by status, a searchable/filterable guest list, and CSV export.

## Features

- Elegant, mobile-first invitation page with the real invitation image as the centerpiece
- RSVP form with client-side validation, loading state, and a no-reload success message
- Admin dashboard: live counts, search, status filter, refresh, CSV export, mobile-friendly sidebar
- All data stored in Supabase PostgreSQL with Row Level Security (RLS) enforced

## Tech stack

- HTML, CSS, vanilla JavaScript — no frontend framework, no build step
- Supabase (PostgreSQL + Auto-generated REST API + Edge Functions)
- A single Supabase Edge Function (Deno/TypeScript) for the admin data read
- Supabase JS client loaded via CDN `<script>` tag (no npm/bundler needed)

## Architecture

```
Guest browser  →  Supabase REST API (anon key)  →  rsvps table   [INSERT only]
Admin browser  →  Edge Function (admin-rsvps)    →  rsvps table   [SELECT, via service_role, server-side only]
```

The public page and the admin dashboard never talk to the database the same way:

- **Guests** use the public **anon key** directly from the browser to `INSERT` a row. That's the only thing the anon key is allowed to do on this table.
- **Admin** reads go through a **Supabase Edge Function** (`supabase/functions/admin-rsvps`), which is the only place that holds the privileged `service_role` key. The browser never sees it.

## Security approach (read this before reusing this pattern elsewhere)

- **Row Level Security (RLS) is enabled** on the `rsvps` table with exactly one policy: `anon` can `INSERT`. There is **no SELECT policy** for `anon` or `authenticated` — so the public anon key (the one embedded in frontend code) can write a row but can never read any row back, including the one it just inserted. Verified directly against the live database: anon `SELECT` returns `200, []` (empty, not an error); anon `INSERT` returns `201`.
- **The Edge Function (`admin-rsvps`) uses `service_role`**, which bypasses RLS entirely, to read all RSVP data for the dashboard. The `service_role` key only ever exists as a Supabase Edge Function environment secret — it is never present in any file shipped to the browser, never committed to this repo, and never appears in any frontend JavaScript.
- **The admin dashboard has no login/authentication.** This was a deliberate decision for this short-lived event, not an oversight: anyone who has the `admin.html` URL or the Edge Function URL can view guest names, emails, and attendance status. CORS on the Edge Function only restricts which *browser origins* can call it — it does nothing against a direct `curl`/script request. If you reuse this project for something with more sensitive data or a longer-lived dashboard, add real authentication (e.g. Supabase Auth) in front of the admin page and switch the Edge Function to require a valid session before adding that check back.
- **Never commit or hardcode the `service_role` key anywhere in frontend code.** The only Supabase credential that belongs in the browser is the public **anon** key — it's safe there specifically because RLS, not secrecy of that key, is what protects the data.

## Project structure

```
birthday-rsvp/
├── index.html                          # Public invitation + RSVP form
├── admin.html                          # Admin dashboard (no login — see Security above)
├── css/
│   ├── style.css                       # Public page styles
│   └── admin.css                       # Admin dashboard styles
├── js/
│   ├── app.js                          # Public RSVP form logic (validation, Supabase insert)
│   ├── admin.js                        # Admin dashboard logic (fetch, render, filter, export)
│   ├── config.js                       # Your real Supabase URL/anon key (gitignored, not committed)
│   └── config.example.js               # Template for config.js
├── assets/
│   └── invitation.jpg                  # The actual supplied invitation image
├── supabase/
│   ├── schema.sql                      # Table definition, indexes, RLS policies
│   └── functions/
│       └── admin-rsvps/index.ts        # Edge Function: service_role read for the admin dashboard
├── .env.example                        # Reference template for the two config values
├── .gitignore
└── README.md
```

## Local setup

1. Clone this repository and `cd` into it.
2. Copy the config template and fill in your real Supabase values:
   ```bash
   cp js/config.example.js js/config.js
   ```
   Edit `js/config.js`:
   ```js
   window.SUPABASE_CONFIG = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     anonKey: "YOUR_ANON_PUBLIC_KEY",
   };
   ```
   Get these from your Supabase project → **Settings → API** → Project URL and the `anon`/`public` key. **Never put the `service_role`/secret key here.**
3. Serve the project with any static file server (needed for `fetch` to behave correctly — don't just open the HTML files via `file://`):
   ```bash
   python3 -m http.server 5500
   ```
4. Open `http://localhost:5500/index.html` for the public page, `http://localhost:5500/admin.html` for the dashboard.

## Supabase configuration

1. Create a Supabase project.
2. Run `supabase/schema.sql` once in the SQL Editor — creates the `rsvps` table, indexes, and RLS policies.
3. Deploy the Edge Function (requires the [Supabase CLI](https://supabase.com/docs/guides/cli)):
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy admin-rsvps --no-verify-jwt
   ```
   `--no-verify-jwt` is used because this function intentionally has no auth layer (see Security above) rather than Supabase's own JWT check getting in the way.
4. No manual secrets need to be set — `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to every Edge Function in your project.
5. If you deploy the admin page somewhere other than `http://localhost:5500`, add that origin to the `ALLOWED_ORIGINS` list in `supabase/functions/admin-rsvps/index.ts` and redeploy.

## Database schema

Table `rsvps`: `id` (uuid, auto-generated), `full_name`, `email`, `attendance_status` (`attending` / `maybe` / `not_attending`, enforced by a CHECK constraint), `created_at` (auto-set). See `supabase/schema.sql` for the full definition and RLS policies.

## Environment variables

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | Yes | Documents the two values needed (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) |
| `js/config.js` | **No** (gitignored) | Your actual local values, loaded by both `index.html` and `admin.html` |
| `js/config.example.js` | Yes | Template you copy to create `js/config.js` |

This is a pure static site with no build step, so there's no tool to inject a `.env` file into the browser at runtime — `js/config.js` is the simplest correct substitute. This is safe because it only ever holds the public anon key, never a secret.

## Known limitations / future improvements

- No authentication on the admin dashboard (see Security section) — add Supabase Auth before any longer-term or more sensitive use.
- No duplicate-RSVP prevention — a guest can submit more than once. A `UNIQUE` constraint on `email` plus an upsert could be added later if needed.
- No rate limiting on the public submit endpoint.
- No Excel export yet (CSV only).
