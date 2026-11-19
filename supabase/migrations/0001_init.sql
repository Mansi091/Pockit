-- Pockit — initial cloud schema.
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run: every statement is idempotent.

-- ─────────────────────────────────────────────────────────────
-- 1. Contacts (cloud copy of each user's on-device SQLite table)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id                uuid primary key,                      -- generated on the phone
  user_id           uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  person_name       text not null,
  company_name      text,
  designation       text,
  phone             text,
  email             text,
  website           text,
  address           text,
  card_image_path   text,                                  -- path inside the "cards" storage bucket
  raw_ocr_text      text,
  created_at        timestamptz not null,                  -- client time
  updated_at        timestamptz not null,                  -- client time, used for last-write-wins
  deleted_at        timestamptz,                           -- tombstone so deletions sync
  server_updated_at timestamptz not null default now()     -- server time, used as the pull cursor
);

create index if not exists contacts_user_server_updated_idx
  on public.contacts (user_id, server_updated_at);

-- Server clock stamps every write, so the sync cursor never depends on phone clocks.
create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch
  before insert or update on public.contacts
  for each row execute function public.touch_server_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. Row Level Security: a user can only ever see / change their own rows
-- ─────────────────────────────────────────────────────────────
alter table public.contacts enable row level security;

drop policy if exists "contacts_select_own" on public.contacts;
create policy "contacts_select_own" on public.contacts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "contacts_insert_own" on public.contacts;
create policy "contacts_insert_own" on public.contacts
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "contacts_update_own" on public.contacts;
create policy "contacts_update_own" on public.contacts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "contacts_delete_own" on public.contacts;
create policy "contacts_delete_own" on public.contacts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 3. Private storage bucket for card images: cards/{user_id}/{contact_id}.jpg
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('cards', 'cards', false)
on conflict (id) do nothing;

drop policy if exists "cards_select_own" on storage.objects;
create policy "cards_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "cards_insert_own" on storage.objects;
create policy "cards_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "cards_update_own" on storage.objects;
create policy "cards_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "cards_delete_own" on storage.objects;
create policy "cards_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'cards' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ─────────────────────────────────────────────────────────────
-- 4. Account deletion (required by Google Play).
-- The app first deletes the user's images through the Storage API,
-- then calls this function. Deleting the auth user cascades to contacts.
-- SECURITY DEFINER lets it delete from auth.users, but it can only ever
-- delete the caller's own account (auth.uid()).
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.contacts where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
