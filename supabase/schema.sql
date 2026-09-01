-- Vätternrundan sub-9h — Supabase schema for cross-device cloud sync.
-- Paste this whole file into Supabase → SQL Editor and run it.
-- Safe to re-run (uses if-not-exists / drop-if-exists guards).
--
-- Security: every table has Row-Level Security enabled with policies that only
-- allow a user to touch rows where user_id = auth.uid(). The publishable/anon
-- key shipped in the client therefore cannot read or write anyone else's data.

-- Fill updated_at only when the client didn't provide one, so the client's own
-- edit timestamps drive last-write-wins reconciliation across devices.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- ============================ logged_sessions ============================
create table if not exists public.logged_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sync_id uuid not null,
  date text,
  session_type text,
  activity text,
  title text,
  duration_min numeric,
  avg_speed_kmh numeric,
  avg_watts numeric,
  normalized_watts numeric,
  avg_hr numeric,
  rpe numeric,
  distance_km numeric,
  intervals jsonb,
  metrics jsonb,
  notes text,
  satisfies_planned_id text,
  completed_at bigint,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create unique index if not exists logged_sessions_user_sync
  on public.logged_sessions (user_id, sync_id);
drop trigger if exists logged_sessions_set_updated_at on public.logged_sessions;
create trigger logged_sessions_set_updated_at
  before insert or update on public.logged_sessions
  for each row execute function public.set_updated_at();
alter table public.logged_sessions enable row level security;
drop policy if exists logged_sessions_select on public.logged_sessions;
drop policy if exists logged_sessions_insert on public.logged_sessions;
drop policy if exists logged_sessions_update on public.logged_sessions;
drop policy if exists logged_sessions_delete on public.logged_sessions;
create policy logged_sessions_select on public.logged_sessions
  for select using (user_id = auth.uid());
create policy logged_sessions_insert on public.logged_sessions
  for insert with check (user_id = auth.uid());
create policy logged_sessions_update on public.logged_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy logged_sessions_delete on public.logged_sessions
  for delete using (user_id = auth.uid());

-- =============================== ftp_tests ===============================
create table if not exists public.ftp_tests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sync_id uuid not null,
  date text,
  ftp_watts numeric,
  weight_kg numeric,
  source text,
  notes text,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create unique index if not exists ftp_tests_user_sync
  on public.ftp_tests (user_id, sync_id);
drop trigger if exists ftp_tests_set_updated_at on public.ftp_tests;
create trigger ftp_tests_set_updated_at
  before insert or update on public.ftp_tests
  for each row execute function public.set_updated_at();
alter table public.ftp_tests enable row level security;
drop policy if exists ftp_tests_select on public.ftp_tests;
drop policy if exists ftp_tests_insert on public.ftp_tests;
drop policy if exists ftp_tests_update on public.ftp_tests;
drop policy if exists ftp_tests_delete on public.ftp_tests;
create policy ftp_tests_select on public.ftp_tests
  for select using (user_id = auth.uid());
create policy ftp_tests_insert on public.ftp_tests
  for insert with check (user_id = auth.uid());
create policy ftp_tests_update on public.ftp_tests
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy ftp_tests_delete on public.ftp_tests
  for delete using (user_id = auth.uid());

-- ============================= user_settings =============================
create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  weight_kg numeric,
  current_ftp numeric,
  goal_finish_seconds numeric,
  rest_days_per_week numeric,
  bike_mass_kg numeric,
  auto_adjust boolean,
  group_size numeric,
  plan_start_date date,
  profile_completed boolean not null default false,
  updated_at timestamptz not null default now()
);
drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before insert or update on public.user_settings
  for each row execute function public.set_updated_at();
alter table public.user_settings enable row level security;
drop policy if exists user_settings_select on public.user_settings;
drop policy if exists user_settings_insert on public.user_settings;
drop policy if exists user_settings_update on public.user_settings;
drop policy if exists user_settings_delete on public.user_settings;
create policy user_settings_select on public.user_settings
  for select using (user_id = auth.uid());
create policy user_settings_insert on public.user_settings
  for insert with check (user_id = auth.uid());
create policy user_settings_update on public.user_settings
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_settings_delete on public.user_settings
  for delete using (user_id = auth.uid());
