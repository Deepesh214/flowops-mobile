import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors } from '@/theme/tokens';
import { timeAgo } from '@/utils/date';

import { AppText } from './AppText';

export function SyncStatusLine({ refreshing = false }: { refreshing?: boolean }) {
  const lastSyncedAt = useAppStore((s) => s.lastSyncedAt);
  const pending = useAppStore((s) => s.pendingCount);
  const failed = useAppStore((s) => s.failedCount);
  const online = useAppStore(selectIsOnline);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const parts = [refreshing ? 'Syncing…' : `Synced ${timeAgo(lastSyncedAt)}`];
  if (pending) parts.push(`${pending} pending`);
  if (failed) parts.push(`${failed} failed`);

  const icon = failed
    ? 'alert-triangle'
    : !online
      ? 'cloud-off'
      : pending
        ? 'upload-cloud'
        : 'check-circle';
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Feather name={icon} size={13} color={failed ? colors.accent : colors.textTertiary} />
      <AppText variant="caption" tone={failed ? 'accent' : 'tertiary'}>
        {parts.join(' · ')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
