import { fixMisreadPlus } from '@/utils/phone';
import type { ContactField, ExtractionResult, OcrLine, OcrResult } from '@/types/contact';

/**
 * Rule-based extraction: OCR lines → structured contact fields. Fully offline.
 *
 * Pipeline:
 *  1. Clean lines and fix common OCR glitches ("name @ domain", "www. site").
 *  2. Pull out emails, websites and phones with regular expressions; a line
 *     that is only contact info (plus labels like "Tel:") is "consumed".
 *  3. Score each remaining line as company / designation / address using
 *     keyword lists, the email/website domain, letter case and text size.
 *  4. Pick the person name from what's left using shape (2–4 words, no digits),
 *     size (names are usually the biggest text), position next to the
 *     designation, and agreement with the email's local part.
 *
 * Never invents data: a field is only filled when the evidence clears a
 * threshold. Fields whose winner was close to the runner-up are reported in
 * `lowConfidence` so the review screen can ask the user to check them.
 */

// ── Patterns ──────────────────────────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const TLDS =
  'com|in|net|org|co|io|biz|info|us|uk|ai|app|dev|tech|me|edu|gov|xyz|store|online|site|global|world|asia|eu|ca|au|de|fr|sg|ae';
const URL_RE = new RegExp(
  String.raw`\b(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9-]+)*\.(?:${TLDS})(?:\.[a-z]{2})?(?:\/[^\s,]*)?\b`,
  'gi',
);
const PHONE_RE = /(?:\+|00)?\(?\d[\d\s\-().\/]{5,}\d/g;
const DATE_RE = /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/;

const LABEL_RE =
  /\b(?:tel|telephone|ph|phone|mob|mobile|cell|m|t|p|o|off|office|res|direct|dir|hp|whatsapp|wa|e|email|e-mail|mail|w|web|website|url|f|fax)\b\.?\s*[:.\-]?/gi;
const FAX_RE = /\b(?:fax|f)\b\s*[:.\-]/i;
const MOBILE_LABEL_RE = /\b(?:m|mob|mobile|cell|hp|whatsapp)\b\s*[:.\-]?/i;

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail', 'googlemail', 'yahoo', 'ymail', 'outlook', 'hotmail', 'live', 'msn', 'icloud', 'me', 'aol',
  'rediffmail', 'rediff', 'protonmail', 'proton', 'zohomail', 'gmx', 'mail', 'yandex',
]);

const DESIGNATION_WORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'md', 'vp', 'avp', 'svp', 'evp', 'gm', 'agm', 'dgm',
  'founder', 'co-founder', 'cofounder', 'director', 'manager', 'mgr', 'head', 'lead', 'engineer', 'developer',
  'designer', 'architect', 'consultant', 'executive', 'officer', 'president', 'chairman', 'chairperson',
  'partner', 'proprietor', 'owner', 'analyst', 'specialist', 'associate', 'assistant', 'coordinator',
  'administrator', 'advisor', 'adviser', 'accountant', 'representative', 'supervisor', 'intern', 'trainee',
  'principal', 'secretary', 'treasurer', 'chief', 'professor', 'lecturer', 'teacher', 'doctor', 'surgeon',
  'physician', 'dentist', 'lawyer', 'advocate', 'attorney', 'agent', 'broker', 'technician', 'scientist',
  'researcher', 'editor', 'writer', 'photographer', 'chef', 'pharmacist', 'nurse', 'tutor', 'counsellor',
  'counselor', 'strategist', 'recruiter', 'controller', 'auditor', 'programmer', 'administrator', 'sales',
  'marketing', 'operations', 'hr', 'procurement', 'purchase',
];
const DESIGNATION_RE = new RegExp(`\\b(?:${DESIGNATION_WORDS.join('|')})s?\\b`, 'i');

