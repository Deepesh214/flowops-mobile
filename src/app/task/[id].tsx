import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { Card, Screen } from '@/components/Screen';
import { EmptyState, ErrorState, TaskCardSkeleton } from '@/components/States';
import { PriorityBadge, StatusChip, SyncBadge } from '@/components/TaskBadges';
import { syncEngine } from '@/data/container';
import { TaskRuleError } from '@/data/repositories/taskRepository';
import { useTask, useTaskActions } from '@/features/tasks/hooks';
import {
  AddEvidenceTile,
  ChecklistRow,
  EvidenceThumb,
  NoteItem,
} from '@/features/tasks/TaskSections';
import { getCompletionBlockers, isOverdue } from '@/features/tasks/taskRules';
import { selectIsOnline, useAppStore } from '@/store/appStore';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { TaskStatus } from '@/types/domain';
import { formatDateTime, relativeDue } from '@/utils/date';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useTask(id);
  const actions = useTaskActions(id);
  const online = useAppStore(selectIsOnline);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/tasks'));

  const header = (
    <View style={styles.topBar}>
      <Pressable
        onPress={back}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Feather name="arrow-left" size={20} color={colors.text} />
      </Pressable>
    </View>
  );

  if (query.isPending) {
    return (
      <Screen contentStyle={styles.pad}>
        {header}
        <TaskCardSkeleton />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen contentStyle={styles.pad}>
        {header}
        <ErrorState
          message="This task could not be loaded from the device."
          onRetry={() => query.refetch()}
        />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen contentStyle={styles.pad}>
        {header}
        <EmptyState
          icon="file-minus"
          title="Task not found"
          message="It may have been reassigned or removed. Pull to refresh your task list."
          actionLabel="Back to tasks"
          onAction={() => router.replace('/tasks')}
        />
      </Screen>
    );
  }

  const detail = query.data;
  const { task, checklist, notes, attachments } = detail;
  const readOnly = task.status === 'completed';
  const done = checklist.filter((c) => c.isDone).length;
  const overdue = isOverdue(task);

  async function changeStatus(status: TaskStatus) {
    setActionError(null);
    setBlockers([]);
    if (status === 'completed') {
      const found = getCompletionBlockers(detail);
      if (found.length) {
        setBlockers(found);
        return;
      }
    }
    try {
      await actions.setStatus.mutateAsync(status);
    } catch (e) {
      if (e instanceof TaskRuleError) setBlockers(e.reasons);
      else setActionError('Could not save this change. Please try again.');
    }
  }

  async function saveNote() {
    setNoteError(null);
    try {
      await actions.addNote.mutateAsync(note);
      setNote('');
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : 'Could not save the note.');
    }
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}

        <View style={styles.badges}>
          <PriorityBadge priority={task.priority} />
          <StatusChip status={task.status} />
          <SyncBadge state={detail.syncState} />
        </View>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          {task.title}
        </AppText>
        {task.description ? (
          <AppText variant="body" tone="secondary">
            {task.description}
          </AppText>
        ) : null}

        {detail.syncState === 'failed' ? (
          <View style={styles.failBox} accessibilityRole="alert">
            <Feather name="alert-triangle" size={16} color={colors.accentPressed} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" style={{ color: colors.accentPressed }}>
                Some changes didn&apos;t sync
              </AppText>
              <AppText variant="caption" style={{ color: colors.accentPressed }}>
                {detail.lastError ?? 'The server rejected a change.'} Your work is still saved on
                this device.
              </AppText>
            </View>
            <Button
              label="Retry"
              size="sm"
              onPress={() => syncEngine.retryFailed()}
              disabled={!online}
            />
          </View>
        ) : null}

        <Card style={styles.meta}>
          <MetaRow
            icon={overdue ? 'alert-circle' : 'calendar'}
            label="Due"
            value={task.dueAt ? `${formatDateTime(task.dueAt)}` : 'No due date'}
            sub={task.status === 'completed' ? undefined : relativeDue(task.dueAt)}
            accent={overdue}
          />
          {task.completedAt ? (
            <MetaRow
              icon="check-circle"
              label="Completed"
              value={formatDateTime(task.completedAt)}
            />
          ) : null}
          <MetaRow
            icon="camera"
            label="Photo evidence"
            value={task.requiresEvidence ? 'Required to complete' : 'Optional'}
          />
        </Card>

        {readOnly ? (
          <View style={styles.readOnly}>
            <Feather name="lock" size={14} color={colors.success} />
            <AppText variant="caption" style={{ color: colors.success, flex: 1 }}>
              This task is completed and read-only.
            </AppText>
          </View>
        ) : null}

        {/* Checklist */}
        <View style={styles.sectionHead}>
          <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
            Checklist
          </AppText>
          <AppText variant="label" tone="secondary">
            {done}/{checklist.length}
          </AppText>
        </View>
        {checklist.length ? <ProgressBar value={done / checklist.length} /> : null}
        <Card style={styles.checkCard}>
          {checklist.length === 0 ? (
            <AppText variant="caption" tone="tertiary" style={{ padding: spacing.sm }}>
              No checklist for this task.
            </AppText>
          ) : (
            checklist.map((item) => (
              <ChecklistRow
                key={item.id}
                item={item}
                disabled={readOnly}
                onToggle={(i) =>
                  actions.toggleChecklist.mutate({ itemId: i.id, isDone: !i.isDone })
                }
              />
            ))
          )}
        </Card>

        {/* Evidence */}
        <View style={styles.sectionHead}>
          <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
            Evidence
          </AppText>
          <AppText variant="label" tone="secondary">
            {attachments.length} photo{attachments.length === 1 ? '' : 's'}
          </AppText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
        >
          {readOnly ? null : (
            <AddEvidenceTile onPress={() => router.push(`/evidence/${task.id}`)} />
          )}
          {attachments.map((a) => (
            <EvidenceThumb key={a.id} attachment={a} />
          ))}
          {readOnly && attachments.length === 0 ? (
            <AppText variant="caption" tone="tertiary">
              No photos were attached.
            </AppText>
          ) : null}
        </ScrollView>

        {/* Notes */}
        <AppText variant="heading" accessibilityRole="header" style={styles.sectionHead}>
          Notes
        </AppText>
        <View style={styles.notes}>
          {notes.length === 0 ? (
            <AppText variant="caption" tone="tertiary">
              No notes yet.
            </AppText>
          ) : (
            notes.map((n) => <NoteItem key={n.id} note={n} />)
          )}
          <TextInput
            testID="note-input"
            value={note}
            onChangeText={setNote}
            placeholder="Add a note for this task…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            style={styles.noteInput}
            accessibilityLabel="New note"
          />
          {noteError ? (
            <AppText variant="caption" tone="accent">
              {noteError}
            </AppText>
          ) : null}
          <Button
            label="Save note"
            variant="outline"
            size="sm"
            icon="message-square"
            onPress={saveNote}
            loading={actions.addNote.isPending}
            disabled={!note.trim()}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      </ScrollView>

      {!readOnly ? (
        <View style={styles.footer}>
          {blockers.length ? (
            <View style={styles.blockers} accessibilityRole="alert" testID="completion-blockers">
              <AppText variant="bodyStrong">Before you can complete this task:</AppText>
              {blockers.map((b) => (
                <View key={b} style={styles.blockerRow}>
                  <Feather name="x-circle" size={14} color={colors.accent} />
                  <AppText variant="caption" style={styles.flex}>
                    {b}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}
          {actionError ? (
            <AppText variant="caption" tone="accent">
              {actionError}
            </AppText>
          ) : null}
          <View style={styles.footerRow}>
            {task.status === 'assigned' ? (
              <Button
                label="Start task"
                variant="dark"
                icon="play"
                onPress={() => changeStatus('in_progress')}
                style={styles.flex}
              />
            ) : task.status === 'in_progress' ? (
              <Button
                label="Blocked"
                variant="outline"
                icon="slash"
                onPress={() => changeStatus('blocked')}
              />
            ) : (
              <Button
                label="Resume task"
                variant="dark"
                icon="play"
                onPress={() => changeStatus('in_progress')}
                style={styles.flex}
              />
            )}
            {task.status !== 'blocked' ? (
              <Button
                testID="complete-task"
                label="Complete"
                icon="check"
                onPress={() => changeStatus('completed')}
                loading={actions.setStatus.isPending}
                style={styles.flex}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function MetaRow({
  icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <View
      style={styles.metaRow}
      accessible
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
    >
      <Feather name={icon} size={16} color={accent ? colors.accent : colors.textSecondary} />
      <AppText variant="caption" tone="secondary" style={{ width: 104 }}>
        {label}
      </AppText>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{value}</AppText>
        {sub ? (
          <AppText variant="caption" tone={accent ? 'accent' : 'tertiary'}>
            {sub}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: spacing.lg + 4, gap: spacing.lg },
  content: { padding: spacing.lg + 4, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  topBar: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  title: { fontSize: 26, lineHeight: 32 },
  failBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  meta: { gap: spacing.md, marginTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  readOnly: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  checkCard: { padding: spacing.xs },
  thumbs: { gap: spacing.md },
  notes: { gap: spacing.sm },
  noteInput: {
    minHeight: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  blockers: {
    gap: 6,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  blockerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
