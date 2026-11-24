-- Pockit — 0006: platform SUPER ADMIN (the owner of Pockit).
--
-- Roles, highest first:
--   • super admin  — the Pockit owner. Sees platform-wide NUMBERS: users,
--                    companies, how many contacts each person / company has.
--                    Never sees anyone's actual contacts, notes or follow-ups.
--   • company admin (0005) — sees their own company's SHARED contacts.
--   • member       — uses the app; shares by choice.
--
-- Super admins are listed in public.platform_admins. Nobody can add
-- themselves from the app: rows are inserted here, in the SQL editor.
-- All dashboard data comes from SECURITY DEFINER functions that first check
-- the caller is a super admin.
--
-- Run in the Supabase SQL Editor AFTER 0005. Safe to re-run.
-- Then make yourself super admin (replace the email):
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'you@example.com'
--   on conflict do nothing;

begin;

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;
drop policy if exists platform_admins_select_self on public.platform_admins;
create policy platform_admins_select_self on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));
-- No insert/update/delete policies: only the SQL editor (postgres) can change this table.

create or replace function public.am_i_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

create or replace function public._require_super_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.am_i_super_admin() then
    raise exception 'Super admin only.' using errcode = '42501';
  end if;
end $$;

-- Headline numbers. Contacts are counted from the cloud, i.e. users with backup on.
create or replace function public.admin_overview()
returns table (
  users bigint, active_7d bigint, active_30d bigint, new_users_30d bigint,
  companies bigint, users_in_companies bigint,
  contacts bigint, contacts_30d bigint, cards_scanned bigint, shared_contacts bigint,
  users_with_backup bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_super_admin();
  return query
  select
    (select count(*) from auth.users),
    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
    (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
    (select count(*) from auth.users where created_at > now() - interval '30 days'),
    (select count(*) from public.organizations),
    (select count(*) from public.organization_members),
    (select count(*) from public.contacts where deleted_at is null),
    (select count(*) from public.contacts where deleted_at is null and created_at > now() - interval '30 days'),
    -- in the cloud, card_image_path holds the storage path of the uploaded card photo
    (select count(*) from public.contacts where deleted_at is null and card_image_path is not null),
    (select count(*) from public.contacts where deleted_at is null and shared_with_org),
    (select count(distinct user_id) from public.contacts);
end $$;

-- New users and new contacts per month (oldest first).
create or replace function public.admin_monthly_growth(p_months int default 6)
returns table (month date, new_users bigint, new_contacts bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_super_admin();
  return query
  with months as (
    select (date_trunc('month', now()) - make_interval(months => g))::date as m
    from generate_series(0, greatest(1, least(p_months, 24)) - 1) g
  )
  select
    months.m,
    (select count(*) from auth.users u where date_trunc('month', u.created_at)::date = months.m),
    (select count(*) from public.contacts c where c.deleted_at is null and date_trunc('month', c.created_at)::date = months.m)
  from months
  order by months.m;
end $$;

-- One row per company.
create or replace function public.admin_companies()
returns table (
  org_id uuid, name text, created_at timestamptz,
  admins bigint, members bigint, contacts bigint, shared bigint, last_contact_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_super_admin();
  return query
  select
    o.id, o.name, o.created_at,
    (select count(*) from public.organization_members m where m.org_id = o.id and m.role = 'admin'),
    (select count(*) from public.organization_members m where m.org_id = o.id),
    (select count(*) from public.contacts c join public.organization_members m on m.user_id = c.user_id
      where m.org_id = o.id and c.deleted_at is null),
    (select count(*) from public.contacts c join public.organization_members m on m.user_id = c.user_id
      where m.org_id = o.id and c.deleted_at is null and c.shared_with_org),
    (select max(c.created_at) from public.contacts c join public.organization_members m on m.user_id = c.user_id
      where m.org_id = o.id and c.deleted_at is null)
  from public.organizations o
  order by o.created_at desc;
end $$;

-- One row per user (employee). Counts only — no contact details.
create or replace function public.admin_users()
returns table (
  user_id uuid, email text, full_name text,
  company text, role text,
  joined_at timestamptz, last_sign_in_at timestamptz,
  contacts bigint, shared bigint, last_contact_at timestamptz,
  is_super_admin boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_super_admin();
  return query
  select
    u.id, u.email::text,
    coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''), m.display_name),
    o.name, m.role,
    u.created_at, u.last_sign_in_at,
    (select count(*) from public.contacts c where c.user_id = u.id and c.deleted_at is null),
    (select count(*) from public.contacts c where c.user_id = u.id and c.deleted_at is null and c.shared_with_org),
    (select max(c.created_at) from public.contacts c where c.user_id = u.id and c.deleted_at is null),
    exists (select 1 from public.platform_admins p where p.user_id = u.id)
  from auth.users u
  left join public.organization_members m on m.user_id = u.id
  left join public.organizations o on o.id = m.org_id
  order by u.created_at desc;
end $$;

-- Grants (this project has no automatic grants — see 0003).
revoke all on public.platform_admins from anon;
grant select on public.platform_admins to authenticated;

revoke all on function public._require_super_admin() from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.am_i_super_admin()', 'public.admin_overview()', 'public.admin_monthly_growth(int)',
    'public.admin_companies()', 'public.admin_users()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

commit;