const COMPANY_WORDS = [
  'pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'company',
  'plc', 'gmbh', 'pte', 'pty', 'technologies', 'technology', 'tech', 'solutions', 'systems', 'services',
  'industries', 'enterprises', 'enterprise', 'group', 'labs', 'studio', 'studios', 'agency', 'associates',
  'consultancy', 'consulting', 'consultants', 'international', 'global', 'ventures', 'traders', 'trading',
  'exports', 'imports', 'infotech', 'infosystems', 'software', 'digital', 'media', 'networks', 'logistics',
  'pharma', 'pharmaceuticals', 'foods', 'motors', 'builders', 'constructions', 'construction', 'realty',
  'realtors', 'hospital', 'clinic', 'bank', 'finance', 'financial', 'capital', 'insurance', 'university',
  'college', 'school', 'institute', 'academy', 'foundation', 'trust', 'manufacturing', 'textiles',
  'electricals', 'electronics', 'automation', 'innovations', 'creations', 'interiors', 'engineers',
  'co\\.', '&\\s*co',
];
const COMPANY_RE = new RegExp(`(?:\\b(?:${COMPANY_WORDS.join('|')})\\b|&\\s*co\\b)`, 'i');

const ADDRESS_WORDS = [
  'road', 'rd', 'street', 'st', 'lane', 'ln', 'avenue', 'ave', 'marg', 'nagar', 'colony', 'sector', 'block',
  'plot', 'floor', 'flr', 'building', 'bldg', 'tower', 'complex', 'estate', 'phase', 'near', 'opp', 'opposite',
  'behind', 'suite', 'ste', 'apartment', 'apt', 'house', 'area', 'chowk', 'cross', 'layout', 'district', 'dist',
  'taluka', 'village', 'highway', 'hwy', 'boulevard', 'blvd', 'drive', 'court', 'plaza', 'mall', 'centre',
  'center', 'midc', 'gidc', 'society', 'wing', 'shop', 'unit', 'park', 'post', 'box', 'pin', 'pincode', 'zip',
  'india', 'usa', 'uae', 'mumbai', 'pune', 'delhi', 'bangalore', 'bengaluru', 'chennai', 'hyderabad', 'kolkata',
  'ahmedabad', 'noida', 'gurgaon', 'gurugram', 'thane', 'nagpur', 'jaipur', 'lucknow', 'indore', 'surat',
  'kochi', 'goa', 'panaji', 'chandigarh', 'nashik', 'vadodara', 'coimbatore', 'london', 'dubai', 'singapore',
  'maharashtra', 'karnataka', 'gujarat', 'tamil', 'kerala', 'telangana', 'andheri', 'bandra',
];
const ADDRESS_RE = new RegExp(`\\b(?:${ADDRESS_WORDS.join('|')})\\b\\.?`, 'gi');
const PIN_RE = /\b\d{3}\s?\d{3}\b|\b[A-Z]{2}\s\d{5}(?:-\d{4})?\b/;
const ORDINAL_RE = /\b\d+(?:st|nd|rd|th)\b/i;
const HONORIFIC_RE = /^(?:mr|mrs|ms|miss|dr|prof|er|ca|adv|shri|smt)\.?\s+/i;

// ── Helpers ───────────────────────────────────────────────────────────

interface Line {
  idx: number; // reading order
  text: string;
  height: number; // text size in px (0 if unknown)
  top: number;
}

