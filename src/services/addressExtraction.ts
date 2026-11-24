import { COUNTRIES } from '@/data/countries';
import type { AddressLabel, ExtractedAddress } from '@/types/contact';

/**
 * Splits a card's address lines into SEPARATE addresses and reads what each
 * one says about itself. Pure — unit tested in __tests__/addressExtraction.test.ts.
 *
 * A new address starts at:
 *   • a label line   — "Regd. Office:", "Factory -", "Branch Office", "Works:" …
 *   • a gap          — a non-address line (phone, email, name…) between two address lines
 *   • a second PIN   — the previous block already ended with its own PIN / ZIP
 * City / state / PIN / country are filled only when the text shows them; the
 * label is "other" unless the card names it. Nothing is invented.
 */

export interface AddressLine {
  idx: number; // reading order
  text: string;
}

const LABEL_PATTERNS: { re: RegExp; label: AddressLabel; needsColon?: boolean }[] = [
  { re: /^(?:regd\.?|registered)\s*(?:office|off\.?|add(?:ress|r)?\.?)?/i, label: 'registered' },
  { re: /^corp(?:orate|\.)?\s*(?:office|off\.?|add(?:ress|r)?\.?)/i, label: 'corporate' },
  { re: /^(?:head\s*office|h\.\s?o\.)/i, label: 'head' },
  { re: /^branch(?:\s*office)?/i, label: 'branch' },
  { re: /^regional\s*office/i, label: 'regional' },
  { re: /^(?:factory|works|plant|manufacturing\s*(?:unit|plant|facility)|mfg\.?\s*unit)/i, label: 'factory' },
  { re: /^(?:warehouse|godown|depot)/i, label: 'warehouse' },
  // Generic words need a ":" or "-" after them — "Office No. 12, …" is a street, not a label.
  { re: /^(?:admin(?:istrative)?\s*office|office|off\.)\s*[:\-–]/i, label: 'office', needsColon: true },
  { re: /^(?:residence|home)\s*[:\-–]/i, label: 'home', needsColon: true },
  { re: /^(?:address|addr\.?)\s*[:\-–]/i, label: 'other', needsColon: true },
];

/** If the line starts with an address label: the label and the text after it. */
export function readAddressLabel(text: string): { label: AddressLabel; rest: string } | null {
  const t = text.trim();
  for (const p of LABEL_PATTERNS) {
    const m = p.re.exec(t);
    if (!m) continue;
    const after = t.slice(m[0].length);
    if (/^[a-z]/i.test(after)) continue; // "Branches", "Plantation": the word just starts the same way
    const separated = /^\s*[:\-–]/.test(after) || /[:\-–]\s*$/.test(m[0]);
    const rest = after.replace(/^\s*[:\-–.]\s*/, '').trim();
    // "Branch Manager", "Factory Head", "Works Engineer" are job titles, not labels:
    // accept only a lone label, a label with ":"/"-", or one followed by address-like text.
    if (!separated && rest && !/[\d,]/.test(rest)) continue;
    return { label: p.label, rest };
  }
  return null;
}

const PIN_IN = /\b(\d{3})\s?(\d{3})\b/; // Indian 6-digit PIN, "411 045" or "411045"
const US_ZIP = /\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/;
const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/;

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Orissa', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands',
  'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Lakshadweep', 'Puducherry', 'Pondicherry',
];

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  uae: 'United Arab Emirates',
  'u.a.e.': 'United Arab Emirates',
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STATE_RE = new RegExp(`\\b(${INDIAN_STATES.map(escape).join('|')})\\b`, 'i');
const COUNTRY_NAMES = [...COUNTRIES.map((c) => c.name).filter((n) => n.length > 3), ...Object.keys(COUNTRY_ALIASES)];
const COUNTRY_RE = new RegExp(`(?:^|[\\s,(])(${COUNTRY_NAMES.map(escape).sort((a, b) => b.length - a.length).join('|')})(?=$|[\\s,.)])`, 'i');

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());

