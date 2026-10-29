import Feather from '@expo/vector-icons/Feather';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card, Screen, SectionHeader } from '@/components/Screen';
import { localStore, remoteApi, syncEngine } from '@/data/container';
import { DemoApi } from '@/data/remote/demoApi';
import { useAuthStore } from '@/features/auth/authStore';
import {
  cancelAllReminders,
  ensureNotificationPermission,
  saveReminderPreference,
} from '@/features/notifications/notifications';
import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors, radius, spacing } from '@/theme/tokens';
import { formatDateTime, timeAgo } from '@/utils/date';

function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function ProfileScreen() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const app = useAppStore();
  const online = useAppStore(selectIsOnline);
  const [syncing, setSyncing] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  async function syncNow() {
    setSyncing(true);
    try {
      if (app.failedCount) await syncEngine.retryFailed();
      await qc.refetchQueries({ queryKey: ['remote-refresh'] });
    } finally {
      setSyncing(false);
    }
  }

  async function toggleReminders(next: boolean) {
    setReminderMsg(null);
    if (next) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setReminderMsg(
          Platform.OS === 'web'
            ? 'Reminders need the mobile app; browsers are not supported.'
            : 'Notifications are turned off for FlowOps. Enable them in system settings to get reminders.',
        );
        return;
      }
    } else {
      await cancelAllReminders();
    }
    app.setRemindersEnabled(next);
    await saveReminderPreference(next);
  }

  async function handleSignOut() {
    const warning = app.pendingCount
      ? `You have ${app.pendingCount} unsynced change${app.pendingCount === 1 ? '' : 's'} that will be lost.`
      : 'You will need to sign in again to see your tasks.';
    if (await confirm('Sign out?', warning, 'Sign out')) await signOut();
  }

  async function resetDemo() {
    if (!(remoteApi instanceof DemoApi)) return;
    if (!(await confirm('Reset demo data?', 'Restores the original demo tasks.', 'Reset'))) return;
    await remoteApi.reset();
    await localStore.clearAll();
    if (user) await localStore.setMeta('owner_user_id', user.id);
    await qc.refetchQueries({ queryKey: ['remote-refresh'] });
    await qc.invalidateQueries({ queryKey: ['tasks'] });
  }

  return (
    <Screen scroll>
      <AppText variant="display" accessibilityRole="header">
        Profile
      </AppText>

      <Card style={styles.account}>
        <View style={styles.avatar}>
          <AppText variant="title" tone="inverse">
            {user?.fullName.slice(0, 1) ?? '?'}
          </AppText>
        </View>
        <View style={styles.flex}>
          <AppText variant="heading">{user?.fullName}</AppText>
          <AppText variant="caption" tone="secondary">
            {user?.email}
          </AppText>
          <View style={{ marginTop: 6 }}>
            <Badge label={user?.role ?? 'Member'} tone="dark" caps />
          </View>
        </View>
      </Card>

      <SectionHeader title="Sync" />
      <Card style={styles.gap}>
        <Row
          icon={online ? 'wifi' : 'wifi-off'}
          label="Connection"
          value={online ? 'Online' : 'Offline'}
        />
        <Row
          icon="clock"
          label="Last synced"
          value={
            app.lastSyncedAt
              ? `${timeAgo(app.lastSyncedAt)} · ${formatDateTime(app.lastSyncedAt)}`
              : 'Never'
          }
        />
        <Row icon="upload-cloud" label="Pending changes" value={String(app.pendingCount)} />
        <Row
          icon="alert-triangle"
          label="Failed changes"
          value={String(app.failedCount)}
          accent={app.failedCount > 0}
        />
        {app.failedCount > 0 ? (
          <AppText variant="caption" tone="secondary">
            Some changes could not be saved to the server after several attempts. They are kept on
            this device — retry once you have a stable connection.
          </AppText>
        ) : null}
        <Button
          label={app.failedCount ? `Retry ${app.failedCount} failed` : 'Sync now'}
          icon="refresh-cw"
          variant={app.failedCount ? 'primary' : 'outline'}
          onPress={syncNow}
          loading={syncing}
          disabled={!online}
          accessibilityHint={online ? undefined : 'Available when you are online'}
        />
      </Card>

      <SectionHeader title="Settings" />
      <Card style={styles.gap}>
        <ToggleRow
          label="Due-date reminders"
          description={`Local alerts 30 minutes before a task is due, and when it becomes overdue.`}
          value={app.remindersEnabled}
          onChange={toggleReminders}
        />
        {reminderMsg ? (
          <AppText variant="caption" tone="accent">
            {reminderMsg}
          </AppText>
        ) : null}
        <View style={styles.divider} />
        <ToggleRow
          label="Simulate offline"
          description="Pretend the network is down to try offline mode without airplane mode."
          value={app.simulateOffline}
          onChange={app.setSimulateOffline}
        />
      </Card>

      <SectionHeader title="About" />
      <Card style={styles.gap}>
        <Row icon="smartphone" label="Version" value={Constants.expoConfig?.version ?? '1.0.0'} />
        <Row
          icon="database"
          label="Backend"
          value={remoteApi.mode === 'demo' ? 'Demo (on-device)' : 'Supabase'}
        />
        {remoteApi.mode === 'demo' ? (
          <Button
            label="Reset demo data"
            variant="ghost"
            icon="rotate-ccw"
            onPress={resetDemo}
            size="sm"
          />
        ) : null}
      </Card>

      <Button
        label="Sign out"
        variant="dark"
        icon="log-out"
        onPress={handleSignOut}
        testID="sign-out"
      />
    </Screen>
  );
}

function Row({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
      <Feather name={icon} size={16} color={accent ? colors.accent : colors.textSecondary} />
      <AppText variant="body" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" tone={accent ? 'accent' : 'primary'} style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        <AppText variant="caption" tone="secondary">
          {description}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.accent, false: colors.surfaceSunken }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  account: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  value: { flexShrink: 1, textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border },
});
