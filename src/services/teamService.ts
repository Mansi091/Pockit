import { requireSupabase } from '@/lib/supabase';
import { formatPhone } from '@/utils/phone';
import { ADDRESS_LABEL_TEXT, LABEL_TEXT, type AddressLabel, type PhoneLabel } from '@/types/contact';

/**
 * Company Admin (CEO) dashboard data: the contacts employees CHOSE to share.
 *
 * Read straight from the cloud. Row Level Security (0005 / 0007) decides what
 * comes back: an admin receives a member's contact (and its phones, emails,
 * addresses, event) only when the member shared it with their company.
 * Private contacts, notes and follow-ups never leave the database.
 */

export interface SharedPhone {
  label: PhoneLabel;
  number: string; // formatted, e.g. "+91 98765 43210 ext. 12"
}

export interface SharedAddress {
  label: AddressLabel;
  fullAddress: string;
}

export interface SharedCategory {
  id: string;
  name: string;
  color: string;
}

export interface SharedContact {
  id: string;
  ownerId: string;
  personName: string;
  companyName: string | null;
  designation: string | null;
  website: string | null;
  phones: SharedPhone[];
  emails: string[];
  addresses: SharedAddress[];
  events: string[];
  /** The member's categories on this contact (needs 0008; empty before it). */
  categories: SharedCategory[];
  savedAt: string;
}

const PAGE = 1000; // PostgREST returns at most this many rows per request
const CHUNK = 100; // ids per `in (...)` filter, keeps URLs short

function friendly(error: { message?: string } | null): Error {
  const msg = error?.message ?? 'Something went wrong.';
  if (/fetch|network/i.test(msg)) return new Error('No internet connection. The team dashboard needs to be online.');
  return new Error(msg);
}

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Row = Record<string, unknown>;

