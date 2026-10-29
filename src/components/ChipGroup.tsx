import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: ChipGroupProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}: ${o.label}`}
            style={[styles.chip, selected && styles.selected]}
            hitSlop={4}
          >
            <AppText variant="label" tone={selected ? 'inverse' : 'primary'}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { backgroundColor: colors.dark, borderColor: colors.dark },
});
