import type { TableSpec } from '@/sync/types';

/**
 * Every synced table, in PARENT → CHILD order (push order; purge runs reversed).
 * Column lists must match supabase/migrations exactly. Local-only columns
 * (needs_push, image flags, remote_* paths, native_contact_id, notification_id)
 * are deliberately absent.
 */
const TIMESTAMPS = ['created_at', 'updated_at', 'deleted_at'] as const;

export const SYNC_TABLES: readonly TableSpec[] = [
  {
    name: 'contacts',
    columns: [
      'person_name', 'company_name', 'designation',
      'phone', 'email', // legacy summary columns — kept until the "contract" migration
      'website', 'address', 'raw_ocr_text', 'is_favourite', 'shared_with_org', ...TIMESTAMPS,
    ],
    booleans: ['is_favourite', 'shared_with_org'],
    timestamps: TIMESTAMPS,
    images: [
      { column: 'card_image_path', remoteColumn: 'remote_image_path', flag: 'image_needs_push', suffix: '' },
      { column: 'card_back_image_path', remoteColumn: 'remote_back_image_path', flag: 'back_image_needs_push', suffix: '_back' },
    ],
  },
  { name: 'categories', columns: ['name', 'color', 'icon', 'position', ...TIMESTAMPS], timestamps: TIMESTAMPS },
  { name: 'events', columns: ['name', 'location', 'starts_on', 'ends_on', ...TIMESTAMPS], timestamps: TIMESTAMPS },
  {
    name: 'contact_phones',
    parent: 'contacts',
    columns: ['contact_id', 'label', 'country_iso', 'calling_code', 'national_number', 'e164', 'raw_input', 'needs_review', 'extension', 'position', ...TIMESTAMPS],
    booleans: ['needs_review'],
    timestamps: TIMESTAMPS,
  },
  {
    name: 'contact_emails',
    parent: 'contacts',
    columns: ['contact_id', 'label', 'address', 'position', ...TIMESTAMPS],
    timestamps: TIMESTAMPS,
  },
  {
    name: 'contact_addresses',
    parent: 'contacts',
    columns: ['contact_id', 'label', 'full_address', 'city', 'state', 'country', 'postal_code', 'position', ...TIMESTAMPS],
    timestamps: TIMESTAMPS,
  },
  { name: 'contact_categories', parent: 'contacts', columns: ['contact_id', 'category_id', ...TIMESTAMPS], timestamps: TIMESTAMPS },
  { name: 'event_contacts', parent: 'contacts', columns: ['event_id', 'contact_id', ...TIMESTAMPS], timestamps: TIMESTAMPS },
  {
    name: 'interactions',
    parent: 'contacts',
    columns: ['contact_id', 'occurred_on', 'place', 'notes', ...TIMESTAMPS],
    timestamps: TIMESTAMPS,
  },
  {
    name: 'reminders',
    parent: 'contacts',
    columns: ['contact_id', 'title', 'due_at', 'completed_at', ...TIMESTAMPS],
    timestamps: [...TIMESTAMPS, 'due_at', 'completed_at'],
  },
];

/** Tables whose rows belong to a contact and are soft-deleted with it. */
export const CONTACT_CHILD_TABLES = SYNC_TABLES.filter((t) => t.parent === 'contacts').map((t) => t.name);
