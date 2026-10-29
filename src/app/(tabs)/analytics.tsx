import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Accent, AppText } from '@/components/AppText';
import { Badge } from '@/components/Badge';
import { ProgressBar } from '@/components/ProgressBar';
import { Card, Screen, SectionHeader } from '@/components/Screen';
import { EmptyState, TaskCardSkeleton } from '@/components/States';
import { computeMetrics } from '@/features/analytics/metrics';
import { useTasks } from '@/features/tasks/hooks';
import { colors, radius, spacing } from '@/theme/tokens';

export default function AnalyticsScreen() {
  const tasks = useTasks();
  const m = useMemo(() => computeMetrics(tasks.data ?? []), [tasks.data]);
  const maxDay = Math.max(1, ...m.weekly.map((d) => d.completed));

  return (
    <Screen scroll>
      <AppText variant="display" accessibilityRole="header">
        Your week,{'\n'}
        <Accent>at a glance.</Accent>
      </AppText>
      <AppText variant="body" tone="secondary">
        Calculated on this device from your assigned tasks, so it works offline too.
      </AppText>

      {tasks.isPending ? (
        <TaskCardSkeleton />
      ) : m.total === 0 ? (
        <EmptyState
          icon="bar-chart-2"
          title="No data yet"
          message="Insights appear once you have assigned tasks."
        />
      ) : (
        <>
          <View
            style={styles.rateCard}
            accessible
            accessibilityLabel={`Completion rate ${Math.round(m.completionRate * 100)} percent`}
          >
            <Badge label={`${m.completed} of ${m.total} done`} tone="success" caps />
            <AppText variant="display" style={styles.rate}>
              {Math.round(m.completionRate * 100)}%
            </AppText>
            <AppText variant="bodyStrong">Completion rate</AppText>
            <ProgressBar value={m.completionRate} height={7} />
          </View>

          <View style={styles.row}>
            <Metric label="Completed" value={m.completed} />
            <Metric label="Pending" value={m.open} />
            <Metric label="Overdue" value={m.overdue} accent={m.overdue > 0} />
          </View>

          <SectionHeader title="Completed, last 7 days" />
          <Card>
            <View
              style={styles.chart}
              accessible
              accessibilityLabel={`Completed tasks per day: ${m.weekly
                .map(
                  (d) =>
                    `${new Date(d.day).toLocaleDateString(undefined, { weekday: 'long' })} ${d.completed}`,
                )
                .join(', ')}`}
            >
              {m.weekly.map((d, i) => {
                const isToday = i === m.weekly.length - 1;
                return (
                  <View key={d.day} style={styles.barCol}>
                    <AppText variant="label" tone={d.completed ? 'primary' : 'tertiary'}>
                      {d.completed}
                    </AppText>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${Math.max(4, (d.completed / maxDay) * 100)}%`,
                            backgroundColor: isToday ? colors.accent : colors.dark,
                            opacity: d.completed ? 1 : 0.15,
                          },
                        ]}
                      />
                    </View>
                    <AppText variant="label" tone={isToday ? 'accent' : 'secondary'}>
                      {d.label}
                    </AppText>
                  </View>
                );
              })}
            </View>
            <AppText variant="caption" tone="tertiary" style={{ marginTop: spacing.md }}>
              {m.completedThisWeek} completed this week
            </AppText>
          </Card>

          <SectionHeader title="By status" />
          <Card style={{ gap: spacing.md }}>
            <StatusRow label="Assigned" value={m.open - m.inProgress - m.blocked} total={m.total} />
            <StatusRow label="In Progress" value={m.inProgress} total={m.total} />
            <StatusRow label="Blocked" value={m.blocked} total={m.total} />
            <StatusRow label="Completed" value={m.completed} total={m.total} />
          </Card>
        </>
      )}
    </Screen>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText variant="title" style={accent ? { color: colors.accent } : undefined}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

function StatusRow({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statusHead}>
        <AppText variant="caption">{label}</AppText>
        <AppText variant="label" tone="secondary">
          {value}
        </AppText>
      </View>
      <ProgressBar value={value / Math.max(total, 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.dark,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  rate: { fontSize: 52, lineHeight: 58 },
  row: { flexDirection: 'row', gap: spacing.md },
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md + 2,
  },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 150, gap: spacing.sm },
  barCol: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: radius.sm },
  statusHead: { flexDirection: 'row', justifyContent: 'space-between' },
});
