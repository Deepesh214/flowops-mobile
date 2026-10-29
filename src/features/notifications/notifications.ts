import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DUE_SOON_MINUTES } from '@/constants/config';
import type { TaskSummary } from '@/types/domain';

const SUPPORTED = Platform.OS !== 'web';
const PREF_KEY = 'flowops.prefs.reminders';
const MAX_SCHEDULED = 20;

export type NotificationData =
  { kind: 'due'; taskId: string } | { kind: 'overdue'; taskId: string } | { kind: 'sync' };

/** Called once at startup: show reminders as banners even in the foreground. */
export function configureNotifications() {
  if (!SUPPORTED) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Unavailable in this runtime; reminders are best-effort.
  }
}

export async function loadReminderPreference(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PREF_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function saveReminderPreference(enabled: boolean) {
  await AsyncStorage.setItem(PREF_KEY, enabled ? '1' : '0');
}

/**
 * Asked in context (when the user turns reminders on), never at launch.
 * Returns false instead of throwing when the user declines.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!SUPPORTED) return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Task reminders',
        // eslint-disable-next-line import/namespace -- re-exported enum the resolver can't see
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Local due-soon / overdue reminders; replaces any previously scheduled ones. */
export async function syncDueReminders(tasks: TaskSummary[], now = Date.now()): Promise<number> {
  if (!SUPPORTED) return 0;
  try {
    await cancelAllReminders();
    const open = tasks
      .filter((t) => t.status !== 'completed' && t.dueAt)
      .sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))
      .slice(0, MAX_SCHEDULED);
    let count = 0;
    for (const t of open) {
      const due = new Date(t.dueAt!).getTime();
      const soon = due - DUE_SOON_MINUTES * 60_000;
      if (soon > now) {
        await schedule(
          'Task due soon',
          `${t.title} is due in ${DUE_SOON_MINUTES} minutes.`,
          { kind: 'due', taskId: t.id },
          soon,
        );
        count++;
      }
      if (due > now) {
        await schedule(
          'Task overdue',
          `${t.title} is overdue and still incomplete.`,
          { kind: 'overdue', taskId: t.id },
          due + 60_000,
        );
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function schedule(title: string, body: string, data: NotificationData, at: number) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(at),
      channelId: 'reminders',
    },
  });
}

export async function notifySyncIssue(failedCount: number) {
  if (!SUPPORTED) return;
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Sync issue',
        body:
          failedCount === 1
            ? '1 change could not be synchronized – tap to retry.'
            : `${failedCount} changes could not be synchronized – tap to retry.`,
        data: { kind: 'sync' } satisfies NotificationData,
      },
      trigger: null,
    });
  } catch {
    // Notifications are best-effort.
  }
}

export async function cancelAllReminders() {
  if (!SUPPORTED) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Nothing scheduled, or notifications unavailable.
  }
}

export function routeForNotification(data: unknown): string | null {
  const d = data as Partial<NotificationData> | undefined;
  if (!d || typeof d !== 'object') return null;
  if ((d.kind === 'due' || d.kind === 'overdue') && typeof d.taskId === 'string') {
    return `/task/${d.taskId}`;
  }
  if (d.kind === 'sync') return '/profile';
  return null;
}

/** Expo push token for server-sent pushes; null in Expo Go or simulators. */
export async function getPushToken(): Promise<string | null> {
  if (!SUPPORTED || !Device.isDevice) return null;
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
