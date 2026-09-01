-- Run once in Supabase → SQL Editor for an existing Sub9 installation.
-- Safe to run repeatedly.
alter table public.user_settings
  add column if not exists plan_start_date date;

alter table public.user_settings
  add column if not exists profile_completed boolean not null default false;

