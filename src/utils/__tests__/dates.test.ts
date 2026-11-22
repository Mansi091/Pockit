import {
  addDays,
  bucketReminders,
  dayKey,
  daysBetween,
  formatDay,
  formatDue,
  isDayKey,
  monthGrid,
  parseDayKey,
  presetDate,
  relativeDay,
} from '@/utils/dates';

const NOW = new Date(2026, 10, 19, 15, 30); // Thu 19 Nov 2026, 3:30 PM local

describe('day keys', () => {
  it('round-trips local dates', () => {
    expect(dayKey(NOW)).toBe('2026-11-19');
    expect(dayKey(parseDayKey('2026-02-03'))).toBe('2026-02-03');
    expect(isDayKey('2026-11-19')).toBe(true);
    expect(isDayKey('19/11/2026')).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });

  it('counts calendar days, not 24h blocks', () => {
    expect(daysBetween(NOW, new Date(2026, 10, 20, 0, 5))).toBe(1);
    expect(daysBetween(NOW, addDays(NOW, -3))).toBe(-3);
  });
});

describe('labels', () => {
  it('formats days relative to today', () => {
    expect(relativeDay('2026-11-19', NOW)).toBe('Today');
    expect(relativeDay('2026-11-18', NOW)).toBe('Yesterday');
    expect(relativeDay('2026-11-20', NOW)).toBe('Tomorrow');
    expect(formatDay('2026-11-25', NOW)).toBe('Wed, 25 Nov');
    expect(formatDay('2025-01-02', NOW)).toBe('Thu, 2 Jan 2025');
  });

  it('formats due times', () => {
    expect(formatDue(new Date(2026, 10, 19, 17, 0).toISOString(), NOW)).toBe('Today, 5:00 PM');
    expect(formatDue(new Date(2026, 10, 20, 10, 0).toISOString(), NOW)).toBe('Tomorrow, 10:00 AM');
    expect(formatDue(new Date(2026, 10, 16, 10, 0).toISOString(), NOW)).toBe('Overdue · 3 days');
    expect(formatDue(new Date(2026, 10, 18, 9, 0).toISOString(), NOW)).toBe('Overdue · 1 day');
  });

  it('puts presets at 10 AM', () => {
    const d = presetDate('3days', NOW);
    expect(dayKey(d)).toBe('2026-11-22');
    expect(d.getHours()).toBe(10);
  });
});

describe('monthGrid', () => {
  it('starts weeks on Monday and pads with nulls', () => {
    const weeks = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
  });
});

describe('bucketReminders', () => {
  const r = (dueAt: Date, completedAt: string | null = null) => ({ dueAt: dueAt.toISOString(), completedAt });
  it('splits overdue / today / upcoming / done', () => {
    const b = bucketReminders(
      [
        r(new Date(2026, 10, 25, 10)),
        r(new Date(2026, 10, 17, 10)),
        r(new Date(2026, 10, 19, 9)), // earlier today → still "today", not overdue
        r(new Date(2026, 10, 19, 18)),
        r(new Date(2026, 10, 10, 10), '2026-11-11T00:00:00.000Z'),
      ],
      NOW,
    );
    expect(b.overdue).toHaveLength(1);
    expect(b.today).toHaveLength(2);
    expect(b.upcoming).toHaveLength(1);
    expect(b.done).toHaveLength(1);
    expect(new Date(b.today[0]!.dueAt).getHours()).toBe(9); // sorted by time
  });
});
