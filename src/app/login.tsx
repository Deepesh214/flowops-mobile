import Feather from '@expo/vector-icons/Feather';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Accent, AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConnectivityBanner } from '@/components/ConnectivityBanner';
import { Logo } from '@/components/Logo';
import { DEMO_ACCOUNT, IS_DEMO_MODE } from '@/constants/config';
import { useAuthStore } from '@/features/auth/authStore';
import { LoginForm } from '@/features/auth/LoginForm';
import { colors, radius, spacing } from '@/theme/tokens';

export default function LoginScreen() {
  const status = useAuthStore((s) => s.status);
  const expired = useAuthStore((s) => s.expired);
  const signIn = useAuthStore((s) => s.signIn);
  const [prefill, setPrefill] = useState({ email: '', password: '' });

  if (status === 'signedIn') return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={styles.safe}>
      <ConnectivityBanner />
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Logo />

          <View style={styles.hero}>
            <AppText variant="display" accessibilityRole="header" style={styles.headline}>
              Turn every shift into <Accent>finished work.</Accent>
            </AppText>
            <AppText variant="body" tone="secondary">
              Your assigned tasks, checklists and photo evidence in one place.{' '}
              <AppText variant="bodyStrong">Even without signal.</AppText>
            </AppText>
          </View>

          <LoginForm
            onSubmit={signIn}
            initialEmail={prefill.email}
            initialPassword={prefill.password}
            banner={expired ? 'Your session expired. Sign in again to keep syncing.' : null}
          />

          <AppText variant="caption" tone="tertiary">
            Your session is stored securely on this device.{'\n'}© FlowOps
          </AppText>

          <View style={styles.footer}>
            <View style={styles.offlineIcon}>
              <Feather name="wifi-off" size={18} color={colors.text} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">Works offline</AppText>
              <AppText variant="caption" tone="secondary">
                Changes are saved instantly and sync when you reconnect.
              </AppText>
            </View>
          </View>

          {IS_DEMO_MODE ? (
            <View style={styles.demo}>
              <AppText variant="caption" tone="secondary">
                Demo mode — no backend configured. Data lives on this device.
              </AppText>
              <Button
                variant="dark"
                icon="user"
                label="Use demo account"
                onPress={() => setPrefill({ ...DEMO_ACCOUNT })}
              />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: {
    padding: spacing.xl,
    gap: spacing.xl,
    paddingBottom: spacing.xxl * 2,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  hero: { gap: spacing.md, marginTop: spacing.xl },
  headline: { fontSize: 36, lineHeight: 40 },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
  },
  offlineIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demo: { gap: spacing.sm },
});
