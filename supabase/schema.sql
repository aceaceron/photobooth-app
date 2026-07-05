-- =========================================================
-- Snapory — Supabase schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`
-- after saving it as a migration in supabase/migrations/).
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles table
-- One row per auth.users row. NEVER stores photostrip images —
-- those are client-side only, per the app's privacy design.
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  username text not null unique,
  avatar_url text,
  email_consent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint name_length check (char_length(name) <= 60)
);

comment on table public.profiles is
  'Public-facing user profile. Row is 1:1 with auth.users and owned exclusively by that user.';

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up, seeding
-- username from the email so the client always has a row to read/update.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_username = '' or base_username is null then
    base_username := 'user';
  end if;
  -- Disambiguate collisions with a short suffix from the user id.
  base_username := left(base_username, 14) || '_' || left(replace(new.id::text, '-', ''), 5);

  insert into public.profiles (id, name, username)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'New user'), base_username)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- 2. Row Level Security
-- Strictly: a user may only read/update/insert THEIR OWN profile row.
-- No delete policy is defined at all — profile deletion only happens
-- via the auth.users cascade, never directly by the client.
-- ---------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No "profiles_select_all" policy: other users' profiles are not readable.
-- If you later want public display names for room participants, add a
-- narrow view (e.g. exposing only id + name) rather than opening this table.

-- ---------------------------------------------------------
-- 3. Avatar storage bucket
-- Public-read bucket (so <img> tags work without signed URLs), but writes
-- are restricted to a user's own folder: avatars/{user_id}/*
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar_public_read" on storage.objects;
create policy "avatar_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "avatar_owner_insert" on storage.objects;
create policy "avatar_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_owner_update" on storage.objects;
create policy "avatar_owner_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatar_owner_delete" on storage.objects;
create policy "avatar_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------
-- Notes:
-- * There is intentionally NO table for rooms, participants, or photos.
--   Rooms are ephemeral (Supabase Realtime channel keyed by room code)
--   and photostrips are composited entirely client-side, never uploaded.
-- * Realtime broadcast/presence channels do not require any table —
--   just enable Realtime on the project (Database > Replication is not
--   needed since we don't broadcast table changes, only channel events).
-- =========================================================
