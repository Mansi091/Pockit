import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { getDb } from '@/database/db';
import { hexToUuid } from '@/database/categoryRepository';
import type { ContactEvent, Interaction, Reminder } from '@/types/contact';

/**
 * Raw SQL for P9/P12: interactions (meeting notes), reminders (follow-ups),
 * events and event ↔ contact links. Every write sets needs_push = 1 so the
 * sync engine uploads it; deletes are tombstones (deleted_at) so they sync too.
 * Business rules (validation, notifications) live in services/activityService.ts.
 */

const ALIVE = 'deleted_at IS NULL';

// ── Interactions ──────────────────────────────────────────────────────

interface InteractionRow {
  id: string;
  contact_id: string;
  occurred_on: string | null;
  place: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const toInteraction = (r: InteractionRow): Interaction => ({
  id: r.id,
  contactId: r.contact_id,
  occurredOn: r.occurred_on,
  place: r.place,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function interactionsForContact(contactId: string): Promise<Interaction[]> {
  const rows = await getDb().getAllAsync<InteractionRow>(
    `SELECT * FROM interactions WHERE contact_id = ? AND ${ALIVE}
     ORDER BY COALESCE(occurred_on, substr(created_at, 1, 10)) DESC, created_at DESC`,
    contactId,
  );
  return rows.map(toInteraction);
}

export async function insertInteraction(i: Interaction): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO interactions (id, contact_id, occurred_on, place, notes, created_at, updated_at, needs_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    i.id, i.contactId, i.occurredOn, i.place, i.notes, i.createdAt, i.updatedAt,
  );
}

export async function updateInteraction(i: Interaction): Promise<void> {
  await getDb().runAsync(
    `UPDATE interactions SET occurred_on = ?, place = ?, notes = ?, updated_at = ?, needs_push = 1 WHERE id = ? AND ${ALIVE}`,
    i.occurredOn, i.place, i.notes, i.updatedAt, i.id,
  );
}

export async function deleteInteraction(id: string, now: string): Promise<void> {
  await getDb().runAsync('UPDATE interactions SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
}

// ── Reminders ─────────────────────────────────────────────────────────

interface ReminderRow {
  id: string;
  contact_id: string;
  title: string;
  due_at: string;
  completed_at: string | null;
  notification_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReminderWithContact extends Reminder {
  personName: string;
  companyName: string | null;
  notificationId: string | null;
}

const toReminder = (r: ReminderRow & { person_name?: string; company_name?: string | null }): ReminderWithContact => ({
  id: r.id,
  contactId: r.contact_id,
  title: r.title,
  dueAt: r.due_at,
  completedAt: r.completed_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  notificationId: r.notification_id,
  personName: r.person_name ?? '',
  companyName: r.company_name ?? null,
});

const REMINDER_SELECT = `SELECT r.*, c.person_name, c.company_name FROM reminders r
  JOIN contacts c ON c.id = r.contact_id AND c.deleted_at IS NULL
  WHERE r.deleted_at IS NULL`;

export async function remindersForContact(contactId: string): Promise<ReminderWithContact[]> {
  const rows = await getDb().getAllAsync<ReminderRow>(`${REMINDER_SELECT} AND r.contact_id = ? ORDER BY r.due_at`, contactId);
  return rows.map(toReminder);
}

/** All open follow-ups plus the most recent completed ones. */
export async function allReminders(doneLimit = 30): Promise<ReminderWithContact[]> {
  const db = getDb();
  const open = await db.getAllAsync<ReminderRow>(`${REMINDER_SELECT} AND r.completed_at IS NULL ORDER BY r.due_at`);
  const done = await db.getAllAsync<ReminderRow>(
    `${REMINDER_SELECT} AND r.completed_at IS NOT NULL ORDER BY r.completed_at DESC LIMIT ?`,
    doneLimit,
  );
  return [...open, ...done].map(toReminder);
}

export async function insertReminder(r: Reminder): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO reminders (id, contact_id, title, due_at, completed_at, created_at, updated_at, needs_push)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    r.id, r.contactId, r.title, r.dueAt, r.completedAt, r.createdAt, r.updatedAt,
  );
}

export async function updateReminder(r: Pick<Reminder, 'id' | 'title' | 'dueAt' | 'completedAt' | 'updatedAt'>): Promise<void> {
  await getDb().runAsync(
    `UPDATE reminders SET title = ?, due_at = ?, completed_at = ?, updated_at = ?, needs_push = 1 WHERE id = ? AND ${ALIVE}`,
    r.title, r.dueAt, r.completedAt, r.updatedAt, r.id,
  );
}

export async function deleteReminder(id: string, now: string): Promise<void> {
  await getDb().runAsync('UPDATE reminders SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
}

/** Device-local: which scheduled notification belongs to which reminder. Not synced. */
export async function setReminderNotificationId(id: string, notificationId: string | null): Promise<void> {
  await getDb().runAsync('UPDATE reminders SET notification_id = ? WHERE id = ?', notificationId, id);
}

export async function clearAllNotificationIds(): Promise<void> {
  await getDb().runAsync('UPDATE reminders SET notification_id = NULL WHERE notification_id IS NOT NULL');
}

// ── Events ────────────────────────────────────────────────────────────

interface EventRow {
  id: string;
  name: string;
  location: string | null;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventWithCount extends ContactEvent {
  contactCount: number;
}

const toEvent = (r: EventRow & { contact_count?: number }): EventWithCount => ({
  id: r.id,
  name: r.name,
  location: r.location,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  contactCount: r.contact_count ?? 0,
});

const EVENT_SELECT = `SELECT e.*, (
    SELECT COUNT(*) FROM event_contacts l JOIN contacts k ON k.id = l.contact_id AND k.deleted_at IS NULL
    WHERE l.event_id = e.id AND l.deleted_at IS NULL
  ) AS contact_count
  FROM events e WHERE e.deleted_at IS NULL`;

export async function allEvents(): Promise<EventWithCount[]> {
  const rows = await getDb().getAllAsync<EventRow>(
    `${EVENT_SELECT} ORDER BY COALESCE(e.starts_on, substr(e.created_at, 1, 10)) DESC, e.created_at DESC`,
  );
  return rows.map(toEvent);
}

export async function findEvent(id: string): Promise<EventWithCount | null> {
  const row = await getDb().getFirstAsync<EventRow>(`${EVENT_SELECT} AND e.id = ?`, id);
  return row ? toEvent(row) : null;
}

export async function eventsForContact(contactId: string): Promise<EventWithCount[]> {
  const rows = await getDb().getAllAsync<EventRow>(
    `${EVENT_SELECT} AND EXISTS (SELECT 1 FROM event_contacts l WHERE l.event_id = e.id AND l.contact_id = ? AND l.deleted_at IS NULL)
     ORDER BY COALESCE(e.starts_on, substr(e.created_at, 1, 10)) DESC`,
    contactId,
  );
  return rows.map(toEvent);
}

export async function insertEvent(e: ContactEvent): Promise<void> {
  await getDb().runAsync(
    `INSERT INTO events (id, name, location, starts_on, ends_on, created_at, updated_at, needs_push) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    e.id, e.name, e.location, e.startsOn, e.endsOn, e.createdAt, e.updatedAt,
  );
}

export async function updateEvent(e: ContactEvent): Promise<void> {
  await getDb().runAsync(
    `UPDATE events SET name = ?, location = ?, starts_on = ?, ends_on = ?, updated_at = ?, needs_push = 1 WHERE id = ? AND ${ALIVE}`,
    e.name, e.location, e.startsOn, e.endsOn, e.updatedAt, e.id,
  );
}

/** Tombstones the event and its contact links (the contacts themselves stay). */
export async function deleteEvent(id: string, now: string): Promise<void> {
  const db = getDb();
  await db.runAsync('UPDATE event_contacts SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE event_id = ? AND deleted_at IS NULL', now, now, id);
  await db.runAsync('UPDATE events SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE id = ?', now, now, id);
}

export async function eventNameExists(name: string, exceptId?: string): Promise<boolean> {
  const row = await getDb().getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM events WHERE ${ALIVE} AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ?`,
    name, exceptId ?? '',
  );
  return (row?.n ?? 0) > 0;
}

/**
 * Deterministic link id (same idea as contact_categories): two offline devices
 * adding the same person to the same event produce the SAME row, so the cloud's
 * unique (event_id, contact_id) constraint never rejects a sync.
 */
export async function eventLinkId(eventId: string, contactId: string): Promise<string> {
  return hexToUuid(await digestStringAsync(CryptoDigestAlgorithm.SHA256, `event_contact:${eventId}:${contactId}`));
}

export async function addContactToEvent(eventId: string, contactId: string, now: string): Promise<void> {
  const db = getDb();
  const row = await db.getFirstAsync<{ id: string; deleted_at: string | null }>(
    'SELECT id, deleted_at FROM event_contacts WHERE event_id = ? AND contact_id = ?',
    eventId, contactId,
  );
  if (!row) {
    await db.runAsync(
      `INSERT INTO event_contacts (id, event_id, contact_id, created_at, updated_at, needs_push) VALUES (?, ?, ?, ?, ?, 1)`,
      await eventLinkId(eventId, contactId), eventId, contactId, now, now,
    );
  } else if (row.deleted_at) {
    await db.runAsync('UPDATE event_contacts SET deleted_at = NULL, updated_at = ?, needs_push = 1 WHERE id = ?', now, row.id);
  }
}

export async function removeContactFromEvent(eventId: string, contactId: string, now: string): Promise<void> {
  await getDb().runAsync(
    `UPDATE event_contacts SET deleted_at = ?, updated_at = ?, needs_push = 1 WHERE event_id = ? AND contact_id = ? AND ${ALIVE}`,
    now, now, eventId, contactId,
  );
}

export async function contactIdsForEvent(eventId: string): Promise<string[]> {
  const rows = await getDb().getAllAsync<{ contact_id: string }>(
    `SELECT l.contact_id FROM event_contacts l JOIN contacts c ON c.id = l.contact_id AND c.deleted_at IS NULL
     WHERE l.event_id = ? AND l.deleted_at IS NULL ORDER BY l.created_at DESC`,
    eventId,
  );
  return rows.map((r) => r.contact_id);
}

// ── Calendar ──────────────────────────────────────────────────────────

export type CalendarItem =
  | { kind: 'met'; day: string; contactId: string; personName: string; detail: string | null; id: string }
  | { kind: 'followup'; day: string; contactId: string; personName: string; detail: string; id: string; dueAt: string; done: boolean }
  | { kind: 'added'; day: string; contactId: string; personName: string; detail: string | null; id: string }
  | { kind: 'event'; day: string; eventId: string; name: string; detail: string | null; id: string };

/**
 * Everything that happened (or is due) between two day keys, inclusive.
 * Follow-up days and "added" days use the device's local date.
 */
export async function calendarItems(fromDay: string, toDay: string): Promise<CalendarItem[]> {
  const db = getDb();
  const items: CalendarItem[] = [];

  const met = await db.getAllAsync<{ id: string; day: string; contact_id: string; person_name: string; place: string | null; notes: string | null }>(
    `SELECT i.id, i.occurred_on AS day, i.contact_id, c.person_name, i.place, i.notes FROM interactions i
     JOIN contacts c ON c.id = i.contact_id AND c.deleted_at IS NULL
     WHERE i.deleted_at IS NULL AND i.occurred_on BETWEEN ? AND ?`,
    fromDay, toDay,
  );
  for (const m of met) {
    items.push({ kind: 'met', id: m.id, day: m.day, contactId: m.contact_id, personName: m.person_name, detail: m.place ?? m.notes });
  }

  // Timestamps are UTC; widen by a day each side, then filter by LOCAL day below.
  const wideFrom = `${fromDay}T00:00:00`;
  const reminders = await db.getAllAsync<ReminderRow & { person_name: string }>(
    `SELECT r.*, c.person_name FROM reminders r JOIN contacts c ON c.id = r.contact_id AND c.deleted_at IS NULL
     WHERE r.deleted_at IS NULL AND r.due_at >= date(?, '-1 day') AND r.due_at < date(?, '+2 day')`,
    wideFrom, toDay,
  );
  for (const r of reminders) {
    const d = new Date(r.due_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (day < fromDay || day > toDay) continue;
    items.push({ kind: 'followup', id: r.id, day, contactId: r.contact_id, personName: r.person_name, detail: r.title, dueAt: r.due_at, done: !!r.completed_at });
  }

  const added = await db.getAllAsync<{ id: string; created_at: string; person_name: string; company_name: string | null }>(
    `SELECT id, created_at, person_name, company_name FROM contacts
     WHERE deleted_at IS NULL AND created_at >= date(?, '-1 day') AND created_at < date(?, '+2 day')`,
    fromDay, toDay,
  );
  for (const c of added) {
    const d = new Date(c.created_at);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (day < fromDay || day > toDay) continue;
    items.push({ kind: 'added', id: `added:${c.id}`, day, contactId: c.id, personName: c.person_name, detail: c.company_name });
  }

  const events = await db.getAllAsync<EventRow>(
    `SELECT * FROM events WHERE deleted_at IS NULL AND starts_on IS NOT NULL
     AND starts_on <= ? AND COALESCE(ends_on, starts_on) >= ?`,
    toDay, fromDay,
  );
  for (const e of events) {
    // One entry per day the event runs, clipped to the range.
    const start = e.starts_on! < fromDay ? fromDay : e.starts_on!;
    const end = (e.ends_on ?? e.starts_on!) > toDay ? toDay : (e.ends_on ?? e.starts_on!);
    for (let d = new Date(`${start}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (day > end) break;
      items.push({ kind: 'event', id: `${e.id}:${day}`, day, eventId: e.id, name: e.name, detail: e.location });
    }
  }
  return items;
}
