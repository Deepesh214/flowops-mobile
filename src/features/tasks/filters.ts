import type { Priority, TaskStatus, TaskSummary } from '@/types/domain';
import { endOfDay, endOfWeek } from '@/utils/date';

import { isOverdue } from './taskRules';

export type StatusFilter = 'all' | TaskStatus;
export type PriorityFilter = 'all' | Priority;
export type DueFilter = 'any' | 'today' | 'week' | 'overdue';
export type SyncFilter = 'all' | 'pending' | 'failed';

export interface TaskFilters {
  query: string;
  status: StatusFilter;
  priority: PriorityFilter;
  due: DueFilter;
  sync: SyncFilter;
}

export const DEFAULT_FILTERS: TaskFilters = {
  query: '',
  status: 'all',
  priority: 'all',
  due: 'any',
  sync: 'all',
};

export function hasActiveFilters(f: TaskFilters): boolean {
  return (
    f.query.trim() !== '' ||
    f.status !== 'all' ||
    f.priority !== 'all' ||
    f.due !== 'any' ||
    f.sync !== 'all'
  );
}

function matchesDue(task: TaskSummary, due: DueFilter, now: number): boolean {
  if (due === 'any') return true;
  if (due === 'overdue') return isOverdue(task, now);
  if (!task.dueAt) return false;
  const t = new Date(task.dueAt).getTime();
  // "Today"/"This week" include anything overdue up to the end of the window.
  const limit = due === 'today' ? endOfDay(now) : endOfWeek(now);
  return t <= limit && task.status !== 'completed';
}

export function applyFilters<T extends TaskSummary>(
  tasks: T[],
  f: TaskFilters,
  now = Date.now(),
): T[] {
  const q = f.query.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      (q === '' || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) &&
      (f.status === 'all' || t.status === f.status) &&
      (f.priority === 'all' || t.priority === f.priority) &&
      (f.sync === 'all' || t.syncState === f.sync) &&
      matchesDue(t, f.due, now),
  );
}
