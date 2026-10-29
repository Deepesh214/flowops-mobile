import { RemoteError } from '@/data/remote/errors';
import { MAX_AUTO_RETRIES, RETRY_DELAYS_MS } from '@/features/sync/backoff';

import { flush, harness, makeBundle, networkError } from './helpers';

const withChecklist = () => [makeBundle({ id: 't1' }, [{ id: 'c1' }, { id: 'c2' }])];

describe('sync queue', () => {
  it('a checklist toggle creates exactly one pending operation', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', false);
    expect(h.store.ops).toHaveLength(1);
    expect(h.store.ops[0]).toMatchObject({
      entityType: 'checklist',
      entityId: 'c2',
      operation: 'update',
      status: 'pending',
      payload: { isDone: false },
    });
  });

  it('two rapid updates to the same item coalesce into one op carrying the latest value', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', false);
    await h.repo.toggleChecklist('t1', 'c2', true);
    await h.repo.toggleChecklist('t1', 'c2', false);

    const checklistOps = h.store.ops.filter((o) => o.entityType === 'checklist');
    expect(checklistOps).toHaveLength(1);
    expect(checklistOps[0].payload.isDone).toBe(false);
    expect((await h.store.getTaskDetail('t1'))!.checklist.find((c) => c.id === 'c2')!.isDone).toBe(
      false,
    );
  });

  it('keeps the original base version when task updates coalesce', async () => {
    const h = await harness([makeBundle({ id: 't1', status: 'in_progress' })]);
    h.online.value = false;
    await h.repo.setStatus('t1', 'blocked');
    h.clock.now = new Date(h.clock.now.getTime() + 1000);
    await h.repo.setStatus('t1', 'in_progress');
    expect(h.store.ops).toHaveLength(1);
    expect(h.store.ops[0].payload).toMatchObject({
      status: 'in_progress',
      baseUpdatedAt: '2026-10-20T08:00:00.000Z',
    });
  });

  it('does nothing while offline and keeps every operation', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c1', true);
    const summary = await h.engine.process();
    expect(summary.skipped).toBe(true);
    expect(h.api.updateChecklistItem).not.toHaveBeenCalled();
    expect(h.store.ops.length).toBeGreaterThan(0);
  });

  it('removes a queue item only after the remote call succeeds', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c1', true);

    let release!: () => void;
    h.api.updateChecklistItem.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    h.online.value = true;
    const run = h.engine.process();
    await flush();
    // In flight: still queued, and not eligible for coalescing.
    expect(h.store.ops.find((o) => o.entityId === 'c1')?.status).toBe('in_flight');
    release();
    await run;
    expect(h.store.ops.find((o) => o.entityId === 'c1')).toBeUndefined();
  });

  it('drains in order and reports synced state afterwards', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c1', true); // also starts the task
    await h.repo.addNote('t1', 'All good', {
      id: 'u1',
      email: 'a@b.c',
      fullName: 'Alex',
      role: 'Tech',
    });
    expect((await h.store.listTasks())[0].syncState).toBe('pending');

    h.online.value = true;
    const summary = await h.engine.process();
    expect(summary.succeeded).toBe(3);
    expect(h.store.ops).toHaveLength(0);
    const calls = [
      h.api.updateChecklistItem.mock.invocationCallOrder[0],
      h.api.updateTask.mock.invocationCallOrder[0],
      h.api.createNote.mock.invocationCallOrder[0],
    ];
    expect([...calls].sort((a, b) => a - b)).toEqual(calls);
    const detail = await h.store.getTaskDetail('t1');
    expect(detail!.syncState).toBe('synced');
    expect(detail!.notes[0].syncState).toBe('synced');
  });

  it('retryable network errors keep the operation and increment retry count with backoff', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', true);
    h.online.value = true;
    h.api.updateChecklistItem.mockRejectedValue(networkError());

    const summary = await h.engine.process();
    expect(summary.retried).toBe(1);
    const op = h.store.ops.find((o) => o.entityId === 'c2')!;
    expect(op.status).toBe('pending');
    expect(op.retryCount).toBe(1);
    expect(new Date(op.nextAttemptAt).getTime() - h.clock.now.getTime()).toBe(RETRY_DELAYS_MS[0]);

    // Not due yet: another pass must not call the API again.
    h.api.updateChecklistItem.mockClear();
    await h.engine.process();
    expect(h.api.updateChecklistItem).not.toHaveBeenCalled();
  });

  it('stops automatic retries after the threshold and allows a manual retry', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', true);
    h.online.value = true;
    h.api.updateChecklistItem.mockRejectedValue(networkError());

    for (let i = 0; i <= MAX_AUTO_RETRIES; i++) {
      await h.engine.process();
      h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    }
    const op = h.store.ops.find((o) => o.entityId === 'c2')!;
    expect(op.status).toBe('failed');
    expect(op.lastError).toMatch(/can't reach the server/i);
    expect((await h.store.listTasks())[0].syncState).toBe('failed');

    h.api.updateChecklistItem.mockResolvedValue(undefined);
    await h.engine.retryFailed();
    expect(h.store.ops.find((o) => o.entityId === 'c2')).toBeUndefined();
  });

  it('marks validation failures as failed without retrying, and continues with the rest', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    const user = { id: 'u1', email: 'a@b.c', fullName: 'Alex', role: 'Tech' };
    const note = await h.repo.addNote('t1', 'first', user);
    await h.repo.addNote('t1', 'second', user);
    h.api.createNote.mockRejectedValueOnce(new RemoteError('validation', 'bad', 422));
    h.online.value = true;

    const summary = await h.engine.process();
    expect(summary).toMatchObject({ failed: 1, succeeded: 1 });
    expect(h.store.notes.get(note.id)!.syncState).toBe('failed');
  });

  it('applies last-write-wins on conflict: drops the op and notifies', async () => {
    const h = await harness([makeBundle({ id: 't1' })]);
    h.online.value = false;
    await h.repo.setStatus('t1', 'in_progress');
    h.api.updateTask.mockRejectedValueOnce(new RemoteError('conflict', 'changed', 409));
    h.online.value = true;

    const summary = await h.engine.process();
    expect(summary.conflicts).toBe(1);
    expect(h.store.ops).toHaveLength(0);
    expect(h.onConflict).toHaveBeenCalledWith(1);
  });

  it('auth failures keep the change queued and signal the app', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', true);
    h.api.updateChecklistItem.mockRejectedValueOnce(new RemoteError('auth', 'expired', 401));
    h.online.value = true;

    await h.engine.process();
    expect(h.onAuthError).toHaveBeenCalled();
    expect(h.store.ops.find((o) => o.entityId === 'c2')?.status).toBe('pending');
  });

  it('concurrent process() calls share one run (lock) and never double-send', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', true);
    h.online.value = true;

    await Promise.all([h.engine.process(), h.engine.process(), h.engine.process()]);
    expect(h.api.updateChecklistItem).toHaveBeenCalledTimes(1);
  });

  it('interrupted in-flight operations are re-queued on restart', async () => {
    const h = await harness(withChecklist());
    h.online.value = false;
    await h.repo.toggleChecklist('t1', 'c2', true);
    await h.store.markInFlight(h.store.ops[0].id);
    await h.store.resetInFlight();
    expect(h.store.ops[0].status).toBe('pending');
  });
});