/** All rows of a query, page by page (no hard cap on how many contacts a team has). */
async function allPages(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw friendly(error);
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function childRows(table: string, columns: string, contactIds: string[]): Promise<Row[]> {
  const sb = requireSupabase();
  const out: Row[] = [];
  for (const ids of chunks(contactIds, CHUNK)) {
    out.push(
      ...(await allPages((from, to) =>
        sb.from(table).select(columns).in('contact_id', ids).is('deleted_at', null).order('position').range(from, to),
      )),
    );
  }
  return out;
}

function groupBy(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = r.contact_id as string;
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

/**
 * Shared contacts of the given team members (newest first).
 * Always filters on shared_with_org, so an admin's OWN private contacts are
 * never mixed in when they look at themselves.
 */
export async function getSharedContacts(memberIds: string[]): Promise<SharedContact[]> {
  if (memberIds.length === 0) return [];
  const sb = requireSupabase();
  const contacts: Row[] = [];
  for (const ids of chunks(memberIds, CHUNK)) {
    contacts.push(
      ...(await allPages((from, to) =>
        sb
          .from('contacts')
          .select('id, user_id, person_name, company_name, designation, website, created_at')
          .in('user_id', ids)
          .eq('shared_with_org', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(from, to),
      )),
    );
  }
  if (contacts.length === 0) return [];

  const ids = contacts.map((c) => c.id as string);
  const [phones, emails, addresses, links] = await Promise.all([
    childRows('contact_phones', 'contact_id, label, e164, raw_input, national_number, extension, position', ids),
    childRows('contact_emails', 'contact_id, address, position', ids),
    childRows('contact_addresses', 'contact_id, label, full_address, position', ids),
    (async () => {
      const out: Row[] = [];
      for (const part of chunks(ids, CHUNK)) {
        out.push(
          ...(await allPages((from, to) =>
            sb.from('event_contacts').select('contact_id, event_id').in('contact_id', part).is('deleted_at', null).range(from, to),
          )),
        );
      }
      return out;
    })(),
  ]);

  // Categories (allowed by 0008). Before that update the reads return nothing
  // or an error — then the dashboard simply shows no categories.
  const categoryLinks: Row[] = [];
  const categoryInfo = new Map<string, SharedCategory>();
  try {
    for (const part of chunks(ids, CHUNK)) {
      categoryLinks.push(
        ...(await allPages((from, to) =>
          sb.from('contact_categories').select('contact_id, category_id').in('contact_id', part).is('deleted_at', null).range(from, to),
        )),
      );
    }
    const categoryIds = [...new Set(categoryLinks.map((l) => l.category_id as string))];
    for (const part of chunks(categoryIds, CHUNK)) {
      const rows = await allPages((from, to) => sb.from('categories').select('id, name, color').in('id', part).range(from, to));
      for (const c of rows) categoryInfo.set(c.id as string, { id: c.id as string, name: c.name as string, color: (c.color as string) || '#687C58' });
    }
  } catch {
    categoryLinks.length = 0;
  }
  const byCategoryLink = groupBy(categoryLinks);

  const eventIds = [...new Set(links.map((l) => l.event_id as string))];
  const eventNames = new Map<string, string>();
  for (const part of chunks(eventIds, CHUNK)) {
    const rows = await allPages((from, to) => sb.from('events').select('id, name').in('id', part).range(from, to));
    for (const e of rows) eventNames.set(e.id as string, e.name as string);
  }

  const byPhone = groupBy(phones);
  const byEmail = groupBy(emails);
  const byAddress = groupBy(addresses);
  const byLink = groupBy(links);

  return contacts.map((c) => {
    const id = c.id as string;
    return {
      id,
      ownerId: c.user_id as string,
      personName: (c.person_name as string) || '(no name)',
      companyName: (c.company_name as string | null) ?? null,
      designation: (c.designation as string | null) ?? null,
      website: (c.website as string | null) ?? null,
      phones: (byPhone.get(id) ?? []).map((p) => ({
        label: p.label as PhoneLabel,
        number: formatPhone({
          e164: (p.e164 as string | null) ?? null,
          rawInput: (p.raw_input as string | null) ?? null,
          nationalNumber: (p.national_number as string) ?? '',
          extension: (p.extension as string | null) ?? null,
        }),
      })),
      emails: (byEmail.get(id) ?? []).map((e) => e.address as string),
      addresses: (byAddress.get(id) ?? []).map((a) => ({ label: a.label as AddressLabel, fullAddress: a.full_address as string })),
      events: (byLink.get(id) ?? []).map((l) => eventNames.get(l.event_id as string)).filter((n): n is string => !!n),
      categories: (byCategoryLink.get(id) ?? [])
        .map((l) => categoryInfo.get(l.category_id as string))
        .filter((x): x is SharedCategory => !!x)
        .sort((a, b) => a.name.localeCompare(b.name)),
      savedAt: c.created_at as string,
    };
  });
}

// ── Export (opens in Excel / Google Sheets) ────────────────────────────

/** Excel runs cells starting with = + - @ as formulas; neutralise them (CSV injection). */
function safeCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// Same order as the dashboard card: Name, Company, Contact number, Email, Website, Address.
export const EXPORT_HEADERS = [
  'Name', 'Company', 'Contact number', 'Email', 'Website', 'Address', 'Category', 'Designation', 'Met at', 'Saved on', 'Shared by',
] as const;

export const UNCATEGORISED = 'No category';

/** Shared contacts grouped by category, biggest group first; "No category" last. A contact in two categories appears in both. */
export function groupByCategory(list: SharedContact[]): { key: string; name: string; color: string | null; contacts: SharedContact[] }[] {
  const groups = new Map<string, { key: string; name: string; color: string | null; contacts: SharedContact[] }>();
  for (const c of list) {
    const cats = c.categories.length ? c.categories : [null];
    for (const cat of cats) {
      const key = cat ? cat.name.trim().toLowerCase() : '';
      if (!groups.has(key)) groups.set(key, { key, name: cat?.name ?? UNCATEGORISED, color: cat?.color ?? null, contacts: [] });
      groups.get(key)!.contacts.push(c);
    }
  }
  return [...groups.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : b.contacts.length - a.contacts.length || a.name.localeCompare(b.name)));
}

/** CSV text with a UTF-8 BOM so Excel shows ₹, é, Hindi names etc. correctly. */
export function contactsToCsv(contacts: SharedContact[], ownerName: (ownerId: string) => string): string {
  const lines = [EXPORT_HEADERS.join(',')];
  for (const c of contacts) {
    const cells = [
      c.personName,
      c.companyName ?? '',
      // label first, so a number never starts the cell with "+"
      c.phones.map((p) => `${LABEL_TEXT[p.label] ?? 'Phone'}: ${p.number}`).join('; '),
      c.emails.join('; '),
      c.website ?? '',
      c.addresses.map((a) => (a.label === 'other' ? a.fullAddress : `${ADDRESS_LABEL_TEXT[a.label] ?? 'Address'}: ${a.fullAddress}`)).join(' | '),
      c.categories.map((x) => x.name).join('; '),
      c.designation ?? '',
      c.events.join('; '),
      c.savedAt ? c.savedAt.slice(0, 10) : '',
      ownerName(c.ownerId),
    ];
    lines.push(cells.map(safeCell).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

/** Website only: saves the CSV as a file. Returns false where downloads aren't possible (phone app). */
export function downloadCsv(fileName: string, csv: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function exportFileName(orgName: string, who?: string): string {
  const slug = (s: string) => s.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
  const day = new Date().toISOString().slice(0, 10);
  return `${slug(orgName)}${who ? `-${slug(who)}` : ''}-shared-contacts-${day}.csv`;
}
