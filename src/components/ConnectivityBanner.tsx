import Feather from '@expo/vector-icons/Feather';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

export function ConnectivityBanner() {
  const online = useAppStore(selectIsOnline);
  const simulated = useAppStore((s) => s.simulateOffline);
  const pending = useAppStore((s) => s.pendingCount);
  const notice = useAppStore((s) => s.notice);
  const setNotice = useAppStore((s) => s.setNotice);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice, setNotice]);

  return (
    <View>
      {!online ? (
        <View style={styles.offline} accessibilityRole="alert" testID="offline-banner">
          <Feather name="wifi-off" size={14} color={colors.textOnAccent} />
          <AppText variant="label" tone="inverse" style={styles.flex}>
            {simulated ? 'Offline (simulated)' : "You're offline"}
            {pending > 0
              ? ` · ${pending} change${pending === 1 ? '' : 's'} will sync when you reconnect`
              : ' · Changes are saved on this device'}
          </AppText>
        </View>
      ) : null}
      {notice ? (
        <Pressable
          style={styles.notice}
          onPress={() => setNotice(null)}
          accessibilityRole="alert"
          accessibilityHint="Dismiss"
        >
          <Feather name="info" size={14} color={colors.text} />
          <AppText variant="caption" style={styles.flex}>
            {notice}
          </AppText>
          <Feather name="x" size={14} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  flex: { flex: 1 },
});
