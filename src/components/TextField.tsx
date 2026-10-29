import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

export type TextInputHandle = React.ComponentRef<typeof TextInput>;

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  ref?: React.Ref<TextInputHandle>;
}

export function TextField({ label, error, style, onFocus, onBlur, ref, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label" tone="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={label ?? rest.placeholder}
        accessibilityHint={error}
        maxFontSizeMultiplier={1.5}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, focused && styles.focused, error ? styles.errorBorder : null, style]}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" tone="accent" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  label: { textTransform: 'uppercase' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  focused: { borderColor: colors.text },
  errorBorder: { borderColor: colors.accent },
});
