import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { ConnectivityBanner } from './ConnectivityBanner';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  refreshControl?: ScrollViewProps['refreshControl'];
  background?: string;
}

export function Screen({
  children,
  scroll = false,
  edges = ['top'],
  contentStyle,
  refreshControl,
  background = colors.background,
}: ScreenProps) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={edges}>
      <ConnectivityBanner />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="title" accessibilityRole="header" style={styles.flex}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: spacing.lg + 4, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
});
