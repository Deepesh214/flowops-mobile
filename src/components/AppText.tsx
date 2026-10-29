import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fonts, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'inverse';

const toneColor: Record<Tone, string> = {
  primary: colors.text,
  secondary: colors.textSecondary,
  tertiary: colors.textTertiary,
  accent: colors.accent,
  inverse: colors.textOnAccent,
};

export interface AppTextProps extends TextProps {
  variant?: Variant;
  tone?: Tone;
}

export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[type[variant], { color: toneColor[tone] }, style]}
    />
  );
}

export function Accent({ children }: { children: React.ReactNode }) {
  return <Text style={styles.accent}>{children}</Text>;
}

const styles = StyleSheet.create({
  accent: { color: colors.accent, fontFamily: fonts.extrabold },
});
