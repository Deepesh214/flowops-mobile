import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { ChipGroup } from '@/components/ChipGroup';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, TaskCardSkeleton } from '@/components/States';
import { SyncStatusLine } from '@/components/SyncStatusLine';
import { TaskCard } from '@/components/TaskCard';
import { userMessage } from '@/data/remote/errors';
import {
  applyFilters,
  DEFAULT_FILTERS,
  hasActiveFilters,
  type DueFilter,
  type PriorityFilter,
  type StatusFilter,
  type SyncFilter,
  type TaskFilters,
} from '@/features/tasks/filters';
import { useRemoteRefresh, useTasks } from '@/features/tasks/hooks';
import { sortByUrgency } from '@/features/tasks/taskRules';
import { colors, fonts, radius, spacing } from '@/theme/tokens';
import type { TaskSummary } from '@/types/domain';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
];
const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: 'all', label: 'Any priority' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'overdue', label: 'Overdue' },
];
const SYNC_OPTIONS: { value: SyncFilter; label: string }[] = [
  { value: 'all', label: 'Any sync state' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];

export default function TasksScreen() {
  const tasks = useTasks();
  const remote = useRemoteRefresh();
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  // Local search is instant; deferring keeps typing smooth on long lists.
  const deferred = useDeferredValue(filters);

  const visible = useMemo(
    () => sortByUrgency(applyFilters(tasks.data ?? [], deferred)),
    [tasks.data, deferred],
  );
  const set =
    <K extends keyof TaskFilters>(key: K) =>
    (value: TaskFilters[K]) =>
      setFilters((f) => ({ ...f, [key]: value }));

  const openTask = useCallback((id: string) => router.push(`/task/${id}`), []);
  const renderItem = useCallback(
    ({ item }: { item: TaskSummary }) => <TaskCard task={item} onPress={openTask} />,
    [openTask],
  );
  const active = hasActiveFilters(filters);
  const activeCount = (['status', 'priority', 'due', 'sync'] as const).filter(
    (k) => filters[k] !== DEFAULT_FILTERS[k],
  ).length;

  const header = (
    <View style={styles.header}>
      <AppText variant="display" accessibilityRole="header">
        Tasks
      </AppText>
      <SyncStatusLine refreshing={remote.isFetching} />

      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Feather name="search" size={17} color={colors.textTertiary} />
          <TextInput
            testID="task-search"
            value={filters.query}
            onChangeText={set('query')}
            placeholder="Search title or description"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            accessibilityLabel="Search tasks"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {filters.query ? (
            <Pressable
              onPress={() => set('query')('')}
              accessibilityLabel="Clear search"
              hitSlop={10}
            >
              <Feather name="x" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          style={[styles.filterButton, (showFilters || activeCount > 0) && styles.filterButtonOn]}
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeCount ? `, ${activeCount} active` : ''}`}
          accessibilityState={{ expanded: showFilters }}
        >
          <Feather
            name="sliders"
            size={17}
            color={showFilters || activeCount ? colors.textOnAccent : colors.text}
          />
          {activeCount > 0 ? (
            <AppText variant="label" tone="inverse">
              {activeCount}
            </AppText>
          ) : null}
        </Pressable>
      </View>

      <ChipGroup
        label="Status"
        options={STATUS_OPTIONS}
        value={filters.status}
        onChange={set('status')}
      />
      {showFilters ? (
        <View style={styles.moreFilters}>
          <ChipGroup
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={filters.priority}
            onChange={set('priority')}
          />
          <ChipGroup
            label="Due date"
            options={DUE_OPTIONS}
            value={filters.due}
            onChange={set('due')}
          />
          <ChipGroup
            label="Sync"
            options={SYNC_OPTIONS}
            value={filters.sync}
            onChange={set('sync')}
          />
        </View>
      ) : null}

      <View style={styles.countRow}>
        <AppText variant="caption" tone="secondary">
          {visible.length} {visible.length === 1 ? 'task' : 'tasks'}
        </AppText>
        {active ? (
          <Pressable
            onPress={() => setFilters(DEFAULT_FILTERS)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <AppText variant="label" tone="accent">
              Clear filters
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const loading =
    tasks.isPending ||
    (tasks.data?.length === 0 && remote.isPending && remote.fetchStatus !== 'idle');

  return (
    <Screen>
      <FlatList
        data={loading ? [] : visible}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        keyboardShouldPersistTaps="handled"
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
        ListEmptyComponent={
          loading ? (
            <View style={styles.skeletons}>
              <TaskCardSkeleton />
              <TaskCardSkeleton />
              <TaskCardSkeleton />
            </View>
          ) : tasks.isError ? (
            <ErrorState message="Saved tasks could not be read." onRetry={() => tasks.refetch()} />
          ) : (tasks.data?.length ?? 0) === 0 && remote.isError ? (
            <ErrorState
              title="Couldn't load tasks"
              message={userMessage(remote.error)}
              onRetry={() => remote.refetch()}
            />
          ) : active ? (
            <EmptyState
              icon="search"
              title="No matching tasks"
              message="Try a different search or remove some filters."
              actionLabel="Clear filters"
              onAction={() => setFilters(DEFAULT_FILTERS)}
            />
          ) : (
            <EmptyState
              title="No tasks yet"
              message="When work is assigned to you it will appear here."
              actionLabel="Refresh"
              onAction={() => remote.refetch()}
            />
          )
        }
      />
    </Screen>
  );
}

function Separator() {
  return <View style={{ height: spacing.md }} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg + 4, paddingBottom: spacing.xxl * 2 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 10,
  },
  filterButton: {
    minWidth: 46,
    height: 46,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonOn: { backgroundColor: colors.dark, borderColor: colors.dark },
  moreFilters: { gap: spacing.sm },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeletons: { gap: spacing.md },
});
