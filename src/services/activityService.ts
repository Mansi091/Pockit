import { randomUUID } from 'expo-crypto';
import { getDb } from '@/database/db';
import * as repo from '@/database/activityRepository';
import { findById as findContactById } from '@/database/contactRepository';
import { getMeta, META, setMeta } from '@/database/metaRepository';
import { emitContactsChanged } from '@/services/dataEvents';
import { requestSync } from '@/services/syncService';
import { ensureNotificationPermission, rescheduleAll, type PermissionState } from '@/services/notificationService';
import { isDayKey } from '@/utils/dates';
import type { Contact, ContactEvent, Interaction } from '@/types/contact';

export type { CalendarItem, EventWithCount, ReminderWithContact } from '@/database/activityRepository';

/**
 * P9 + P12 business rules: meeting notes, follow-ups (with local
 * notifications), events, event mode. Limits match the Postgres CHECKs in
 * supabase/migrations/0002 so nothing that saves locally is rejected by sync.
 */

const LIMITS = { place: 120, notes: 5000, title: 200, eventName: 80, location: 120 } as const;

function changed() {
  emitContactsChanged();
  requestSync();
}
const clean = (s: string | null | undefined) => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};

// ── Meeting notes ─────────────────────────────────────────────────────

export interface NoteInput {
  occurredOn: string | null; // YYYY-MM-DD
  place: string | null;
  notes: string | null;
}

export function validateNote(n: NoteInput): string | null {
  const place = clean(n.place);
  const notes = clean(n.notes);
  if (!place && !notes) return 'Add where you met or a note.';
  if (place && place.length > LIMITS.place) return `Place must be ${LIMITS.place} characters or fewer.`;
  if (notes && notes.length > LIMITS.notes) return `Notes must be ${LIMITS.notes} characters or fewer.`;
  if (n.occurredOn && !isDayKey(n.occurredOn)) return 'Pick a valid date.';
  return null;
}

export const getNotes = (contactId: string) => repo.interactionsForContact(contactId);

