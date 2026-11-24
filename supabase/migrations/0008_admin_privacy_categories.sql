-- ════════════════════════════════════════════════════════════════
-- Pockit 0008 — Company admins: privacy + categories of shared contacts
--
--  1. PRIVACY. org_member_stats() used to tell a company admin how many
--     contacts each member had saved IN TOTAL (shared + private). How many
--     private contacts someone keeps is their own business, so the function
--     now returns ONLY the number of contacts the member chose to share.
--     The total column is gone from the database answer itself (not just
--     hidden on screen), so no app version can show it.
--
--  2. CATEGORIES. A company admin may READ the categories that are attached
--     to contacts a member SHARED (e.g. "Clients", "Vendors"), so the team
--     dashboard can group shared contacts by category. Categories used only on
--     private contacts stay invisible. Read-only, like the other admin rules.
--
-- Safe to run more than once. Run it in Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- 1. Member stats without private totals ───────────────────────────────
drop function if exists public.org_member_stats();

create function public.org_member_stats()
returns table (user_id uuid, display_name text, role text, joined_at timestamptz, shared_contacts bigint)
language sql stable security definer set search_path = '' as $$
  select m.user_id, m.display_name, m.role, m.joined_at,
         (select count(*) from public.contacts c
          where c.user_id = m.user_id and c.deleted_at is null and c.shared_with_org)
  from public.organization_members m
  where m.org_id = public.my_org_id() and public.am_i_org_admin()
  order by m.joined_at
$$;

revoke all on function public.org_member_stats() from public, anon;
grant execute on function public.org_member_stats() to authenticated;

-- 2. Categories of shared contacts ─────────────────────────────────────
drop policy if exists contact_categories_select_org_admin on public.contact_categories;
create policy contact_categories_select_org_admin on public.contact_categories
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contacts c
                where c.id = contact_categories.contact_id and c.user_id = contact_categories.user_id
                  and c.shared_with_org and c.deleted_at is null)
  );

drop policy if exists categories_select_org_admin on public.categories;
create policy categories_select_org_admin on public.categories
  for select to authenticated
  using (
    deleted_at is null and public.is_org_admin_of(user_id)
    and exists (select 1 from public.contact_categories l
                join public.contacts c on c.id = l.contact_id and c.user_id = l.user_id
                where l.category_id = categories.id and l.deleted_at is null
                  and c.shared_with_org and c.deleted_at is null)
  );
