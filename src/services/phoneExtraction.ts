import { fixMisreadPlus } from '@/utils/phone';
import type { ExtractedPhone, PhoneLabel } from '@/types/contact';

/**
 * Finds every phone number on ONE line of card text, with the type the card
 * gives it and its extension. Pure — unit tested in __tests__/phoneExtraction.test.ts.
 *
 * Handles what real cards print:
 *   "M: +91 98765 43210, 91234 56789"    → two mobiles
 *   "+91-44(D) 42235400"                  → (D) is a note, not digits → Direct, +91 44 42235400
 *   "Tel: 022 4000 1234 Ext. 204"         → landline, extension 204
 *   "Fax : +91 (7272) 228747, 227343"     → two fax numbers (the 2nd shares the 1st one's prefix)
 *   "T: 020 2567 8900 | M: 98765 43210"   → each number takes the label printed before it
 * Nothing is guessed: no label → null (the number's own type decides later).
 */

const NUMBER_RE = /(?:\+|00)?\(?\d[\d\s\-().\/]{5,}\d/g;
const DATE_RE = /^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/;

// "(D)", "(O)", "(Res)" … printed inside or right after a number.
const NOTATION_RE = /\(\s*(d|dir|direct|o|off|office|r|res|m|mob|f|fax|t|tel|w|wa)\s*\)/gi;
// "Ext. 204", "Extn: 12", "x 33"
const EXT_RE = /\b(?:ext(?:ension|n)?\.?|x)\s*[:.#-]?\s*(\d{1,8})\b/gi;
// Labels printed before numbers. Single letters must be followed by ":" "." or "-" so words aren't mistaken.
const LABEL_RE =
  /\b(?:(telefax|fax|mobile|mob|cell(?:ular)?|whats\s?app|telephone|tel|phone|ph|landline|direct|dir|office|off|residence|res|board|hp)\b\.?\s*(?:no\.?)?\s*[:\-]?|([fmtdorwp])\s*[:.\-])/gi;

const WORD_LABEL: Record<string, PhoneLabel> = {
  telefax: 'fax',
  fax: 'fax',
  mobile: 'mobile',
  mob: 'mobile',
  cell: 'mobile',
  cellular: 'mobile',
  hp: 'mobile',
  whatsapp: 'whatsapp',
  'whats app': 'whatsapp',
  telephone: 'landline',
  tel: 'landline',
  phone: 'landline',
  ph: 'landline',
  landline: 'landline',
  board: 'landline',
  direct: 'direct',
  dir: 'direct',
  office: 'office',
  off: 'office',
  residence: 'personal',
  res: 'personal',
};
const LETTER_LABEL: Record<string, PhoneLabel> = {
  f: 'fax',
  m: 'mobile',
  t: 'landline',
  p: 'landline',
  d: 'direct',
  o: 'office',
  r: 'personal',
  w: 'whatsapp',
};
const NOTATION_LABEL: Record<string, PhoneLabel> = {
  d: 'direct',
  dir: 'direct',
  direct: 'direct',
  o: 'office',
  off: 'office',
  office: 'office',
  r: 'personal',
  res: 'personal',
  m: 'mobile',
  mob: 'mobile',
  f: 'fax',
  fax: 'fax',
  t: 'landline',
  tel: 'landline',
  w: 'whatsapp',
  wa: 'whatsapp',
};

const digitsOf = (s: string) => s.replace(/\D/g, '');
const blank = (s: string, start: number, end: number) => s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);

function tidy(candidate: string): string | null {
  const trimmed = candidate.replace(/^[^\d+(]+|[^\d)]+$/g, '').replace(/\s+/g, ' ').trim();
  const digits = digitsOf(trimmed);
  if (digits.length < 7 || digits.length > 15) return null;
  if (DATE_RE.test(trimmed)) return null;
  return trimmed;
}

export interface LinePhones {
  phones: ExtractedPhone[];
  /** The line with numbers, notations and extensions blanked out (labels stay for the caller to strip). */
  rest: string;
}

export function extractPhonesFromLine(line: string): LinePhones {
  let text = line;

  // 1. Notations like "(D)": remember where they were, then blank them (keeps indices stable).
  const notes: { index: number; label: PhoneLabel }[] = [];
  for (const m of line.matchAll(NOTATION_RE)) {
    notes.push({ index: m.index!, label: NOTATION_LABEL[m[1]!.toLowerCase()]! });
    text = blank(text, m.index!, m.index! + m[0].length);
  }

  // 2. Extensions.
  const exts: { index: number; digits: string }[] = [];
  for (const m of text.matchAll(EXT_RE)) {
    exts.push({ index: m.index!, digits: m[1]! });
    text = blank(text, m.index!, m.index! + m[0].length);
  }

  // 3. Labels printed before numbers.
  const labels: { index: number; label: PhoneLabel }[] = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const label = m[1] ? WORD_LABEL[m[1].toLowerCase().replace(/\s+/g, ' ')] : LETTER_LABEL[m[2]!.toLowerCase()];
    if (label) labels.push({ index: m.index!, label });
  }

  // 4. Numbers (a "/" between two complete numbers means two numbers).
  type Found = { start: number; end: number; raw: string };
  const found: Found[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    const start = m.index!;
    const pieces = m[0].split(/\s*\/\s*/);
    const split = pieces.length > 1 && pieces.every((p) => digitsOf(p).length >= 7);
    let offset = 0;
    for (const piece of split ? pieces : [m[0]]) {
      const at = m[0].indexOf(piece, offset);
      offset = at + piece.length;
      const raw = tidy(piece);
      if (raw) found.push({ start: start + at, end: start + at + piece.length, raw });
    }
  }

  const phones: ExtractedPhone[] = [];
  found.forEach((f, i) => {
    const nextStart = found[i + 1]?.start ?? Infinity;
    // A notation inside or right after the number decides first, then the nearest label before it.
    const note = notes.find((n) => n.index >= f.start - 1 && n.index <= f.end + 3);
    const before = labels.filter((l) => l.index < f.start).pop();
    const label = note?.label ?? before?.label ?? null;
    const ext = exts.find((e) => e.index >= f.end - 1 && e.index < nextStart);
    const raw = fixMisreadPlus(f.raw) ?? f.raw; // OCR reads "+91" as "491"
    phones.push({ raw, label, extension: ext?.digits ?? null });

    // 5. Continuation: "228747, 227343" — a short group after a full number reuses its prefix.
    let cursor = f.end;
    for (;;) {
      const tail = text.slice(cursor);
      const m = /^\s*[,\/&]\s*(\d[\d\s-]{1,9}\d)(?!\d)/.exec(tail);
      if (!m) break;
      const short = digitsOf(m[1]!);
      const fullDigits = digitsOf(raw);
      if (short.length < 3 || short.length > 8 || short.length >= fullDigits.length - 1) break;
      const absolute = cursor + m.index + m[0].length;
      if (absolute > nextStart) break; // that's the next full number, handled on its own
      const joined = fullDigits.slice(0, fullDigits.length - short.length) + short;
      phones.push({ raw: raw.startsWith('+') ? `+${joined}` : joined, label, extension: null });
      text = blank(text, cursor, absolute);
      cursor = absolute;
    }
    text = blank(text, f.start, f.end);
  });

  return { phones, rest: text };
}

/** Mobiles first (they can call and WhatsApp), fax last; card order otherwise. Duplicates dropped. */
export function orderPhones(list: ExtractedPhone[]): ExtractedPhone[] {
  const key = (p: ExtractedPhone) => digitsOf(p.raw).slice(-10) + '|' + (p.extension ?? '');
  const seen = new Set<string>();
  const unique = list.filter((p) => {
    const k = key(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const looksIndianMobile = (p: ExtractedPhone) => /^(?:91|0)?[6-9]\d{9}$/.test(digitsOf(p.raw));
  const rank = (p: ExtractedPhone) =>
    p.label === 'fax' ? 3 : p.label === 'mobile' || p.label === 'whatsapp' || (!p.label && looksIndianMobile(p)) ? 0 : 1;
  return unique
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map((x) => x.p);
}