export async function addNote(contactId: string, input: NoteInput, opts: { silent?: boolean } = {}): Promise<Interaction> {
  const problem = validateNote(input);
  if (problem) throw new Error(problem);
  const now = new Date().toISOString();
  const note: Interaction = {
    id: randomUUID(),
    contactId,
    occurredOn: input.occurredOn,
    place: clean(input.place),
    notes: clean(input.notes),
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertInteraction(note);
  if (!opts.silent) changed();
  return note;
}

export async function updateNote(note: Interaction, input: NoteInput): Promise<void> {
  const problem = validateNote(input);
  if (problem) throw new Error(problem);
  await repo.updateInteraction({
    ...note,
    occurredOn: input.occurredOn,
    place: clean(input.place),
    notes: clean(input.notes),
    updatedAt: new Date().toISOString(),
  });
  changed();
}

export async function deleteNote(id: string): Promise<void> {
  await repo.deleteInteraction(id, new Date().toISOString());
  changed();
}

// ── Follow-ups ────────────────────────────────────────────────────────

export function validateFollowUp(title: string, due: Date | null): string | null {
  const t = title.trim();
  if (!t) return 'Say what to follow up about.';
  if (t.length > LIMITS.title) return `Keep it under ${LIMITS.title} characters.`;
  if (!due || Number.isNaN(due.getTime())) return 'Pick a date and time.';
  return null;
}

export const getFollowUps = (contactId: string) => repo.remindersForContact(contactId);
export const getAllFollowUps = () => repo.allReminders();

/** Returns the notification permission so the UI can explain if alerts are off. */
export async function addFollowUp(
  contactId: string,
  title: string,
  due: Date,
  opts: { silent?: boolean } = {},
): Promise<PermissionState> {
  const problem = validateFollowUp(title, due);
  if (problem) throw new Error(problem);
  const now = new Date().toISOString();
  await repo.insertReminder({
    id: randomUUID(),
    contactId,
    title: title.trim(),
    dueAt: due.toISOString(),
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const perm = await ensureNotificationPermission();
  if (!opts.silent) changed();
  return perm;
}

export async function updateFollowUp(r: repo.ReminderWithContact, title: string, due: Date): Promise<void> {
  const problem = validateFollowUp(title, due);
  if (problem) throw new Error(problem);
  await repo.updateReminder({ id: r.id, title: title.trim(), dueAt: due.toISOString(), completedAt: r.completedAt, updatedAt: new Date().toISOString() });
  changed();
}

export async function setFollowUpDone(r: repo.ReminderWithContact, done: boolean): Promise<void> {
  const now = new Date().toISOString();
  await repo.updateReminder({ id: r.id, title: r.title, dueAt: r.dueAt, completedAt: done ? now : null, updatedAt: now });
  changed();
}

/** Moves the follow-up `days` from now (same time of day as originally set). */
export async function snoozeFollowUp(r: repo.ReminderWithContact, days: number): Promise<void> {
  const original = new Date(r.dueAt);
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(original.getHours(), original.getMinutes(), 0, 0);
  await repo.updateReminder({ id: r.id, title: r.title, dueAt: next.toISOString(), completedAt: null, updatedAt: new Date().toISOString() });
  changed();
}

export async function deleteFollowUp(id: string): Promise<void> {
  await repo.deleteReminder(id, new Date().toISOString());
  changed();
}

let notificationsQueue: Promise<void> = Promise.resolve();

/**
 * Brings this device's scheduled notifications in line with the database.
 * Serialised so overlapping calls (save + sync at once) can't interleave.
 */
export function refreshNotifications(): Promise<void> {
  notificationsQueue = notificationsQueue
    .then(async () => {
      const open = (await repo.allReminders(0)).filter((r) => !r.completedAt);
      const scheduled = await rescheduleAll(open);
      await repo.clearAllNotificationIds();
      for (const [reminderId, notificationId] of scheduled) await repo.setReminderNotificationId(reminderId, notificationId);
    })
    .catch(() => {
      // Notifications are best-effort; the follow-up itself is saved either way.
    });
  return notificationsQueue;
}

// ── Events ────────────────────────────────────────────────────────────

export interface EventInput {
  name: string;
  location: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

export async function validateEvent(e: EventInput, exceptId?: string): Promise<string | null> {
  const name = e.name.trim();
  if (!name) return 'Give the event a name.';
  if (name.length > LIMITS.eventName) return `Name must be ${LIMITS.eventName} characters or fewer.`;
  if ((e.location ?? '').trim().length > LIMITS.location) return `Location must be ${LIMITS.location} characters or fewer.`;
  if (e.startsOn && !isDayKey(e.startsOn)) return 'Pick a valid start date.';
  if (e.endsOn && !isDayKey(e.endsOn)) return 'Pick a valid end date.';
  if (e.startsOn && e.endsOn && e.endsOn < e.startsOn) return 'The end date is before the start date.';
  if (await repo.eventNameExists(name, exceptId)) return 'You already have an event with this name.';
  return null;
}

export const getEvents = () => repo.allEvents();
export const getEvent = (id: string) => repo.findEvent(id);
export const getEventsForContact = (contactId: string) => repo.eventsForContact(contactId);

export async function createEvent(input: EventInput): Promise<ContactEvent> {
  const problem = await validateEvent(input);
  if (problem) throw new Error(problem);
  const now = new Date().toISOString();
  const e: ContactEvent = {
    id: randomUUID(),
    name: input.name.trim(),
    location: clean(input.location),
    startsOn: input.startsOn,
    endsOn: input.startsOn ? input.endsOn : null,
    createdAt: now,
    updatedAt: now,
  };
  await repo.insertEvent(e);
  changed();
  return e;
}

export async function updateEvent(existing: ContactEvent, input: EventInput): Promise<void> {
  const problem = await validateEvent(input, existing.id);
  if (problem) throw new Error(problem);
  await repo.updateEvent({
    ...existing,
    name: input.name.trim(),
    location: clean(input.location),
    startsOn: input.startsOn,
    endsOn: input.startsOn ? input.endsOn : null,
    updatedAt: new Date().toISOString(),
  });
  changed();
}

export async function deleteEvent(id: string): Promise<void> {
  await getDb().withTransactionAsync(() => repo.deleteEvent(id, new Date().toISOString()));
  if ((await getMeta(META.activeEventId)) === id) await setMeta(META.activeEventId, null);
  changed();
}

export async function addContactsToEvent(eventId: string, contactIds: string[], opts: { silent?: boolean } = {}): Promise<void> {
  const now = new Date().toISOString();
  await getDb().withTransactionAsync(async () => {
    for (const id of contactIds) await repo.addContactToEvent(eventId, id, now);
  });
  if (!opts.silent) changed();
}

export async function removeContactFromEvent(eventId: string, contactId: string): Promise<void> {
  await repo.removeContactFromEvent(eventId, contactId, new Date().toISOString());
  changed();
}

export async function getEventContacts(eventId: string): Promise<Contact[]> {
  const ids = await repo.contactIdsForEvent(eventId);
  const contacts = await Promise.all(ids.map((id) => findContactById(id)));
  return contacts.filter((c): c is Contact => !!c);
}

// ── Event mode (this device only) ─────────────────────────────────────

export async function getActiveEvent(): Promise<repo.EventWithCount | null> {
  const id = await getMeta(META.activeEventId);
  if (!id) return null;
  const e = await repo.findEvent(id);
  if (!e) await setMeta(META.activeEventId, null); // deleted (maybe on another device)
  return e;
}

export async function startEventMode(eventId: string): Promise<void> {
  await setMeta(META.activeEventId, eventId);
  emitContactsChanged();
}

export async function endEventMode(): Promise<void> {
  await setMeta(META.activeEventId, null);
  emitContactsChanged();
}

// ── First meeting (saved together with a newly scanned contact) ───────

export interface FirstMeeting {
  eventId: string | null;
  note: NoteInput | null; // null = nothing typed
  followUp: { title: string; due: Date } | null;
}

/**
 * Called right after createContact on the review screen: links the event,
 * stores the meeting note and the follow-up in one transaction.
 * Returns the notification permission when a follow-up was added.
 */
export async function recordFirstMeeting(contactId: string, m: FirstMeeting): Promise<PermissionState | null> {
  if (m.note) {
    const problem = validateNote(m.note);
    if (problem) throw new Error(problem);
  }
  if (m.followUp) {
    const problem = validateFollowUp(m.followUp.title, m.followUp.due);
    if (problem) throw new Error(problem);
  }
  const now = new Date().toISOString();
  await getDb().withTransactionAsync(async () => {
    if (m.eventId) await repo.addContactToEvent(m.eventId, contactId, now);
    if (m.note) {
      await repo.insertInteraction({
        id: randomUUID(),
        contactId,
        occurredOn: m.note.occurredOn,
        place: clean(m.note.place),
        notes: clean(m.note.notes),
        createdAt: now,
        updatedAt: now,
      });
    }
    if (m.followUp) {
      await repo.insertReminder({
        id: randomUUID(),
        contactId,
        title: m.followUp.title.trim(),
        dueAt: m.followUp.due.toISOString(),
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  const perm = m.followUp ? await ensureNotificationPermission() : null;
  changed();
  return perm;
}

// ── Calendar ──────────────────────────────────────────────────────────

export const getCalendarItems = (fromDay: string, toDay: string) => repo.calendarItems(fromDay, toDay);
