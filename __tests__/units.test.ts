import { classifyError, RemoteError, userMessage } from '@/data/remote/errors';
import { computeMetrics, groupCompletedTasksByDay } from '@/features/analytics/metrics';
import { validateLogin } from '@/features/auth/validation';
import { MAX_AUTO_RETRIES, retryDelayMs } from '@/features/sync/backoff';
import { relativeDue } from '@/utils/date';

import { makeTask, NOW } from './helpers';

const now = NOW.getTime();
const days = (d: number) => new Date(now + d * 86_400_000).toISOString();

describe('retry backoff', () => {
  it('follows the bounded schedule then stops', () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMs)).toEqual([2000, 5000, 15000, 30000, 60000]);
    expect(retryDelayMs(MAX_AUTO_RETRIES + 1)).toBeNull();
    expect(retryDelayMs(0)).toBeNull();
  });
});

describe('error classification', () => {
  it('maps errors to handling classes', () => {
    expect(classifyError(new RemoteError('network', ''))).toBe('retryable');
    expect(classifyError(new RemoteError('timeout', ''))).toBe('retryable');
    expect(classifyError(new RemoteError('server', '', 503))).toBe('retryable');
    expect(classifyError(new TypeError('Network request failed'))).toBe('retryable');
    expect(classifyError(new RemoteError('auth', '', 401))).toBe('auth');
    expect(classifyError(new RemoteError('validation', '', 422))).toBe('validation');
    expect(classifyError(new RemoteError('conflict', '', 409))).toBe('conflict');
  });

  it('never surfaces raw backend text', () => {
    const raw = new RemoteError('invalid_credentials', 'AuthApiError: Invalid login credentials');
    expect(userMessage(raw)).toBe('Email or password is incorrect.');
    expect(userMessage(new Error('pg: relation "x" does not exist'))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('login validation', () => {
  it('rejects empty and malformed input before any request', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter your email.',
      password: 'Enter your password.',
    });
    expect(validateLogin({ email: 'not-an-email', password: 'secret1' }).email).toBe(
      'Enter a valid email address.',
    );
    expect(validateLogin({ email: 'a@b.co', password: '123' }).password).toMatch(/at least 6/);
    expect(validateLogin({ email: ' alex@flowops.app ', password: 'flowops123' })).toEqual({});
  });
});

describe('analytics', () => {
  const tasks = [
    makeTask({ id: '1', status: 'completed', completedAt: days(0) }),
    makeTask({ id: '2', status: 'completed', completedAt: days(-2) }),
    makeTask({ id: '3', status: 'completed', completedAt: days(-10) }), // outside the window
    makeTask({ id: '4', status: 'in_progress', dueAt: days(-1) }),
    makeTask({ id: '5', status: 'blocked', dueAt: days(3) }),
  ];

  it('derives counts and completion rate', () => {
    const m = computeMetrics(tasks, now);
    expect(m).toMatchObject({
      total: 5,
      completed: 3,
      open: 2,
      overdue: 1,
      blocked: 1,
      inProgress: 1,
    });
    expect(m.completionRate).toBeCloseTo(0.6);
    expect(computeMetrics([], now).completionRate).toBe(0);
  });

  it('groups completed tasks into the last seven days', () => {
    const weekly = groupCompletedTasksByDay(tasks, now);
    expect(weekly).toHaveLength(7);
    expect(weekly[6].completed).toBe(1);
    expect(weekly[4].completed).toBe(1);
    expect(weekly.reduce((s, d) => s + d.completed, 0)).toBe(2);
  });
});

describe('relative due labels', () => {
  it('describes overdue and upcoming work', () => {
    expect(relativeDue(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('Overdue by 3h');
    expect(relativeDue(new Date(now + 30 * 60_000).toISOString(), now)).toBe('Due in 30m');
    expect(relativeDue(null, now)).toBe('No due date');
  });
});