/** Reads PIN / city / state / country out of one address's text — only what is actually there. */
export function parseAddressParts(full: string): Pick<ExtractedAddress, 'city' | 'state' | 'country' | 'postalCode'> {
  let postalCode: string | null = null;
  let city: string | null = null;
  let state: string | null = null;

  const pin = PIN_IN.exec(full);
  const zip = US_ZIP.exec(full);
  if (pin) {
    postalCode = pin[1]! + pin[2]!;
    // City = the words right before the PIN: "…, Dewas - 455 001" / "Pune 411045".
    const before = full.slice(0, pin.index).replace(/[\s,\-–:]+$/, '');
    const segment = before.split(',').pop()!.trim();
    const m = /([A-Za-z][A-Za-z .]{1,40})$/.exec(segment);
    if (m && !STATE_RE.test(m[1]!)) city = titleCase(m[1]!.trim());
  } else if (zip) {
    postalCode = zip[2]!;
    state = zip[1]!;
    const before = full.slice(0, zip.index).replace(/[\s,]+$/, '');
    const segment = before.split(',').pop()!.trim();
    if (/^[A-Za-z][A-Za-z .]{1,40}$/.test(segment)) city = segment;
  } else {
    const uk = UK_POSTCODE.exec(full);
    if (uk && /\d[A-Z]{2}$/.test(uk[1]!.replace(/\s/g, ''))) postalCode = uk[1]!.toUpperCase();
  }

  const st = STATE_RE.exec(full);
  if (st && !state) state = INDIAN_STATES.find((s) => s.toLowerCase() === st[1]!.toLowerCase()) ?? st[1]!;

  const c = COUNTRY_RE.exec(full);
  let country: string | null = null;
  if (c) {
    const raw = c[1]!.toLowerCase();
    country = COUNTRY_ALIASES[raw] ?? COUNTRIES.find((x) => x.name.toLowerCase() === raw)?.name ?? null;
  }
  // An Indian state written out means India, even if the card doesn't say so.
  if (!country && st) country = 'India';
  return { city, state, country, postalCode };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const tidy = (s: string) =>
  s
    .replace(/\s*,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '')
    .trim();

/**
 * Groups address lines (already identified as address-like by the caller) into
 * separate addresses. `labelLines` are lines that are ONLY a label ("Factory:"),
 * which start a block even though they hold no address text themselves.
 */
export function groupAddresses(lines: AddressLine[]): ExtractedAddress[] {
  const sorted = [...lines].sort((a, b) => a.idx - b.idx);
  type Block = { label: AddressLabel | null; parts: string[]; lastIdx: number; hasCode: boolean };
  const blocks: Block[] = [];
  let current: Block | null = null;

  for (const line of sorted) {
    const labelled = readAddressLabel(line.text);
    const text = labelled ? labelled.rest : line.text.trim();
    const hasCode = PIN_IN.test(text) || US_ZIP.test(text);
    const gap = current ? line.idx - current.lastIdx > 1.05 : false;
    const startNew =
      !current || !!labelled || gap || (current.hasCode && hasCode) || (current.hasCode && /^\d/.test(text));
    if (startNew) {
      // A lone label followed directly by its address: don't leave an empty block behind.
      if (current && current.parts.length === 0 && !gap && !labelled) {
        // keep current
      } else {
        current = { label: labelled?.label ?? null, parts: [], lastIdx: line.idx, hasCode: false };
        blocks.push(current);
      }
    }
    if (text) current!.parts.push(text);
    current!.lastIdx = line.idx;
    current!.hasCode = current!.hasCode || hasCode;
  }

  const out: ExtractedAddress[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const fullAddress = tidy(b.parts.join(', '));
    if (fullAddress.replace(/[^A-Za-z0-9]/g, '').length < 4) continue; // a label with nothing after it
    const key = norm(fullAddress);
    if (seen.has(key)) continue; // the same address printed twice
    seen.add(key);
    out.push({ label: b.label ?? 'other', fullAddress, ...parseAddressParts(fullAddress) });
  }
  return out;
}

/** One-line summary of all addresses (the legacy contacts.address column, search, older screens). */
export const summariseAddresses = (list: { fullAddress: string }[]): string | null =>
  list.length ? list.map((a) => a.fullAddress).join(' | ') : null;
