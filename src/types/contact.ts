/**
 * Domain types. Field names mirror the SQLite `contacts` columns
 * (camelCase here, snake_case in SQL); the repository maps between them.
 */
export interface Contact {
  id: string; // UUID v4, generated on the device (safe for offline creation + sync)
  personName: string;
  companyName: string | null;
  designation: string | null;
  phone: string | null; // one or more numbers, comma-separated
  email: string | null; // one or more addresses, comma-separated
  website: string | null;
  address: string | null;
  cardImagePath: string | null; // local file URI in app document storage
  nativeContactId: string | null; // id in the phone's Contacts app, if saved there
  rawOcrText: string | null;
  isFavourite: boolean;
  cardBackImagePath: string | null; // local file URI of the card's reverse side
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ── Structured / related records (schema v2) ──────────────────────────

export type PhoneLabel = 'mobile' | 'personal' | 'work' | 'office' | 'whatsapp' | 'other';
export type EmailLabel = 'work' | 'personal' | 'other';

export const PHONE_LABELS: readonly PhoneLabel[] = ['mobile', 'personal', 'work', 'office', 'whatsapp', 'other'];
export const EMAIL_LABELS: readonly EmailLabel[] = ['work', 'personal', 'other'];
export const LABEL_TEXT: Record<PhoneLabel | EmailLabel, string> = {
  mobile: 'Mobile',
  personal: 'Personal',
  work: 'Work',
  office: 'Office',
  whatsapp: 'WhatsApp',
  other: 'Other',
};

/** A phone number as edited in the form (P8). `id` is set for rows that already exist. */
export interface PhoneDraft {
  id?: string;
  label: PhoneLabel;
  countryIso: string | null; // chosen country; null only for unconfirmed migrated numbers
  number: string; // national number as typed (any formatting)
  needsReview?: boolean;
}

export interface EmailDraft {
  id?: string;
  label: EmailLabel;
  address: string;
}

interface SyncedRecord {
  id: string; // UUID v4
  createdAt: string;
  updatedAt: string;
}

export interface ContactPhone extends SyncedRecord {
  contactId: string;
  label: PhoneLabel;
  countryIso: string | null; // null = country not confirmed
  callingCode: string | null;
  nationalNumber: string;
  e164: string | null;
  rawInput: string | null;
  needsReview: boolean; // set by the v2 migration when the country couldn't be confirmed
  position: number;
}

export interface ContactEmail extends SyncedRecord {
  contactId: string;
  label: EmailLabel;
  address: string;
  position: number;
}

export interface Category extends SyncedRecord {
  name: string;
  color: string;
  icon: string | null;
  position: number;
}

export interface ContactEvent extends SyncedRecord {
  name: string;
  location: string | null;
  startsOn: string | null; // YYYY-MM-DD
  endsOn: string | null;
}

export interface Interaction extends SyncedRecord {
  contactId: string;
  occurredOn: string | null; // YYYY-MM-DD
  place: string | null;
  notes: string | null;
}

export interface Reminder extends SyncedRecord {
  contactId: string;
  title: string;
  dueAt: string; // ISO timestamp
  completedAt: string | null;
}

/** Editable fields — what the review form produces (P8: phones/emails are structured lists). */
export interface ContactInput {
  personName: string;
  companyName: string | null;
  designation: string | null;
  phones: PhoneDraft[];
  emails: EmailDraft[];
  website: string | null;
  address: string | null;
  cardImagePath: string | null;
  rawOcrText: string | null;
  /** P10. Omitted on update = leave unchanged. */
  categoryIds?: string[];
  isFavourite?: boolean;
}

export type ContactField = 'personName' | 'companyName' | 'designation' | 'phone' | 'email' | 'website' | 'address';

/** Fields as the OCR extraction module produces them (phones/emails as comma-separated text). */
export interface ExtractedFields {
  personName: string;
  companyName: string | null;
  designation: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
}

export interface DashboardStats {
  totalContacts: number;
  totalScannedCards: number; // contacts that have a stored card image
  uniqueCompanies: number;
}

export interface DuplicateMatch {
  contact: Contact;
  matchedOn: ('phone' | 'email')[];
}

/** Bounding box in image pixels. */
export interface OcrFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A single recognised line of text with its position (when the OCR engine provides one). */
export interface OcrLine {
  text: string;
  frame?: OcrFrame;
  blockIndex?: number;
}

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  /** Degrees the image was rotated before the best OCR result was obtained. */
  rotation?: number;
}

/** Output of the extraction module: a draft plus fields the user should double-check. */
export interface ExtractionResult {
  fields: ExtractedFields;
  lowConfidence: ContactField[];
}
