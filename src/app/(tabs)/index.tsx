import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Accent, AppText } from '@/components/AppText';
import { Logo } from '@/components/Logo';
import { ProgressBar } from '@/components/ProgressBar';
import { Card, Screen, SectionHeader } from '@/components/Screen';
import { EmptyState, TaskCardSkeleton } from '@/components/States';
import { SyncStatusLine } from '@/components/SyncStatusLine';
import { TaskCard } from '@/components/TaskCard';
import { userMessage } from '@/data/remote/errors';
import { computeMetrics } from '@/features/analytics/metrics';
import { useAuthStore } from '@/features/auth/authStore';
import { useRemoteRefresh, useTasks } from '@/features/tasks/hooks';
import { isOverdue, sortByUrgency } from '@/features/tasks/taskRules';
import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors, radius, spacing } from '@/theme/tokens';
import { greeting } from '@/utils/date';

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const online = useAppStore(selectIsOnline);
  const tasks = useTasks();
  const remote = useRemoteRefresh();

  const metrics = useMemo(() => computeMetrics(tasks.data ?? []), [tasks.data]);
  const upNext = useMemo(
    () => sortByUrgency((tasks.data ?? []).filter((t) => t.status !== 'completed')).slice(0, 4),
    [tasks.data],
  );
  const todayProgress = useMemo(() => {
    const open = (tasks.data ?? []).filter((t) => t.status !== 'completed');
    const total = open.reduce((n, t) => n + t.checklistTotal, 0);
    const done = open.reduce((n, t) => n + t.checklistDone, 0);
    return { total, done };
  }, [tasks.data]);

  const openTask = useCallback((id: string) => router.push(`/task/${id}`), []);
  const firstName = user?.fullName.split(' ')[0] ?? 'there';
  const urgent = (tasks.data ?? []).filter(
    (t) => t.status !== 'completed' && (t.priority === 'high' || isOverdue(t)),
  ).length;
  // The very first load has no cache yet: wait for the server before saying "empty".
  const initialLoading =
    tasks.isPending || (tasks.data?.length === 0 && remote.isPending && online);

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={remote.isRefetching}
          onRefresh={() => {
            remote.refetch();
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <View style={styles.header}>
        <Logo />
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel="Open profile"
          style={styles.avatar}
        >
          <AppText variant="label" tone="inverse">
            {initials(user?.fullName)}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <AppText variant="display" accessibilityRole="header">
          {greeting()}, {firstName}.{'\n'}
          {metrics.open === 0 ? (
            <Accent>You&apos;re all caught up.</Accent>
          ) : (
            <>
              You have <Accent>{urgent > 0 ? `${urgent} urgent` : metrics.open}</Accent>
              {urgent > 0 ? ' to handle.' : ' open tasks.'}
            </>
          )}
        </AppText>
        <SyncStatusLine refreshing={remote.isFetching} />
      </View>

      {remote.isError && !remote.isFetching ? (
        <Pressable
          onPress={() => remote.refetch()}
          style={styles.refreshError}
          accessibilityRole="button"
        >
          <Feather name="alert-circle" size={15} color={colors.accentPressed} />
          <AppText variant="caption" style={{ flex: 1, color: colors.accentPressed }}>
            {userMessage(remote.error)} Showing saved tasks.
          </AppText>
          <AppText variant="label" tone="accent">
            Retry
          </AppText>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        <StatTile label="Open" value={metrics.open} icon="layers" />
        <StatTile label="Due today" value={metrics.dueToday} icon="clock" />
        <StatTile
          label="Overdue"
          value={metrics.overdue}
          icon="alert-circle"
          highlight={metrics.overdue > 0}
        />
        <StatTile label="Done this week" value={metrics.completedThisWeek} icon="check-circle" />
      </View>

      <Card style={styles.progressCard}>
        <View style={styles.progressHead}>
          <AppText variant="bodyStrong">Checklist progress</AppText>
          <AppText variant="label" tone="secondary">
            {todayProgress.total
              ? `${Math.round((todayProgress.done / todayProgress.total) * 100)}%`
              : '—'}
          </AppText>
        </View>
        <ProgressBar
          value={todayProgress.total ? todayProgress.done / todayProgress.total : 0}
          height={7}
        />
        <AppText variant="caption" tone="tertiary">
          {todayProgress.done} of {todayProgress.total} steps done across your open tasks
        </AppText>
      </Card>

      <SectionHeader
        title="Up next"
        action={
          <Pressable onPress={() => router.push('/tasks')} accessibilityRole="link" hitSlop={10}>
            <AppText variant="label" tone="accent">
              See all
            </AppText>
          </Pressable>
        }
      />

      {initialLoading ? (
        <>
          <TaskCardSkeleton />
          <TaskCardSkeleton />
        </>
      ) : upNext.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title={tasks.data?.length ? 'Nothing left to do' : 'No tasks assigned yet'}
          message={
            tasks.data?.length
              ? 'Every assigned task is complete. Nice work.'
              : online
                ? 'New assignments will show up here.'
                : 'Connect to the internet to download your tasks.'
          }
          actionLabel="Refresh"
          onAction={() => remote.refetch()}
        />
      ) : (
        upNext.map((t) => <TaskCard key={t.id} task={t} onPress={openTask} />)
      )}
    </Screen>
  );
}

function StatTile({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Feather>['name'];
  highlight?: boolean;
}) {
  return (
    <View
      style={[styles.tile, highlight && styles.tileHighlight]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Feather name={icon} size={16} color={highlight ? colors.accent : colors.textSecondary} />
      <AppText variant="display" style={[styles.tileValue, highlight && { color: colors.accent }]}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function initials(name?: string) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { gap: spacing.md, marginTop: spacing.md },
  refreshError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 2,
  },
  tileHighlight: { borderColor: colors.accent, borderWidth: 1.5 },
  tileValue: { fontSize: 30, lineHeight: 36, marginTop: spacing.xs },
  progressCard: { gap: spacing.sm },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
