import Feather from '@expo/vector-icons/Feather';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, HIT_SIZE, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

type Variant = 'primary' | 'dark' | 'outline' | 'ghost';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof Feather>['name'];
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: ViewStyle;
  accessibilityHint?: string;
  testID?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.textOnAccent },
  dark: { bg: colors.dark, pressed: '#333333', fg: colors.textOnAccent },
  outline: {
    bg: colors.surface,
    pressed: colors.surfaceMuted,
    fg: colors.text,
    border: colors.text,
  },
  ghost: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.text },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  size = 'md',
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        {
          backgroundColor: pressed ? p.pressed : p.bg,
          borderColor: p.border ?? 'transparent',
          opacity: disabled && !loading ? 0.45 : 1,
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={p.fg} size="small" />
        ) : icon ? (
          <Feather name={icon} size={size === 'sm' ? 15 : 17} color={p.fg} />
        ) : null}
        <AppText variant="bodyStrong" style={{ color: p.fg, fontSize: size === 'sm' ? 14 : 15 }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: HIT_SIZE + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg + 2,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  sm: { minHeight: HIT_SIZE - 6, paddingHorizontal: spacing.md },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
