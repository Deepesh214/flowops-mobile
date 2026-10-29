import Feather from '@expo/vector-icons/Feather';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { isOverdue, STATUS_LABEL, PRIORITY_LABEL } from '@/features/tasks/taskRules';
import { colors, radius, spacing } from '@/theme/tokens';
import type { TaskSummary } from '@/types/domain';
import { relativeDue } from '@/utils/date';

import { AppText } from './AppText';
import { ProgressBar } from './ProgressBar';
import { PriorityBadge, StatusChip, SyncBadge } from './TaskBadges';

interface TaskCardProps {
  task: TaskSummary;
  onPress: (id: string) => void;
}

function TaskCardBase({ task, onPress }: TaskCardProps) {
  const overdue = isOverdue(task);
  const due = task.status === 'completed' ? 'Completed' : relativeDue(task.dueAt);
  const progress = task.checklistTotal ? task.checklistDone / task.checklistTotal : 0;

  return (
    <Pressable
      testID={`task-card-${task.id}`}
      onPress={() => onPress(task.id)}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}. ${PRIORITY_LABEL[task.priority]} priority. ${STATUS_LABEL[task.status]}. ${due}. ${task.checklistDone} of ${task.checklistTotal} steps done.`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <PriorityBadge priority={task.priority} />
        <StatusChip status={task.status} />
        <View style={styles.flex} />
        <SyncBadge state={task.syncState} />
      </View>

      <AppText variant="heading" numberOfLines={2}>
        {task.title}
      </AppText>

      <View style={styles.metaRow}>
        <Feather
          name={overdue ? 'alert-circle' : 'clock'}
          size={13}
          color={overdue ? colors.accent : colors.textTertiary}
        />
        <AppText variant="caption" tone={overdue ? 'accent' : 'secondary'}>
          {due}
        </AppText>
        {task.requiresEvidence ? (
          <>
            <AppText variant="caption" tone="tertiary">
              ·
            </AppText>
            <Feather name="camera" size={13} color={colors.textTertiary} />
            <AppText variant="caption" tone="secondary">
              Photo required
            </AppText>
          </>
        ) : null}
      </View>

      {task.checklistTotal > 0 ? (
        <View style={styles.progressRow}>
          <View style={styles.flex}>
            <ProgressBar value={progress} />
          </View>
          <AppText variant="label" tone="secondary">
            {task.checklistDone}/{task.checklistTotal}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

export const TaskCard = memo(TaskCardBase);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.surfaceMuted },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
