/**
 * Date helpers for notes, follow-ups, events and the calendar.
 * "Day keys" are local calendar dates as YYYY-MM-DD (what the DB stores for
 * occurred_on / starts_on). Reminder due times are full ISO timestamps.
 * Pure functions — unit tested in __tests__/dates.test.ts.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date of `d` as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayKey = (now = new Date()) => dayKey(now);

/** YYYY-MM-DD → local midnight. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function isDayKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDayKey(s).getTime());
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const monthTitle = (year: number, month: number) => `${MONTHS_LONG[month]} ${year}`;

/** "Tue, 19 Nov 2026" (year omitted when it's the current year). */
export function formatDay(key: string, now = new Date()): string {
  const d = parseDayKey(key);
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "Today" / "Yesterday" / "Tomorrow" / formatDay. */
export function relativeDay(key: string, now = new Date()): string {
  const diff = daysBetween(now, parseDayKey(key));
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return formatDay(key, now);
}

export function formatTime(d: Date): string {
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Due label for a follow-up: "Today, 10:00 AM", "Overdue · 3 days", "Fri, 22 Nov, 10:00 AM". */
export function formatDue(dueIso: string, now = new Date()): string {
  const due = new Date(dueIso);
  const diff = daysBetween(now, due);
  if (due.getTime() < now.getTime() && diff < 0) return `Overdue · ${-diff} day${diff === -1 ? '' : 's'}`;
  return `${relativeDay(dayKey(due), now)}, ${formatTime(due)}`;
}

/** Follow-up quick picks — all at 10:00 local time. */
export type FollowUpPreset = 'tomorrow' | '3days' | 'week' | 'month';
export const FOLLOW_UP_PRESETS: { key: FollowUpPreset; label: string; days: number }[] = [
  { key: 'tomorrow', label: 'Tomorrow', days: 1 },
  { key: '3days', label: 'In 3 days', days: 3 },
  { key: 'week', label: 'Next week', days: 7 },
  { key: 'month', label: 'In a month', days: 30 },
];

export function presetDate(preset: FollowUpPreset, now = new Date()): Date {
  const days = FOLLOW_UP_PRESETS.find((p) => p.key === preset)!.days;
  const d = addDays(now, days);
  d.setHours(10, 0, 0, 0);
  return d;
}

/**
 * Month grid for a calendar: weeks (Mon→Sun) of day keys; days outside the
 * month are null so the grid stays rectangular.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: days }, (_, i) => dayKey(new Date(year, month, i + 1))),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Groups open/done follow-ups for the Planner list. */
export function bucketReminders<T extends { dueAt: string; completedAt: string | null }>(items: T[], now = new Date()) {
  const overdue: T[] = [];
  const today: T[] = [];
  const upcoming: T[] = [];
  const done: T[] = [];
  const todayK = dayKey(now);
  for (const r of items) {
    if (r.completedAt) done.push(r);
    else if (new Date(r.dueAt).getTime() < now.getTime() && dayKey(new Date(r.dueAt)) !== todayK) overdue.push(r);
    else if (dayKey(new Date(r.dueAt)) === todayK) today.push(r);
    else upcoming.push(r);
  }
  const byDue = (a: T, b: T) => a.dueAt.localeCompare(b.dueAt);
  overdue.sort(byDue);
  today.sort(byDue);
  upcoming.sort(byDue);
  done.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { overdue, today, upcoming, done };
}
