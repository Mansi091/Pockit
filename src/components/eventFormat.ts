import { formatDay, todayKey } from '@/utils/dates';
import type { ContactEvent } from '@/types/contact';

/** "Tue, 19 Nov" or "Tue, 19 Nov – Thu, 21 Nov". */
export function eventDates(e: Pick<ContactEvent, 'startsOn' | 'endsOn'>): string {
  if (!e.startsOn) return '';
  if (!e.endsOn || e.endsOn === e.startsOn) return formatDay(e.startsOn);
  return `${formatDay(e.startsOn)} – ${formatDay(e.endsOn)}`;
}

export function isPastEvent(e: Pick<ContactEvent, 'startsOn' | 'endsOn'>): boolean {
  const end = e.endsOn ?? e.startsOn;
  return !!end && end < todayKey();
}
