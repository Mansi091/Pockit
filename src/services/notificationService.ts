import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { isExpoGo } from '@/lib/runtime';

/**
 * Local follow-up notifications (expo-notifications). Scheduled on THIS device
 * only — nothing is sent through a server. After any change (or a cloud sync
 * that brings reminders from another phone) we cancel everything Pockit has
 * scheduled and schedule the open, future follow-ups again; that keeps the
 * device in step with the database without tracking diffs.
 *
 * Guarded like the other native modules: requiring expo-notifications without
 * its native side reports a fatal error in development, even inside try/catch.
 */
type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;
function load(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isExpoGo || !requireOptionalNativeModule('ExpoNotificationScheduler')) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

export const areNotificationsAvailable = () => load() !== null;

const CHANNEL = 'followups';
const MAX_SCHEDULED = 60; // Android caps alarms per app; the nearest 60 is plenty
let initialised = false;

/** Call once at startup: foreground display rules + the Android channel. */
export async function initNotifications(): Promise<void> {
  const N = load();
  if (!N || initialised) return;
  initialised = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, {
      name: 'Follow-up reminders',
      importance: N.AndroidImportance.HIGH,
      lightColor: '#4F46E5',
    });
  }
}

export type PermissionState = 'granted' | 'denied' | 'unavailable';

/** Asks only when needed (first follow-up), never at app start. */
export async function ensureNotificationPermission(): Promise<PermissionState> {
  const N = load();
  if (!N) return 'unavailable';
  const current = await N.getPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await N.requestPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

export interface SchedulableFollowUp {
  id: string;
  contactId: string;
  personName: string;
  title: string;
  dueAt: string;
}

/**
 * Replaces every scheduled follow-up notification with `items` (future ones
 * only, nearest first). Returns reminderId → notificationId for what was scheduled.
 */
export async function rescheduleAll(items: SchedulableFollowUp[], now = Date.now()): Promise<Map<string, string>> {
  const N = load();
  const ids = new Map<string, string>();
  if (!N) return ids;
  await initNotifications();
  await N.cancelAllScheduledNotificationsAsync();
  const perm = await N.getPermissionsAsync();
  if (!perm.granted) return ids;

  const future = items
    .filter((r) => new Date(r.dueAt).getTime() > now + 5_000)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, MAX_SCHEDULED);
  for (const r of future) {
    const id = await N.scheduleNotificationAsync({
      content: {
        title: `Follow up with ${r.personName}`,
        body: r.title,
        data: { contactId: r.contactId, reminderId: r.id },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(r.dueAt), channelId: CHANNEL },
    });
    ids.set(r.id, id);
  }
  return ids;
}

/** On sign-out: nothing from this account may ring for the next person. */
export async function cancelAllFollowUpNotifications(): Promise<void> {
  try {
    await load()?.cancelAllScheduledNotificationsAsync();
  } catch {
    // best effort
  }
}

/** Tapping a notification opens the contact. Returns an unsubscribe function. */
export function onNotificationTap(handler: (contactId: string) => void): () => void {
  const N = load();
  if (!N) return () => {};
  const open = (data: unknown) => {
    const contactId = (data as { contactId?: unknown } | null)?.contactId;
    if (typeof contactId === 'string') handler(contactId);
  };
  // A tap that launched the app from a killed state:
  const last = N.getLastNotificationResponse();
  if (last) open(last.notification.request.content.data);
  const sub = N.addNotificationResponseReceivedListener((resp) => open(resp.notification.request.content.data));
  return () => sub.remove();
}
