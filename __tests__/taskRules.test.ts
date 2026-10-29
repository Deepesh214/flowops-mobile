import { applyFilters, DEFAULT_FILTERS, hasActiveFilters } from '@/features/tasks/filters';
import {
  canTransition,
  getCompletionBlockers,
  isOverdue,
  sortByUrgency,
} from '@/features/tasks/taskRules';
import type { TaskDetail } from '@/types/domain';

import { makeTask, NOW } from './helpers';

const now = NOW.getTime();
const hours = (h: number) => new Date(now + h * 3_600_000).toISOString();

function detail(overrides: Partial<TaskDetail> = {}, taskOverrides = {}): TaskDetail {
  const { checklistDone: _a, checklistTotal: _b, syncState: _c, ...task } = makeTask(taskOverrides);
  return {
    task,
    checklist: [],
    notes: [],
    attachments: [],
    syncState: 'synced',
    lastError: null,
    ...overrides,
  };
}

describe('completion validation', () => {
  const item = (isRequired: boolean, isDone: boolean, label = 'Step') => ({
    id: label,
    taskId: 't1',
    label,
    isRequired,
    isDone,
    sortOrder: 0,
    updatedAt: '',
  });

  it('passes when required items are done and no evidence is required', () => {
    expect(
      getCompletionBlockers(detail({ checklist: [item(true, true), item(false, false)] })),
    ).toEqual([]);
  });

  it('names the single missing required step', () => {
    const blockers = getCompletionBlockers(
      detail({ checklist: [item(true, false, 'Lock out power')] }),
    );
    expect(blockers).toEqual(['Required step not done: “Lock out power”.']);
  });

  it('counts multiple missing required steps', () => {
    const blockers = getCompletionBlockers(
      detail({ checklist: [item(true, false, 'a'), item(true, false, 'b')] }),
    );
    expect(blockers[0]).toMatch(/2 required checklist steps/);
  });

  it('requires evidence; a pending (offline) photo counts but a failed one does not', () => {
    const photo = (syncState: 'pending' | 'failed' | 'synced') => ({
      id: 'p',
      taskId: 't1',
      localUri: 'file://p.jpg',
      remotePath: null,
      caption: '',
      mimeType: 'image/jpeg',
      createdAt: '',
      syncState,
    });
    const needs = { requiresEvidence: true };
    expect(getCompletionBlockers(detail({}, needs))).toContain(
      'Add at least one photo as evidence.',
    );
    expect(getCompletionBlockers(detail({ attachments: [photo('pending')] }, needs))).toEqual([]);
    expect(getCompletionBlockers(detail({ attachments: [photo('failed')] }, needs))).toContain(
      'Add at least one photo as evidence.',
    );
  });

  it('blocks completion of a blocked task', () => {
    expect(getCompletionBlockers(detail({}, { status: 'blocked' }))[0]).toMatch(/blocked/i);
    expect(canTransition('blocked', 'completed')).toBe(false);
    expect(canTransition('blocked', 'in_progress')).toBe(true);
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });
});

describe('urgency sorting', () => {
  it('puts overdue first, then priority, then due date, completed last', () => {
    const tasks = [
      makeTask({ id: 'done', status: 'completed', completedAt: hours(-1), priority: 'high' }),
      makeTask({ id: 'low-soon', priority: 'low', dueAt: hours(1) }),
      makeTask({ id: 'high-later', priority: 'high', dueAt: hours(5) }),
      makeTask({ id: 'overdue-low', priority: 'low', dueAt: hours(-2) }),
      makeTask({ id: 'high-soon', priority: 'high', dueAt: hours(2) }),
    ];
    expect(sortByUrgency(tasks, now).map((t) => t.id)).toEqual([
      'overdue-low',
      'high-soon',
      'high-later',
      'low-soon',
      'done',
    ]);
  });

  it('never treats a completed task as overdue', () => {
    expect(isOverdue({ status: 'completed', dueAt: hours(-5) }, now)).toBe(false);
    expect(isOverdue({ status: 'assigned', dueAt: hours(-5) }, now)).toBe(true);
    expect(isOverdue({ status: 'assigned', dueAt: null }, now)).toBe(false);
  });
});

describe('search and filters', () => {
  const tasks = [
    makeTask({
      id: 'a',
      title: 'HVAC inspection',
      priority: 'high',
      status: 'in_progress',
      dueAt: hours(2),
    }),
    makeTask({
      id: 'b',
      title: 'Card reader',
      description: 'lobby badge reader',
      priority: 'high',
      dueAt: hours(-3),
    }),
    makeTask({
      id: 'c',
      title: 'Lighting survey',
      priority: 'low',
      dueAt: hours(24 * 6),
      syncState: 'pending',
    }),
    makeTask({
      id: 'd',
      title: 'First aid',
      status: 'completed',
      priority: 'low',
      dueAt: hours(-24),
      syncState: 'failed',
    }),
  ];
  const run = (f: Partial<typeof DEFAULT_FILTERS>) =>
    applyFilters(tasks, { ...DEFAULT_FILTERS, ...f }, now).map((t) => t.id);

  it('searches title and description, case-insensitively', () => {
    expect(run({ query: 'hvac' })).toEqual(['a']);
    expect(run({ query: 'BADGE' })).toEqual(['b']);
    expect(run({ query: 'nothing matches' })).toEqual([]);
  });

  it('filters by status, priority, sync state and due window, combined', () => {
    expect(run({ status: 'completed' })).toEqual(['d']);
    expect(run({ priority: 'high' })).toEqual(['a', 'b']);
    expect(run({ sync: 'pending' })).toEqual(['c']);
    expect(run({ sync: 'failed' })).toEqual(['d']);
    expect(run({ due: 'overdue' })).toEqual(['b']);
    expect(run({ due: 'week', priority: 'low' })).toEqual(['c']);
    expect(run({ priority: 'high', query: 'reader', due: 'overdue' })).toEqual(['b']);
  });

  it('knows when filters are active', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sync: 'failed' })).toBe(true);
  });
});
