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
  /** Opt-in: visible to this user's company admins (0005). Private by default. */
  sharedWithOrg: boolean;
  cardBackImagePath: string | null; // local file URI of the card's reverse side
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

// ── Structured / related records (schema v2) ──────────────────────────

/** Phone types. landline / direct / fax added in schema v4 (cloud 0007). */
export type PhoneLabel = 'mobile' | 'landline' | 'office' | 'direct' | 'fax' | 'whatsapp' | 'personal' | 'work' | 'other';
export type EmailLabel = 'work' | 'personal' | 'other';

export const PHONE_LABELS: readonly PhoneLabel[] = ['mobile', 'landline', 'office', 'direct', 'fax', 'whatsapp', 'personal', 'work', 'other'];
export const EMAIL_LABELS: readonly EmailLabel[] = ['work', 'personal', 'other'];
export const LABEL_TEXT: Record<PhoneLabel | EmailLabel, string> = {
  mobile: 'Mobile',
  landline: 'Landline',
  direct: 'Direct',
  fax: 'Fax',
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
  /** Digits only, e.g. "204" for "ext. 204". Kept separate from the number. */
  extension?: string | null;
  needsReview?: boolean;
}

// ── Addresses (schema v4 / cloud 0007) ────────────────────────────────

export type AddressLabel =
  | 'registered'
  | 'corporate'
  | 'head'
  | 'branch'
  | 'regional'
  | 'factory'
  | 'warehouse'
  | 'office'
  | 'home'
  | 'other';

export const ADDRESS_LABELS: readonly AddressLabel[] = [
  'registered', 'corporate', 'head', 'branch', 'regional', 'factory', 'warehouse', 'office', 'home', 'other',
];

export const ADDRESS_LABEL_TEXT: Record<AddressLabel, string> = {
  registered: 'Registered office',
  corporate: 'Corporate office',
  head: 'Head office',
  branch: 'Branch office',
  regional: 'Regional office',
  factory: 'Factory / Plant',
  warehouse: 'Warehouse',
  office: 'Office',
  home: 'Home',
  other: 'Other',
};

/** One address as edited in the form. Empty strings = not given. */
export interface AddressDraft {
  id?: string;
  label: AddressLabel;
  fullAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
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
  extension: string | null;
  position: number;
}

export interface ContactAddress extends SyncedRecord {
  contactId: string;
  label: AddressLabel;
  fullAddress: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
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
  /** Legacy single-address text. Used only when `addresses` is not given. */
  address: string | null;
  /** All addresses (v4). When omitted, `address` (if any) becomes one "Other" address. */
  addresses?: AddressDraft[];
  cardImagePath: string | null;
  /** P11 reverse side. Omitted on update = leave unchanged; null = remove. */
  cardBackImagePath?: string | null;
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
  phone: string | null; // all numbers, comma-separated (summary / older code)
  email: string | null;
  website: string | null;
  address: string | null; // all addresses joined with " | " (summary / older code)
  /** Every number with the type the card gave it (when known) and its extension. */
  phones?: ExtractedPhone[];
  /** Every address block on the card, kept separate. */
  addresses?: ExtractedAddress[];
}

export interface ExtractedPhone {
  /** The number as printed, minus labels like "(D)" and the extension. */
  raw: string;
  /** Type from the card's own label (M:, Tel:, Fax:, D:) — null when the card didn't say. */
  label: PhoneLabel | null;
  extension: string | null;
}

export interface ExtractedAddress {
  label: AddressLabel;
  fullAddress: string;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
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
  /**
   * Fields already identified by the OCR provider (web: Gemini via the scan-card
   * Edge Function). When present, the rule-based extractor is skipped.
   */
  fields?: ExtractedFields;
}

/** Output of the extraction module: a draft plus fields the user should double-check. */
export interface ExtractionResult {
  fields: ExtractedFields;
  lowConfidence: ContactField[];
}
