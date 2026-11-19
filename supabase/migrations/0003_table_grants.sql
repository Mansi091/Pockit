-- Pockit — 0003: table privileges for signed-in users.
--
-- Some Supabase projects are created WITHOUT automatic grants on new tables
-- (the Data API returns "permission denied for table …" / 42501). Privileges
-- decide WHICH OPERATIONS a role may attempt; Row Level Security (0001/0002)
-- still decides WHICH ROWS — each user only ever sees/changes their own.
--
-- • authenticated (signed-in users): select / insert / update / delete
-- • anon (not signed in): nothing
-- Idempotent: safe to run more than once.

begin;

grant usage on schema public to authenticated;

grant select, insert, update, delete on table
  public.contacts,
  public.contact_phones,
  public.contact_emails,
  public.categories,
  public.contact_categories,
  public.events,
  public.event_contacts,
  public.interactions,
  public.reminders
to authenticated;

revoke all on table
  public.contacts,
  public.contact_phones,
  public.contact_emails,
  public.categories,
  public.contact_categories,
  public.events,
  public.event_contacts,
  public.interactions,
  public.reminders
from anon;

-- Account deletion RPC (0001) — signed-in users only.
grant execute on function public.delete_my_account() to authenticated;

commit;

-- Verify (optional): every row should show grantee = authenticated
-- select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
-- from information_schema.role_table_grants
-- where table_schema = 'public' and grantee = 'authenticated'
-- group by table_name order by table_name;
