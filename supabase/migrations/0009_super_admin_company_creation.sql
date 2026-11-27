-- Pockit 0009: restrict company creation to platform Super Admins.
-- Regular users may join an existing company only through a valid invitation.
-- This must run after 0006_super_admin.sql, which defines am_i_super_admin().

begin;

create or replace function public.create_organization(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not public.am_i_super_admin() then
    raise exception 'Only a Pockit Super Admin can create a company. Ask your company manager for an invite code.'
      using errcode = '42501';
  end if;
  if exists (select 1 from public.organization_members where user_id = uid) then
    raise exception 'You are already in a company. Leave it first.';
  end if;
  if char_length(btrim(p_name)) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'Company name must be between 2 and 80 characters.';
  end if;
  if char_length(btrim(p_display_name)) < 1 or char_length(btrim(p_display_name)) > 80 then
    raise exception 'Display name must be between 1 and 80 characters.';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), uid)
  returning id into new_id;

  insert into public.organization_members (org_id, user_id, role, display_name)
  values (new_id, uid, 'admin', btrim(p_display_name));

  return new_id;
end;
$$;

commit;
