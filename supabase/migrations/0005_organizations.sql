-- Pockit — 0005: companies (organisations), roles, invite codes and OPT-IN sharing.
--
-- Model
--   • A user belongs to at most ONE company (organization_members.user_id is unique).
--   • Roles: 'admin' (CEO / higher post) and 'member' (employee).
--   • Contacts are PRIVATE by default (contacts.shared_with_org = false).
--     An employee shares a contact by choice; only then can their company's
--     admins read it (plus its phones, emails, events and card images).
--   • Admins see COUNTS of a member's unshared contacts, never the contacts.
--   • Notes, follow-ups and categories stay private to their owner.
--   • Membership changes go through SECURITY DEFINER functions only
--     (no direct insert/update/delete on the membership tables).
--
-- Run in the Supabase SQL Editor AFTER 0001–0004. Safe to re-run.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'member' check (role in ('admin', 'member')),
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 80),
  joined_at     timestamptz not null default now(),
  primary key (org_id, user_id),
  unique (user_id)
);
create index if not exists organization_members_org_idx on public.organization_members (org_id);

create table if not exists public.organization_invites (
  code        text primary key check (code ~ '^[A-Z0-9]{8}$'),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  role        text not null default 'member' check (role in ('admin', 'member')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  revoked_at  timestamptz
);
create index if not exists organization_invites_org_idx on public.organization_invites (org_id);

alter table public.contacts add column if not exists shared_with_org boolean not null default false;
create index if not exists contacts_shared_idx on public.contacts (user_id) where shared_with_org and deleted_at is null;

-- ─────────────────────────────────────────────────────────────
-- 2. Helper functions (SECURITY DEFINER avoids RLS recursion on members)
-- ─────────────────────────────────────────────────────────────
create or replace function public.my_org_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select org_id from public.organization_members where user_id = (select auth.uid())
$$;

create or replace function public.am_i_org_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_members where user_id = (select auth.uid()) and role = 'admin')
$$;

-- True when the caller is an admin of the company that `member` belongs to.
create or replace function public.is_org_admin_of(member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members a
    join public.organization_members m on m.org_id = a.org_id
    where a.user_id = (select auth.uid()) and a.role = 'admin' and m.user_id = member
  )
$$;

-- ─────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invites enable row level security;

drop policy if exists organizations_select_member on public.organizations;
create policy organizations_select_member on public.organizations
  for select to authenticated using (id = public.my_org_id());

drop policy if exists organization_members_select_same_org on public.organization_members;
create policy organization_members_select_same_org on public.organization_members
  for select to authenticated using (org_id = public.my_org_id());

drop policy if exists organization_invites_select_admin on public.organization_invites;
create policy organization_invites_select_admin on public.organization_invites
  for select to authenticated using (org_id = public.my_org_id() and public.am_i_org_admin());

-- Admins may READ shared contacts of their company's members (never write).
drop policy if exists contacts_select_org_admin on public.contacts;
create policy contacts_select_org_admin on public.contacts
  for select to authenticated
  using (shared_with_org and deleted_at is null and public.is_org_admin_of(user_id));

drop policy if exists contact_phones_select_org_admin on public.contact_phones;
create policy contact_phones_select_org_admin on public.contact_phones
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contacts c
                where c.id = contact_phones.contact_id and c.user_id = contact_phones.user_id
                  and c.shared_with_org and c.deleted_at is null)
  );

drop policy if exists contact_emails_select_org_admin on public.contact_emails;
create policy contact_emails_select_org_admin on public.contact_emails
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contacts c
                where c.id = contact_emails.contact_id and c.user_id = contact_emails.user_id
                  and c.shared_with_org and c.deleted_at is null)
  );

drop policy if exists event_contacts_select_org_admin on public.event_contacts;
create policy event_contacts_select_org_admin on public.event_contacts
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contacts c
                where c.id = event_contacts.contact_id and c.user_id = event_contacts.user_id
                  and c.shared_with_org and c.deleted_at is null)
  );

drop policy if exists events_select_org_admin on public.events;
create policy events_select_org_admin on public.events
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.event_contacts l
                join public.contacts c on c.id = l.contact_id and c.user_id = l.user_id
                where l.event_id = events.id and l.deleted_at is null
                  and c.shared_with_org and c.deleted_at is null)
  );

