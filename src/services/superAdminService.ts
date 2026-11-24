import { requireSupabase } from '@/lib/supabase';

/**
 * Platform super admin (the Pockit owner) — see supabase/migrations/0006_super_admin.sql.
 * Every function here calls a database function that refuses non-super-admins,
 * so hiding the screen is convenience, not security. Numbers only: no contact details.
 */
export interface AdminOverview {
  users: number;
  active7d: number;
  active30d: number;
  newUsers30d: number;
  companies: number;
  usersInCompanies: number;
  contacts: number;
  contacts30d: number;
  cardsScanned: number;
  sharedContacts: number;
  usersWithBackup: number;
}

export interface AdminMonth {
  month: string; // YYYY-MM-DD (first of month)
  newUsers: number;
  newContacts: number;
}

export interface AdminCompany {
  orgId: string;
  name: string;
  createdAt: string;
  admins: number;
  members: number;
  contacts: number;
  shared: number;
  lastContactAt: string | null;
}

export interface AdminUser {
  userId: string;
  email: string;
  fullName: string | null;
  company: string | null;
  role: 'admin' | 'member' | null;
  joinedAt: string;
  lastSignInAt: string | null;
  contacts: number;
  shared: number;
  lastContactAt: string | null;
  isSuperAdmin: boolean;
}

const n = (v: unknown) => Number(v ?? 0);

function friendly(error: { message?: string; code?: string }): Error {
  if (['PGRST202', '42883'].includes(error.code ?? '') || /could not find the function/i.test(error.message ?? '')) {
    return new Error('The Super Admin cloud update (0006) has not been run yet.');
  }
  if (error.code === '42501' || /super admin only/i.test(error.message ?? '')) return new Error('This account is not a super admin.');
  return new Error(error.message ?? 'Could not load the dashboard.');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await requireSupabase().rpc(fn, args);
  if (error) throw friendly(error);
  return (data ?? []) as T[];
}

/** False (never throws) when the function doesn't exist yet or the user isn't one. */
export async function isSuperAdmin(): Promise<boolean> {
  try {
    const { data, error } = await requireSupabase().rpc('am_i_super_admin');
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [r] = await rpc<Record<string, unknown>>('admin_overview');
  return {
    users: n(r?.users),
    active7d: n(r?.active_7d),
    active30d: n(r?.active_30d),
    newUsers30d: n(r?.new_users_30d),
    companies: n(r?.companies),
    usersInCompanies: n(r?.users_in_companies),
    contacts: n(r?.contacts),
    contacts30d: n(r?.contacts_30d),
    cardsScanned: n(r?.cards_scanned),
    sharedContacts: n(r?.shared_contacts),
    usersWithBackup: n(r?.users_with_backup),
  };
}

export async function getAdminGrowth(months = 6): Promise<AdminMonth[]> {
  const rows = await rpc<Record<string, unknown>>('admin_monthly_growth', { p_months: months });
  return rows.map((r) => ({ month: String(r.month), newUsers: n(r.new_users), newContacts: n(r.new_contacts) }));
}

export async function getAdminCompanies(): Promise<AdminCompany[]> {
  const rows = await rpc<Record<string, unknown>>('admin_companies');
  return rows.map((r) => ({
    orgId: String(r.org_id),
    name: String(r.name),
    createdAt: String(r.created_at),
    admins: n(r.admins),
    members: n(r.members),
    contacts: n(r.contacts),
    shared: n(r.shared),
    lastContactAt: (r.last_contact_at as string | null) ?? null,
  }));
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const rows = await rpc<Record<string, unknown>>('admin_users');
  return rows.map((r) => ({
    userId: String(r.user_id),
    email: String(r.email ?? ''),
    fullName: (r.full_name as string | null) ?? null,
    company: (r.company as string | null) ?? null,
    role: (r.role as 'admin' | 'member' | null) ?? null,
    joinedAt: String(r.joined_at),
    lastSignInAt: (r.last_sign_in_at as string | null) ?? null,
    contacts: n(r.contacts),
    shared: n(r.shared),
    lastContactAt: (r.last_contact_at as string | null) ?? null,
    isSuperAdmin: r.is_super_admin === true,
  }));
}
