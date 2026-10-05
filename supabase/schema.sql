-- 80th Birthday RSVP — database schema
-- Run this once in the Supabase SQL Editor for your project.

create extension if not exists pgcrypto;

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  attendance_status text not null check (attendance_status in ('attending', 'maybe', 'not_attending')),
  created_at timestamptz not null default now(),
  confirmation_sent boolean not null default false,
  checked_in boolean not null default false,
  checked_in_at timestamptz
);

-- Supports the admin dashboard's "sort by newest/oldest" and status filter.
create index idx_rsvps_created_at on public.rsvps (created_at desc);
create index idx_rsvps_attendance_status on public.rsvps (attendance_status);

alter table public.rsvps enable row level security;

-- Guests (public/anon) can submit RSVPs. This is the only capability the
-- anon key grants on this table — no SELECT policy exists, so the anon
-- key cannot read any RSVP data back, even though it can write it.
create policy "rsvps_insert_public" on public.rsvps
  for insert
  to anon
  with check (true);

-- Deliberately no SELECT policy for anon/authenticated. RLS default-denies
-- reads when no policy grants them, so the public page and anyone holding
-- the anon key cannot read guest names/emails/attendance.
--
-- The admin dashboard, the confirmation-email functions, and the door
-- check-in function all read/write this table through Edge Functions using
-- the service_role key, which bypasses RLS entirely and is never exposed
-- to the browser. No anon SELECT/UPDATE policy should be added back as a
-- shortcut around that.

-- No UPDATE or DELETE policy is created for anon either. RLS default-denies
-- both actions, so nobody can alter or remove RSVP rows directly through
-- the public API — check-in and confirmation-sent updates only happen via
-- the service_role-backed Edge Functions above. The organizer can still fix
-- or remove rows directly via their own authenticated login in the
-- Supabase Studio table editor.
