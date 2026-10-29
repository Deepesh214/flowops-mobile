import { isOverdue } from '@/features/tasks/taskRules';
import type { TaskSummary } from '@/types/domain';
import { startOfDay } from '@/utils/date';

export interface DayBucket {
  /** Local midnight of the day, ms. */
  day: number;
  label: string;
  completed: number;
}

export interface TaskMetrics {
  total: number;
  completed: number;
  open: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueToday: number;
  completionRate: number; // 0..1
  weekly: DayBucket[];
  completedThisWeek: number;
}

const DAY = 86_400_000;

/** Completed tasks per local day for the last 7 days, oldest first. */
export function groupCompletedTasksByDay(tasks: TaskSummary[], now = Date.now()): DayBucket[] {
  const today = startOfDay(now);
  const buckets: DayBucket[] = Array.from({ length: 7 }, (_, i) => {
    const day = today - (6 - i) * DAY;
    return {
      day,
      label: new Date(day).toLocaleDateString(undefined, { weekday: 'narrow' }),
      completed: 0,
    };
  });
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.completedAt) continue;
    const day = startOfDay(new Date(t.completedAt).getTime());
    const bucket = buckets.find((b) => b.day === day);
    if (bucket) bucket.completed++;
  }
  return buckets;
}

export function computeMetrics(tasks: TaskSummary[], now = Date.now()): TaskMetrics {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const endToday = startOfDay(now) + DAY;
  const weekly = groupCompletedTasksByDay(tasks, now);
  return {
    total: tasks.length,
    completed,
    open: tasks.length - completed,
    inProgress: tasks.filter((t) => t.status === 'in_progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    overdue: tasks.filter((t) => isOverdue(t, now)).length,
    dueToday: tasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.dueAt !== null &&
        new Date(t.dueAt).getTime() >= now &&
        new Date(t.dueAt).getTime() < endToday,
    ).length,
    completionRate: completed / Math.max(tasks.length, 1),
    weekly,
    completedThisWeek: weekly.reduce((sum, b) => sum + b.completed, 0),
  };
}
