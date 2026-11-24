-- Pockit — 0007: multiple addresses per contact + phone types & extensions.
--
--   • contact_addresses: any number of addresses per contact (Registered office,
--     Factory, Branch …), each with label, full text, city, state, country, PIN.
--     Same ownership + RLS rules as contact_phones / contact_emails; company
--     admins can READ addresses of contacts shared with the company (0005).
--   • contact_phones.extension: digits only, kept separate from the number.
--   • contact_phones.label: adds 'landline', 'direct', 'fax' (existing values unchanged).
--
-- Existing data is NOT changed or deleted. Each phone/website copies its old
-- single contacts.address into contact_addresses itself (app schema v4), with a
-- stable id per contact so several devices never create duplicates.
-- contacts.address stays as a one-line summary until a later clean-up.
--
-- Run in the Supabase SQL Editor AFTER 0001–0006, BEFORE using an app version
-- that saves addresses / extensions (until then cloud sync pauses with
-- "cloud update needed"). Safe to re-run.

begin;

-- 1. Phones: extension + new types ------------------------------------------
alter table public.contact_phones add column if not exists extension text;
alter table public.contact_phones drop constraint if exists contact_phones_extension_check;
alter table public.contact_phones add constraint contact_phones_extension_check
  check (extension is null or extension ~ '^[0-9]{1,10}$');

alter table public.contact_phones drop constraint if exists contact_phones_label_check;
alter table public.contact_phones add constraint contact_phones_label_check
  check (label in ('mobile', 'landline', 'office', 'direct', 'fax', 'whatsapp', 'personal', 'work', 'other'));

-- 2. Addresses ----------------------------------------------------------------
create table if not exists public.contact_addresses (
  id                uuid primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id        uuid not null,
  label             text not null default 'other'
                    check (label in ('registered', 'corporate', 'head', 'branch', 'regional', 'factory',
                                     'warehouse', 'office', 'home', 'other')),
  full_address      text not null check (char_length(btrim(full_address)) between 1 and 1000),
  city              text check (char_length(city) <= 120),
  state             text check (char_length(state) <= 120),
  country           text check (char_length(country) <= 120),
  postal_code       text check (char_length(postal_code) <= 20),
  position          integer not null default 0,
  created_at        timestamptz not null,
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  server_updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);
create index if not exists contact_addresses_contact_idx on public.contact_addresses (contact_id);
create index if not exists contact_addresses_user_server_updated_idx on public.contact_addresses (user_id, server_updated_at);

alter table public.contact_addresses enable row level security;

drop policy if exists contact_addresses_select_own on public.contact_addresses;
create policy contact_addresses_select_own on public.contact_addresses
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists contact_addresses_insert_own on public.contact_addresses;
create policy contact_addresses_insert_own on public.contact_addresses
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists contact_addresses_update_own on public.contact_addresses;
create policy contact_addresses_update_own on public.contact_addresses
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists contact_addresses_delete_own on public.contact_addresses;
create policy contact_addresses_delete_own on public.contact_addresses
  for delete to authenticated using (user_id = (select auth.uid()));

-- Company admins may READ addresses of contacts a member shared (same rule as phones/emails).
drop policy if exists contact_addresses_select_org_admin on public.contact_addresses;
create policy contact_addresses_select_org_admin on public.contact_addresses
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contacts c
                where c.id = contact_addresses.contact_id and c.user_id = contact_addresses.user_id
                  and c.shared_with_org and c.deleted_at is null)
  );

drop trigger if exists contact_addresses_touch on public.contact_addresses;
create trigger contact_addresses_touch before insert or update on public.contact_addresses
  for each row execute function public.touch_server_updated_at();

-- 3. Grants (this project has no automatic grants — see 0003) ----------------
revoke all on public.contact_addresses from anon;
grant select, insert, update, delete on public.contact_addresses to authenticated;

commit;
