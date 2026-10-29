import type { Priority, TaskDetail, TaskStatus, TaskSummary } from '@/types/domain';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  completed: 'Completed',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Allowed business-status transitions. Completed is final. */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  assigned: ['in_progress', 'blocked', 'completed'],
  in_progress: ['blocked', 'completed'],
  blocked: ['in_progress'],
  completed: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function isOverdue(task: Pick<TaskSummary, 'status' | 'dueAt'>, now = Date.now()): boolean {
  return task.status !== 'completed' && task.dueAt !== null && new Date(task.dueAt).getTime() < now;
}

/**
 * Urgency order: open before completed, overdue first, then priority, then
 * soonest due date. Completed tasks show most recently finished first.
 */
export function sortByUrgency<T extends TaskSummary>(tasks: T[], now = Date.now()): T[] {
  return [...tasks].sort((a, b) => {
    const aDone = a.status === 'completed' ? 1 : 0;
    const bDone = b.status === 'completed' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    if (aDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');

    const aOver = isOverdue(a, now) ? 0 : 1;
    const bOver = isOverdue(b, now) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;

    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;

    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}

export function getCompletionBlockers(detail: TaskDetail): string[] {
  const blockers: string[] = [];
  const { task, checklist, attachments } = detail;

  if (task.status === 'completed') return ['This task is already completed.'];
  if (task.status === 'blocked') {
    blockers.push('This task is blocked. Move it back to In Progress first.');
  }

  const missing = checklist.filter((c) => c.isRequired && !c.isDone);
  if (missing.length === 1) blockers.push(`Required step not done: “${missing[0].label}”.`);
  else if (missing.length > 1)
    blockers.push(`${missing.length} required checklist steps are not done.`);

  // A pending (not yet uploaded) photo counts; a failed one does not.
  if (task.requiresEvidence && !attachments.some((a) => a.syncState !== 'failed')) {
    blockers.push('Add at least one photo as evidence.');
  }
  return blockers;
}
