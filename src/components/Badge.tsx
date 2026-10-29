import Feather from '@expo/vector-icons/Feather';
import { StyleSheet, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

export type BadgeTone =
  'accent' | 'dark' | 'neutral' | 'success' | 'warning' | 'info' | 'accentSoft';

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  accent: { bg: colors.accent, fg: colors.textOnAccent },
  accentSoft: { bg: colors.accentSoft, fg: colors.accentPressed },
  dark: { bg: colors.dark, fg: colors.textOnAccent },
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  info: { bg: colors.infoSoft, fg: colors.info },
};

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: React.ComponentProps<typeof Feather>['name'];
  caps?: boolean;
  accessibilityLabel?: string;
}

/** Always text (plus optional icon), so meaning never depends on color alone. */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  caps = false,
  accessibilityLabel,
}: BadgeProps) {
  const t = tones[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: t.bg }]}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {icon ? <Feather name={icon} size={11} color={t.fg} /> : null}
      <AppText
        variant="label"
        style={[
          { color: t.fg },
          caps && {
            textTransform: 'uppercase',
            fontFamily: fonts.bold,
            fontSize: 10.5,
            letterSpacing: 0.6,
          },
        ]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
});
