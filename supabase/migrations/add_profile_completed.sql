-- Run once in Supabase → SQL Editor for an existing Sub9 installation.
-- Safe to run repeatedly.
alter table public.user_settings
  add column if not exists plan_start_date date;

alter table public.user_settings
  add column if not exists profile_completed boolean not null default false;

-- Existing users already completed the former settings form. Preserve that
-- state instead of sending them through onboarding after this migration.
update public.user_settings
set
  profile_completed = true,
  plan_start_date = coalesce(plan_start_date, date '2026-08-24')
where profile_completed = false
  and weight_kg is not null
  and current_ftp is not null
  and goal_finish_seconds is not null
  and rest_days_per_week is not null
  and bike_mass_kg is not null
  and group_size is not null;