const unique = <T,>(xs: T[]) => [...new Set(xs)];
const lettersOnly = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isAllCaps = (s: string) => /[A-Z]/.test(s) && s === s.toUpperCase();
const isTitleCase = (s: string) => s.split(/\s+/).every((w) => /^[A-Z][a-z'.-]*$/.test(w) || /^[A-Z]\.?$/.test(w));

function toTitleCase(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/(^|[-'])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()))
    .join(' ');
}

/** Fix OCR habits that break the regexes: spaces around "@" and after "www.", "(at)" etc. */
function repairContactText(s: string): string {
  return s
    .replace(/\s*(?:\(at\)|\[at\])\s*/gi, '@')
    .replace(/\s*@\s*/g, '@')
    .replace(/\bwww\s*[.,]\s*/gi, 'www.')
    .replace(/([A-Za-z0-9])\s*\.\s*(com|in|net|org|co)\b/g, '$1.$2');
}

function normaliseLines(ocr: OcrResult): Line[] {
  const raw: OcrLine[] = ocr.lines.length ? ocr.lines : ocr.text.split(/\r?\n/).map((text) => ({ text }));
  return raw
    .map((l, idx) => ({
      idx,
      text: l.text.replace(/[|•·]+/g, ' | ').replace(/\s+/g, ' ').trim(),
      height: l.frame?.height ?? 0,
      top: l.frame?.top ?? idx,
    }))
    .filter((l) => l.text.length >= 2 && /[A-Za-z0-9]/.test(l.text));
}

// ── Misread "@" repair ───────────────────────────────────────────────
// OCR regularly turns the "@" of "Hemant.Khurana@everestind.com" into letters
// ("Hemant.Khuranaldeverestind.com"), which then looks like a website.
// We rebuild it only with real evidence: an "E:/Email" label or the card's own
// website domain, plus a local part that matches words printed on the card.

const AT_GLYPHS = ['ld', 'la', 'cd', '(a)', '(a', 'a)', 'a', 'd', 'q', 'g', 'e', '@', '©', '®', '&'];
const EMAIL_LABEL_RE = /^(?:e|email|e-mail|mail|email\s*id)\s*[:.\-]?\s+/i;
const DOMAIN_RE = new RegExp(String.raw`^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:${TLDS})(?:\.[a-z]{2})?$`, 'i');
const EXPLICIT_URL_RE = /^(?:https?:\/\/|www\.)/i;

function cardWords(lines: Line[]): Set<string> {
  const words = new Set<string>();
  for (const l of lines) {
    if (/\d|@/.test(l.text) || /\.[a-z]{2,}\b/i.test(l.text)) continue; // skip contact/URL lines
    for (const w of l.text.toLowerCase().split(/[^a-z]+/)) if (w.length >= 2) words.add(w);
  }
  return words;
}

/** strict: "hemant.khurana" (every part printed on the card). loose: "hkhurana" (initials + surname). */
function localMatches(local: string, words: Set<string>, loose: boolean): boolean {
  const toks = local.toLowerCase().split(/[._-]+/).filter(Boolean);
  if (!toks.length) return false;
  if (!loose) return toks.every((t) => words.has(t)) && toks.some((t) => t.length >= 3);
  const t = toks[toks.length - 1]!;
  return [...words].some((w) => w.length >= 4 && t.endsWith(w) && t.length - w.length <= 2);
}

/** Finds where the local part ends inside "<local><misread @>". */
function bestLocal(head: string, words: Set<string>): string | null {
  for (const loose of [false, true]) {
    for (const k of [0, 1, 2, 3]) {
      if (k && !AT_GLYPHS.includes(head.slice(-k).toLowerCase())) continue;
      const cand = head.slice(0, head.length - k).replace(/[._-]+$/, '');
      if (cand && localMatches(cand, words, loose)) return cand;
    }
  }
  // No name evidence: drop the most likely misread glyph, if there is one.
  for (const g of ['ld', 'la', '©', '®', '&']) if (head.toLowerCase().endsWith(g)) return head.slice(0, -g.length);
  return null;
}

function rebuildEmail(token: string, domains: string[], words: Set<string>, labelled: boolean): string | null {
  if (token.includes('@') || EXPLICIT_URL_RE.test(token)) return null;
  const lower = token.toLowerCase();
  // 1. Ends with the card's own website domain (and isn't a subdomain of it).
  for (const d of domains) {
    if (lower.endsWith(d) && lower.length > d.length + 1 && lower[lower.length - d.length - 1] !== '.') {
      const local = bestLocal(token.slice(0, token.length - d.length), words);
      if (local) return `${local}@${d}`;
    }
  }
  // 2. Labelled "E:" but no known domain: split after a local part made of the card's words.
  if (!labelled) return null;
  for (let i = 3; i < token.length - 4; i++) {
    const local = token.slice(0, i);
    if (!localMatches(local, words, false)) continue;
    for (const g of AT_GLYPHS) {
      const domain = lower.slice(i + g.length);
      if (lower.startsWith(g, i) && DOMAIN_RE.test(domain)) return `${local}@${domain}`;
    }
  }
  return null;
}

/** Rebuilds misread email addresses; reports whether anything was repaired. */
function repairMisreadEmails(lines: Line[]): { lines: Line[]; repaired: boolean } {
  const domains = unique(
    lines.flatMap((l) =>
      (repairContactText(l.text).match(URL_RE) ?? [])
        .filter((u) => EXPLICIT_URL_RE.test(u))
        .map((u) => u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]!.toLowerCase()),
    ),
  );
  const words = cardWords(lines);
  let repaired = false;
  const out = lines.map((line) => {
    if (line.text.includes('@')) return line;
    const label = EMAIL_LABEL_RE.exec(line.text);
    const body = (label ? line.text.slice(label[0].length) : line.text).replace(/\s*([._-])\s*/g, '$1');
    const tokens = label ? [body.replace(/\s+/g, '')] : body.split(/\s+/);
    for (const t of tokens) {
      if (!label && !domains.some((d) => t.toLowerCase().endsWith(d))) continue;
      const email = rebuildEmail(t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''), domains, words, !!label);
      if (email) {
        repaired = true;
        return { ...line, text: email };
      }
    }
    return line;
  });
  return { lines: out, repaired };
}

function domainStem(emailOrUrl: string): string | null {
  const host = emailOrUrl.includes('@')
    ? emailOrUrl.split('@')[1]!
    : emailOrUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]!;
  const stem = host.split('.')[0]!.toLowerCase();
  return stem.length >= 3 && !GENERIC_EMAIL_DOMAINS.has(stem) ? lettersOnly(stem) : null;
}

function cleanPhone(s: string): string | null {
  const trimmed = s.replace(/^[^\d+(]+|[^\d)]+$/g, '').replace(/\s+/g, ' ').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (DATE_RE.test(trimmed)) return null;
  return trimmed;
}

/** Splits "020 2567 8900 / 98765 43210" into two numbers when both halves are complete numbers. */
function splitPhoneMatch(m: string): string[] {
  const parts = m.split(/\s*[\/,]\s*/);
  if (parts.length > 1 && parts.every((p) => p.replace(/\D/g, '').length >= 7)) return parts;
  return [m];
}

/** Picks the best-scoring candidate; ambiguous if the runner-up is within `margin`. */
function pickBest<T>(cands: { item: T; score: number }[], threshold: number, margin = 1) {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  if (!best || best.score < threshold) return null;
  const runnerUp = sorted[1];
  return { item: best.item, score: best.score, ambiguous: !!runnerUp && best.score - runnerUp.score < margin };
}

// ── Main ──────────────────────────────────────────────────────────────

export function extractContact(ocr: OcrResult): ExtractionResult {
  const { lines, repaired: emailRepaired } = repairMisreadEmails(normaliseLines(ocr));
  const lowConfidence: ContactField[] = [];

  const emails: string[] = [];
  const websites: string[] = [];
  const mobiles: string[] = [];
  const otherPhones: string[] = [];
  const remaining: Line[] = []; // lines left for company/designation/address/name

  // 1–2. Contact info
  for (const line of lines) {
    let text = repairContactText(line.text);

    const lineEmails = text.match(EMAIL_RE) ?? [];
    emails.push(...lineEmails.map((e) => e.replace(/[.,;:]+$/, '').toLowerCase()));
    text = text.replace(EMAIL_RE, ' ');

    const lineUrls = (text.match(URL_RE) ?? []).filter((u) => /^(https?:\/\/|www\.)/i.test(u) || /\.[a-z]{2,}/i.test(u));
    // Avoid treating "Pvt.Ltd" or "No.12" as websites: require www/http or a 2+ letter host.
    const realUrls = lineUrls.filter((u) => /^(https?:\/\/|www\.)/i.test(u) || /^[a-z0-9-]{3,}\./i.test(u));
    websites.push(...realUrls.map((u) => u.replace(/[.,;:]+$/, '')));
    for (const u of realUrls) text = text.replace(u, ' ');

    const isFax = FAX_RE.test(text) && !MOBILE_LABEL_RE.test(text);
    const isMobile = MOBILE_LABEL_RE.test(text);
    for (const m of text.match(PHONE_RE) ?? []) {
      for (const part of splitPhoneMatch(m)) {
        const cleaned = cleanPhone(part);
        if (!cleaned) continue;
        text = text.replace(part, ' ');
        const p = fixMisreadPlus(cleaned) ?? cleaned; // "491 98672 99476" → "+91 98672 99476"
        if (isFax) continue;
        const digits = p.replace(/\D/g, '');
        // Indian mobiles: 10 digits starting 6–9 (optionally after +91 / 0)
        const looksMobile = /^(?:91|0)?[6-9]\d{9}$/.test(digits);
        (isMobile || looksMobile ? mobiles : otherPhones).push(p);
      }
    }

    const removedSomething = text !== repairContactText(line.text);
    if (!removedSomething) {
      remaining.push(line); // no contact info on this line — keep it untouched (commas matter)
      continue;
    }
    // Contact info was removed; keep any meaningful text that's left (e.g. "Pune" after "Tel: …").
    const leftover = text
      .replace(LABEL_RE, ' ')
      .replace(/\s*[|;/]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,:\-–()]+|[\s,:\-–()]+$/g, '')
      .trim();
    if ((leftover.match(/[A-Za-z]/g) ?? []).length >= 3) remaining.push({ ...line, text: leftover });
  }

  const stems = unique([...emails, ...websites].map(domainStem).filter((s): s is string => !!s));
  const maxHeight = Math.max(0, ...remaining.map((l) => l.height));

  // 3a. Split "Name, Designation" / "Name | Designation" lines into parts
  const parts: Line[] = [];
  for (const l of remaining) {
    const segs = l.text.split(/\s*(?:\||,|\s[–-]\s)\s*/).filter((s) => s.trim().length >= 2);
    if (segs.length > 1 && segs.some((s) => DESIGNATION_RE.test(s)) && !COMPANY_RE.test(l.text) && !PIN_RE.test(l.text)) {
      segs.forEach((s, i) => parts.push({ ...l, idx: l.idx + i * 0.1, text: s.trim() }));
    } else {
      parts.push(l);
    }
  }

  // 3b. Score company / address / designation
  const used = new Set<Line>();
  const companyCands = parts.map((l) => {
    let score = 0;
    if (COMPANY_RE.test(l.text)) score += 3;
    const letters = lettersOnly(l.text);
    if (stems.some((s) => s.length >= 4 && (letters.includes(s) || s.includes(letters)) && letters.length >= 3)) score += 3;
    if (isAllCaps(l.text) && wordCount(l.text) <= 5) score += 0.5;
    if (maxHeight && l.height >= maxHeight * 0.95) score += 0.5;
    if (/\d/.test(l.text)) score -= 1.5;
    if (DESIGNATION_RE.test(l.text) && !COMPANY_RE.test(l.text)) score -= 2;
    if (wordCount(l.text) > 7) score -= 2;
    return { item: l, score };
  });
  const company = pickBest(companyCands, 3);
  if (company) used.add(company.item);

  const addressLines = parts.filter((l) => {
    if (used.has(l)) return false;
    const hits = (l.text.match(ADDRESS_RE) ?? []).length;
    const hasPin = PIN_RE.test(l.text);
    const hasNumbers = /\d/.test(l.text) && /,/.test(l.text);
    const score = hits + (hasPin ? 2 : 0) + (hasNumbers ? 1 : 0) + (ORDINAL_RE.test(l.text) ? 1 : 0);
    if (/^address\b/i.test(l.text)) return true;
    // a lone keyword in a short line (e.g. "Sales Head") is not an address
    return score >= 2 || (score >= 1 && wordCount(l.text) >= 3 && !DESIGNATION_RE.test(l.text));
  });
  addressLines.forEach((l) => used.add(l));

  const designationCands = parts
    .filter((l) => !used.has(l))
    .map((l) => {
      let score = 0;
      const matches = l.text.match(new RegExp(DESIGNATION_RE.source, 'gi')) ?? [];
      score += matches.length * 2;
      if (wordCount(l.text) > 6) score -= 2;
      if (/\d|@/.test(l.text)) score -= 3;
      return { item: l, score };
    });
  const designation = pickBest(designationCands, 2, 0.5);
  if (designation) used.add(designation.item);

  // 4. Person name
  const emailLocals = emails.map((e) => e.split('@')[0]!.toLowerCase());
  const nameCands = parts
    .filter((l) => !used.has(l))
    .map((l) => ({ l, name: l.text.replace(HONORIFIC_RE, '').replace(/[.,;:]+$/, '').trim() }))
    .filter(({ name }) => {
      const words = wordCount(name);
      return (
        words >= 1 &&
        words <= 4 &&
        name.length <= 40 &&
        /^[A-Za-z][A-Za-z.'\- ]+$/.test(name) &&
        !COMPANY_RE.test(name) &&
        !DESIGNATION_RE.test(name)
      );
    })
    .map(({ l, name }) => {
      let score = 1;
      const tokens = name.toLowerCase().split(/[\s.]+/).filter((t) => t.length >= 2);
      const compactName = lettersOnly(name);
      const emailMatch = emailLocals.some((loc) => {
        if (!compactName) return false;
        if (loc.includes(compactName) || compactName.includes(loc)) return true;
        return tokens.some((token) => loc.includes(token) || token.includes(loc));
      });
      if (emailMatch) score += 4;
      if (designation && Math.abs(designation.item.idx - l.idx) <= 1.1) score += 2;
      if (maxHeight && l.height) score += l.height >= maxHeight * 0.95 ? 2 : l.height >= maxHeight * 0.75 ? 1 : 0;
      if (isTitleCase(name) || isAllCaps(name)) score += 1;
      if (stems.some((s) => lettersOnly(name).includes(s))) score -= 3; // it's the brand, not a person
      return { item: { l, name }, score };
    });
  const person = pickBest(nameCands, 2);

  // Assemble — only what we found; everything else stays null.
  const phones = unique([...mobiles, ...otherPhones]);
  const fields: ExtractionResult['fields'] = {
    personName: person ? (isAllCaps(person.item.name) ? toTitleCase(person.item.name) : person.item.name) : '',
    companyName: company ? company.item.text.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9.)]+$/g, '') : null,
    designation: designation ? designation.item.text : null,
    phone: phones.length ? phones.join(', ') : null,
    email: emails.length ? unique(emails).join(', ') : null,
    // Prefer an explicit "www." / "https://" address over a bare domain.
    website: websites.length
      ? unique(websites.map((w) => w.toLowerCase())).sort(
          (a, b) => Number(EXPLICIT_URL_RE.test(b)) - Number(EXPLICIT_URL_RE.test(a)),
        )[0]!
      : null,
    address: addressLines.length
      ? addressLines
          .sort((a, b) => a.idx - b.idx)
          .map((l) => l.text.replace(/^address\s*[:.\-]?\s*/i, ''))
          .join(', ')
          .replace(/\s*,\s*,+/g, ',')
      : null,
  };

  if (person && (person.ambiguous || person.score < 4)) lowConfidence.push('personName');
  if (company && company.ambiguous) lowConfidence.push('companyName');
  if (designation && designation.ambiguous) lowConfidence.push('designation');
  if (addressLines.length === 1 && !PIN_RE.test(addressLines[0]!.text)) lowConfidence.push('address');
  if (emailRepaired && emails.length) lowConfidence.push('email'); // rebuilt from a misread "@" — ask the user to check

  return { fields, lowConfidence };
}
