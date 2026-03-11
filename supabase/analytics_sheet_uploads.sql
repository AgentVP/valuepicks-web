-- Store Excel sheet data in Supabase so the app uses Supabase as the source
-- instead of a local file. One row per sheet name; data = full array of row objects.
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).

create table if not exists public.analytics_sheet_uploads (
  sheet_name text primary key,
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

comment on table public.analytics_sheet_uploads is 'Excel sheet data by name (e.g. Goal Tracking). App reads from here when present.';
