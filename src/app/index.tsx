import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Logo } from '@/components/Logo';
import { useAuthStore } from '@/features/auth/authStore';
import { colors, spacing } from '@/theme/tokens';

export default function Splash() {
  const status = useAuthStore((s) => s.status);

  if (status === 'signedIn') return <Redirect href="/(tabs)" />;
  if (status === 'signedOut') return <Redirect href="/login" />;

  return (
    <View style={styles.root}>
      <Logo size={34} />
      <View style={styles.row}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption" tone="secondary">
          Restoring your session…
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    backgroundColor: colors.surface,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
