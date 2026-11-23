import { requireSupabase } from '@/lib/supabase';
import { getMeta, META, setMeta } from '@/database/metaRepository';
import { getCurrentUserId } from '@/database/db';
import * as repo from '@/database/contactRepository';
import { emitContactsChanged } from '@/services/dataEvents';
import { requestSync } from '@/services/syncService';

/**
 * Companies (organisations) — see supabase/migrations/0005_organizations.sql.
 *
 *  • A user is in at most one company, as 'admin' (CEO / higher post) or 'member'.
 *  • Contacts are PRIVATE by default. A member shares a contact by choice; only
 *    then can the company's admins see it (on the web dashboard).
 *  • Membership lives in the cloud and needs an internet connection; a copy is
 *    cached in the local meta table so screens can show it offline.
 */

export type OrgRole = 'admin' | 'member';

export interface MyOrganization {
  id: string;
  name: string;
  role: OrgRole;
  displayName: string;
}

export interface MemberStats {
  userId: string;
  displayName: string;
  role: OrgRole;
  joinedAt: string;
  totalContacts: number;
  sharedContacts: number;
}

const LIMITS = { orgName: [2, 80], displayName: [1, 80] } as const;

/** Postgres "relation/function does not exist" → the cloud update (0005) hasn't been run yet. */
function friendly(error: { message?: string; code?: string } | null): Error {
  const msg = error?.message ?? 'Something went wrong.';
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code ?? '') || /could not find the function|does not exist/i.test(msg)) {
    return new Error('Company features need the latest cloud update (0005). Ask the app owner to run it in Supabase.');
  }
  if (/fetch|network/i.test(msg)) return new Error('No internet connection. Company features need to be online.');
  return new Error(msg);
}

export function validateOrgName(name: string): string | null {
  const n = name.trim().length;
  if (n < LIMITS.orgName[0]) return 'Enter the company name.';
  if (n > LIMITS.orgName[1]) return `Keep it under ${LIMITS.orgName[1]} characters.`;
  return null;
}

export function validateDisplayName(name: string): string | null {
  const n = name.trim().length;
  if (n < LIMITS.displayName[0]) return 'Enter your name as your team should see it.';
  if (n > LIMITS.displayName[1]) return `Keep it under ${LIMITS.displayName[1]} characters.`;
  return null;
}

export function normaliseInviteCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function validateInviteCode(code: string): string | null {
  return /^[A-Z0-9]{8}$/.test(normaliseInviteCode(code)) ? null : 'Invite codes have 8 letters and numbers.';
}

// ── Local cache ───────────────────────────────────────────────────────

export async function getCachedOrganization(): Promise<MyOrganization | null> {
  try {
    const raw = await getMeta(META.organization);
    return raw ? (JSON.parse(raw) as MyOrganization) : null;
  } catch {
    return null;
  }
}

async function cache(org: MyOrganization | null) {
  await setMeta(META.organization, org ? JSON.stringify(org) : null);
  emitContactsChanged();
}

/** Fetches my membership from the cloud and refreshes the cache. Falls back to the cache offline. */
export async function refreshMyOrganization(): Promise<MyOrganization | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('organization_members')
    .select('org_id, role, display_name, organizations(name)')
    .eq('user_id', getCurrentUserId())
    .maybeSingle();
  if (error) throw friendly(error);
  if (!data) {
    await cache(null);
    return null;
  }
  const orgName = (data.organizations as unknown as { name: string } | null)?.name ?? 'Company';
  const org: MyOrganization = { id: data.org_id, name: orgName, role: data.role as OrgRole, displayName: data.display_name };
  await cache(org);
  return org;
}

// ── Joining / leaving ─────────────────────────────────────────────────

export async function createOrganization(name: string, displayName: string): Promise<MyOrganization> {
  const problem = validateOrgName(name) ?? validateDisplayName(displayName);
  if (problem) throw new Error(problem);
  const { error } = await requireSupabase().rpc('create_organization', { p_name: name.trim(), p_display_name: displayName.trim() });
  if (error) throw friendly(error);
  return (await refreshMyOrganization())!;
}

export async function joinOrganization(code: string, displayName: string): Promise<MyOrganization> {
  const problem = validateInviteCode(code) ?? validateDisplayName(displayName);
  if (problem) throw new Error(problem);
  const { error } = await requireSupabase().rpc('join_organization', {
    p_code: normaliseInviteCode(code),
    p_display_name: displayName.trim(),
  });
  if (error) throw friendly(error);
  return (await refreshMyOrganization())!;
}

/** Leaves the company. The cloud un-shares all my contacts; we mirror that locally. */
export async function leaveOrganization(): Promise<void> {
  const { error } = await requireSupabase().rpc('leave_organization');
  if (error) throw friendly(error);
  await repo.clearAllSharedLocally();
  await setMeta(META.shareNewContacts, null);
  await cache(null);
  requestSync(0);
}

// ── Admin tools ───────────────────────────────────────────────────────

export async function createInvite(role: OrgRole = 'member'): Promise<string> {
  const { data, error } = await requireSupabase().rpc('create_org_invite', { p_role: role });
  if (error) throw friendly(error);
  return data as string;
}

export async function getMemberStats(): Promise<MemberStats[]> {
  const { data, error } = await requireSupabase().rpc('org_member_stats');
  if (error) throw friendly(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    userId: r.user_id as string,
    displayName: r.display_name as string,
    role: r.role as OrgRole,
    joinedAt: r.joined_at as string,
    totalContacts: Number(r.total_contacts ?? 0),
    sharedContacts: Number(r.shared_contacts ?? 0),
  }));
}

export async function setMemberRole(userId: string, role: OrgRole): Promise<void> {
  const { error } = await requireSupabase().rpc('set_org_member_role', { p_user: userId, p_role: role });
  if (error) throw friendly(error);
}

export async function removeMember(userId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('remove_org_member', { p_user: userId });
  if (error) throw friendly(error);
}

// ── Sharing (opt-in) ──────────────────────────────────────────────────

/** "Share new contacts with my company" — OFF unless the user turns it on. */
export async function getShareNewContacts(): Promise<boolean> {
  return (await getMeta(META.shareNewContacts)) === '1';
}

export async function setShareNewContacts(on: boolean): Promise<void> {
  await setMeta(META.shareNewContacts, on ? '1' : '0');
  emitContactsChanged();
}

/** Used by createContact: share only if I'm in a company AND I opted in. */
export async function shouldShareNewContact(): Promise<boolean> {
  return !!(await getCachedOrganization()) && (await getShareNewContacts());
}

export async function setContactShared(contactId: string, shared: boolean): Promise<void> {
  await repo.setSharedWithOrg(contactId, shared, new Date().toISOString());
  emitContactsChanged();
  requestSync();
}

export const countSharedContacts = () => repo.countShared();
