-- Pockit — 0002: structured phones/emails, categories, events, interactions,
-- reminders, favourites and back-side card images.
-- Run once in Supabase Dashboard → SQL Editor → New query → paste → Run.
-- Additive and idempotent: nothing from 0001 is dropped or changed in meaning.
-- The legacy contacts.phone / contacts.email columns are KEPT (expand phase);
-- they will only be dropped by a later migration after the data is validated.

begin;

-- ─────────────────────────────────────────────────────────────
-- 0. contacts: new columns + a (id, user_id) key that child tables reference,
--    so a child row can never point at another user's contact.
-- ─────────────────────────────────────────────────────────────
alter table public.contacts add column if not exists is_favourite boolean not null default false;
alter table public.contacts add column if not exists card_back_image_path text;   -- storage path "<uid>/<id>_back.jpg"

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_id_user_key') then
    alter table public.contacts add constraint contacts_id_user_key unique (id, user_id);
  end if;
end $$;

-- Helper: standard sync columns + RLS for a user-owned table.
create or replace function pg_temp.enable_owner_rls(t text) returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
  execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
  execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
  execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
  execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
  execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
  execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
  execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
  execute format('create trigger %I before insert or update on public.%I for each row execute function public.touch_server_updated_at()', t || '_touch', t);
  execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', t || '_user_server_updated_idx', t);
end $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Phones (structured, labelled, ordered)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contact_phones (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  label             text not null default 'mobile' check (label in ('mobile','work','office','whatsapp','other')),
  country_iso       text check (country_iso ~ '^[A-Z]{2}$'),
  calling_code      text check (calling_code ~ '^[0-9]{1,4}$'),
  national_number   text not null check (national_number ~ '^[0-9]{1,17}$'),
  e164              text check (e164 ~ '^\+[0-9]{6,16}$'),
  raw_input         text check (char_length(raw_input) <= 64),
  needs_review      boolean not null default false,
  position          integer not null default 0,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists contact_phones_contact_idx on public.contact_phones (contact_id);
select pg_temp.enable_owner_rls('contact_phones');

-- ─────────────────────────────────────────────────────────────
-- 2. Emails
-- ─────────────────────────────────────────────────────────────
create table if not exists public.contact_emails (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  label             text not null default 'work' check (label in ('work','personal','other')),
  address           text not null check (char_length(address) between 3 and 254),
  position          integer not null default 0,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists contact_emails_contact_idx on public.contact_emails (contact_id);
select pg_temp.enable_owner_rls('contact_emails');

-- ─────────────────────────────────────────────────────────────
-- 3. Categories + contact ↔ category (many-to-many)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.categories (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 40),
  color             text not null default '#4F46E5' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon              text check (char_length(icon) <= 40),
  position          integer not null default 0,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id)
);
select pg_temp.enable_owner_rls('categories');

create table if not exists public.contact_categories (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  category_id       uuid not null,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (contact_id, category_id),
  foreign key (contact_id, user_id)  references public.contacts (id, user_id)   on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);
create index if not exists contact_categories_category_idx on public.contact_categories (category_id);
select pg_temp.enable_owner_rls('contact_categories');

-- ─────────────────────────────────────────────────────────────
-- 4. Events + event ↔ contact (many-to-many)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.events (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  location          text check (char_length(location) <= 120),
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
select pg_temp.enable_owner_rls('events');

create table if not exists public.event_contacts (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id          uuid not null,
  contact_id        uuid not null,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  unique (event_id, contact_id),
  foreign key (event_id, user_id)   references public.events (id, user_id)   on delete cascade,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists event_contacts_contact_idx on public.event_contacts (contact_id);
select pg_temp.enable_owner_rls('event_contacts');

-- ─────────────────────────────────────────────────────────────
-- 5. Interactions (meeting details + notes history)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.interactions (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  occurred_on       date,
  place             text check (char_length(place) <= 120),
  notes             text check (char_length(notes) <= 5000),
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists interactions_contact_idx on public.interactions (contact_id, occurred_on desc);
select pg_temp.enable_owner_rls('interactions');

-- ─────────────────────────────────────────────────────────────
-- 6. Reminders (notifications are scheduled on each device, not here)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.reminders (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  title             text not null check (char_length(btrim(title)) between 1 and 200),
  due_at            timestamptz not null,
  completed_at      timestamptz,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists reminders_contact_idx on public.reminders (contact_id);
create index if not exists reminders_due_idx on public.reminders (user_id, due_at) where deleted_at is null and completed_at is null;
select pg_temp.enable_owner_rls('reminders');

commit;

-- Back-side images use the existing private "cards" bucket and its per-user
-- folder policies from 0001 ("<uid>/<contact_id>_back.jpg") — no change needed.
-- delete_my_account() from 0001 still works: every new table cascades from auth.users.