-- Card images of shared contacts: cards/<member uid>/<contact id>[ _back].jpg
drop policy if exists cards_select_org_admin on storage.objects;
create policy cards_select_org_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cards'
    and exists (
      select 1 from public.contacts c
      where c.user_id::text = (storage.foldername(name))[1]
        and split_part(storage.filename(name), '.', 1) in (c.id::text, c.id::text || '_back')
        and c.shared_with_org and c.deleted_at is null
        and public.is_org_admin_of(c.user_id)
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4. Membership functions (the ONLY way to change membership)
-- ─────────────────────────────────────────────────────────────

-- Internal: remove `uid` from their company. Hands admin to the longest-standing
-- member if `uid` was the last admin; deletes the company if nobody is left.
-- Un-shares uid's contacts (updated_at bumped so every device pulls the change),
-- so joining another company later never exposes old shares.
create or replace function public._leave_org(uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_role text;
begin
  select org_id, role into v_org, v_role from public.organization_members where user_id = uid;
  if v_org is null then return; end if;

  delete from public.organization_members where user_id = uid;

  update public.contacts set shared_with_org = false, updated_at = now()
  where user_id = uid and shared_with_org;

  if not exists (select 1 from public.organization_members where org_id = v_org) then
    delete from public.organizations where id = v_org;
  elsif v_role = 'admin' and not exists (select 1 from public.organization_members where org_id = v_org and role = 'admin') then
    update public.organization_members set role = 'admin'
    where (org_id, user_id) = (select org_id, user_id from public.organization_members
                               where org_id = v_org order by joined_at limit 1);
  end if;
end $$;

create or replace function public.create_organization(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'You are already in a company. Leave it first.';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), uid) returning id into new_id;
  insert into public.organization_members (org_id, user_id, role, display_name)
  values (new_id, uid, 'admin', btrim(p_display_name));
  return new_id;
end $$;

create or replace function public.create_org_invite(p_role text default 'member')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.my_org_id();
  v_code text;
begin
  if v_org is null or not public.am_i_org_admin() then raise exception 'Only company admins can invite people.'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Unknown role.'; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.organization_invites (code, org_id, role, created_by) values (v_code, v_org, p_role, auth.uid());
      return v_code;
    exception when unique_violation then
      -- extremely rare collision: try another code
    end;
  end loop;
end $$;

create or replace function public.revoke_org_invite(p_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.am_i_org_admin() then raise exception 'Only company admins can revoke invites.'; end if;
  update public.organization_invites set revoked_at = now()
  where code = upper(btrim(p_code)) and org_id = public.my_org_id() and revoked_at is null;
end $$;

create or replace function public.join_organization(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  inv public.organization_invites%rowtype;
begin
  if uid is null then raise exception 'Not signed in.'; end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'You are already in a company. Leave it first.';
  end if;
  select * into inv from public.organization_invites
  where code = upper(btrim(p_code)) and revoked_at is null and expires_at > now();
  if not found then raise exception 'This invite code is not valid or has expired.'; end if;
  insert into public.organization_members (org_id, user_id, role, display_name)
  values (inv.org_id, uid, inv.role, btrim(p_display_name));
  return inv.org_id;
end $$;

create or replace function public.leave_organization()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  perform public._leave_org(auth.uid());
end $$;

create or replace function public.remove_org_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user = auth.uid() then raise exception 'Use "Leave company" to remove yourself.'; end if;
  if not public.is_org_admin_of(p_user) then raise exception 'Only company admins can remove people.'; end if;
  perform public._leave_org(p_user);
end $$;

create or replace function public.set_org_member_role(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.my_org_id();
begin
  if p_role not in ('admin', 'member') then raise exception 'Unknown role.'; end if;
  if not public.is_org_admin_of(p_user) then raise exception 'Only company admins can change roles.'; end if;
  if p_role = 'member' and not exists (
    select 1 from public.organization_members where org_id = v_org and role = 'admin' and user_id <> p_user
  ) then
    raise exception 'A company needs at least one admin.';
  end if;
  update public.organization_members set role = p_role where org_id = v_org and user_id = p_user;
end $$;

create or replace function public.rename_organization(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.am_i_org_admin() then raise exception 'Only company admins can rename the company.'; end if;
  update public.organizations set name = btrim(p_name) where id = public.my_org_id();
end $$;

create or replace function public.update_my_display_name(p_display_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.organization_members set display_name = btrim(p_display_name) where user_id = auth.uid();
end $$;

-- Admin view: one row per member with how many contacts they have and how
-- many they shared. Counts only — never the unshared contacts themselves.
-- (Counts cover contacts that reached the cloud, i.e. members with backup on.)
create or replace function public.org_member_stats()
returns table (user_id uuid, display_name text, role text, joined_at timestamptz, total_contacts bigint, shared_contacts bigint)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.display_name, m.role, m.joined_at,
         (select count(*) from public.contacts c where c.user_id = m.user_id and c.deleted_at is null),
         (select count(*) from public.contacts c where c.user_id = m.user_id and c.deleted_at is null and c.shared_with_org)
  from public.organization_members m
  where m.org_id = public.my_org_id() and public.am_i_org_admin()
  order by m.joined_at
$$;

-- Account deletion now also leaves the company cleanly (admin hand-over).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  perform public._leave_org(uid);
  delete from public.contacts where user_id = uid;
  delete from auth.users where id = uid;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Grants (this project has no automatic grants — see 0003)
-- ─────────────────────────────────────────────────────────────
revoke all on public.organizations, public.organization_members, public.organization_invites from anon;
grant select on public.organizations, public.organization_members, public.organization_invites to authenticated;

revoke all on function public._leave_org(uuid) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.my_org_id()', 'public.am_i_org_admin()', 'public.is_org_admin_of(uuid)',
    'public.create_organization(text, text)', 'public.create_org_invite(text)', 'public.revoke_org_invite(text)',
    'public.join_organization(text, text)', 'public.leave_organization()', 'public.remove_org_member(uuid)',
    'public.set_org_member_role(uuid, text)', 'public.rename_organization(text)',
    'public.update_my_display_name(text)', 'public.org_member_stats()', 'public.delete_my_account()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
