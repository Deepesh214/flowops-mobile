import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

interface StateProps {
  icon?: React.ComponentProps<typeof Feather>['name'];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon = 'inbox', title, message, actionLabel, onAction }: StateProps) {
  return (
    <View style={styles.box} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Feather name={icon} size={22} color={colors.text} />
      </View>
      <AppText variant="heading" style={styles.center}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" tone="secondary" style={styles.center}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="outline" size="sm" onPress={onAction} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      icon="alert-triangle"
      title={title}
      message={message}
      actionLabel={onRetry ? 'Retry' : undefined}
      onAction={onRetry}
    />
  );
}

export function TaskCardSkeleton() {
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[styles.skeleton, { opacity }]}
      accessibilityLabel="Loading tasks"
      accessibilityRole="progressbar"
    >
      <View style={[styles.bar, { width: 90 }]} />
      <View style={[styles.bar, { width: '80%', height: 16 }]} />
      <View style={[styles.bar, { width: '45%' }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  center: { textAlign: 'center' },
  skeleton: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bar: { height: 11, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken },
});
