import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

export function ProgressBar({ value, height = 5 }: { value: number; height?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View
      style={[styles.track, { height }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: radius.pill },
});
