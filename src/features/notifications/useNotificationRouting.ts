import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { remoteApi } from '@/data/container';
import { useTasks } from '@/features/tasks/hooks';
import { useAppStore } from '@/store/appStore';
import type { User } from '@/types/domain';

import {
  getPushToken,
  loadReminderPreference,
  routeForNotification,
  syncDueReminders,
} from './notifications';

/** Deep-links notification taps (foreground, background and cold start). */
export function useNotificationRouting(user: User | null) {
  const remindersEnabled = useAppStore((s) => s.remindersEnabled);
  const { data: tasks } = useTasks();

  useEffect(() => {
    loadReminderPreference().then((v) => useAppStore.getState().setRemindersEnabled(v));
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !user) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const route = response && routeForNotification(response.notification.request.content.data);
      if (route) router.push(route as never);
    };
    try {
      const last = Notifications.getLastNotificationResponse();
      if (last) open(last);
      const sub = Notifications.addNotificationResponseReceivedListener(open);
      return () => sub.remove();
    } catch {
      return undefined;
    }
  }, [user]);

  useEffect(() => {
    if (!remindersEnabled || !tasks) return;
    syncDueReminders(tasks);
  }, [remindersEnabled, tasks]);

  useEffect(() => {
    if (!remindersEnabled || !user || remoteApi.mode !== 'supabase') return;
    getPushToken().then((token) => {
      if (token) remoteApi.registerPushToken(user.id, token, Platform.OS).catch(() => undefined);
    });
  }, [remindersEnabled, user]);
}
