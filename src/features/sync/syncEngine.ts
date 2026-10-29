import type { LocalStore } from '@/data/local/LocalStore';
import { classifyError, userMessage } from '@/data/remote/errors';
import type { RemoteApi, TaskUpdatePayload } from '@/data/remote/RemoteApi';
import type { Note, SyncOperation, SyncOperationInput, SyncSummary } from '@/types/domain';
import { uuid } from '@/utils/uuid';

import { retryDelayMs } from './backoff';

export interface SyncEngineDeps {
  store: LocalStore;
  api: RemoteApi;
  isOnline: () => boolean;
  now?: () => Date;
  /** Called whenever queue state may have changed (counts, badges). */
  onChange?: () => void;
  onAuthError?: () => void;
  onConflict?: (count: number) => void;
  /** Injected for tests; defaults to setTimeout. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

const BATCH_SIZE = 25;

/**
 * Drains the local operation queue against the remote API.
 *
 * - Single-flight: concurrent `process()` calls share one run (the "lock"),
 *   and a call that arrives mid-run triggers one more pass afterwards.
 * - Operations run oldest-first; a retryable failure stops the pass so later
 *   edits never overtake earlier ones.
 * - Queue items are deleted only after the remote call succeeds.
 */
export class SyncEngine {
  private running: Promise<SyncSummary> | null = null;
  private rerunRequested = false;
  private timer: unknown = null;

  constructor(private readonly deps: SyncEngineDeps) {}

  private now() {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  async enqueue(input: SyncOperationInput): Promise<SyncOperation> {
    const op = await this.deps.store.enqueue(input, this.now(), uuid());
    this.deps.onChange?.();
    return op;
  }

  kickIfOnline(): void {
    if (!this.deps.isOnline()) return;
    this.process().catch(() => undefined);
  }

  process(): Promise<SyncSummary> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Manual Retry: failed operations get a fresh set of attempts. */
  async retryFailed(): Promise<SyncSummary> {
    await this.deps.store.retryFailed(this.now());
    this.deps.onChange?.();
    return this.process();
  }

  stop() {
    if (this.timer) (this.deps.cancel ?? clearTimeout)(this.timer as ReturnType<typeof setTimeout>);
    this.timer = null;
  }

  private async run(): Promise<SyncSummary> {
    const summary: SyncSummary = {
      processed: 0,
      succeeded: 0,
      retried: 0,
      failed: 0,
      conflicts: 0,
      skipped: false,
    };
    if (!this.deps.isOnline()) return { ...summary, skipped: true };

    try {
      do {
        this.rerunRequested = false;
        const stopped = await this.pass(summary);
        if (stopped) break;
      } while (this.rerunRequested);
    } finally {
      this.deps.onChange?.();
      if (summary.conflicts > 0) this.deps.onConflict?.(summary.conflicts);
      await this.scheduleNextRetry();
    }
    return summary;
  }

  /** Returns true when the run should stop (offline, retryable or auth failure). */
  private async pass(summary: SyncSummary): Promise<boolean> {
    for (;;) {
      if (!this.deps.isOnline()) return true;
      const due = await this.deps.store.getDueOperations(this.now(), BATCH_SIZE);
      if (due.length === 0) return false;

      for (const op of due) {
        summary.processed++;
        await this.deps.store.markInFlight(op.id);
        try {
          await this.perform(op);
          await this.deps.store.deleteOperation(op.id);
          summary.succeeded++;
        } catch (error) {
          const verdict = await this.handleFailure(op, error, summary);
          if (verdict === 'stop') return true;
        }
      }
    }
  }

  private async perform(op: SyncOperation): Promise<void> {
    const { store, api } = this.deps;
    switch (`${op.entityType}:${op.operation}`) {
      case 'task:update': {
        const { updatedAt } = await api.updateTask(
          op.entityId,
          op.payload as unknown as TaskUpdatePayload,
        );
        await store.updateTask(op.entityId, { updatedAt });
        return;
      }
      case 'checklist:update':
        await api.updateChecklistItem(
          op.entityId,
          Boolean(op.payload.isDone),
          String(op.payload.updatedAt),
        );
        return;
      case 'note:create':
        await api.createNote(op.payload as unknown as Omit<Note, 'syncState'>);
        await store.setNoteSyncState(op.entityId, 'synced');
        return;
      case 'attachment:upload': {
        const attachment = await store.getAttachment(op.entityId);
        if (!attachment) return; // deleted locally; nothing left to upload
        const { remotePath } = await api.uploadAttachment(attachment);
        await store.setAttachmentState(op.entityId, 'synced', remotePath);
        return;
      }
      default:
        throw new Error(`Unsupported operation ${op.entityType}:${op.operation}`);
    }
  }

  private async handleFailure(
    op: SyncOperation,
    error: unknown,
    summary: SyncSummary,
  ): Promise<'continue' | 'stop'> {
    const { store } = this.deps;
    const message = userMessage(error);

    switch (classifyError(error)) {
      case 'retryable': {
        const retryCount = op.retryCount + 1;
        const delay = retryDelayMs(retryCount);
        if (delay === null) {
          await store.markFailed(op.id, message);
          await this.markEntityFailed(op);
          summary.failed++;
        } else {
          const next = new Date((this.deps.now?.() ?? new Date()).getTime() + delay).toISOString();
          await store.scheduleRetry(op.id, retryCount, next, message);
          summary.retried++;
        }
        return 'stop';
      }
      case 'auth':
        // Keep the change; it will sync once the user signs in again.
        await store.scheduleRetry(op.id, op.retryCount, op.nextAttemptAt, message);
        this.deps.onAuthError?.();
        return 'stop';
      case 'conflict':
        // Last write wins on the server: keep its version and let the next
        // pull overwrite the local copy.
        await store.deleteOperation(op.id);
        summary.conflicts++;
        return 'continue';
      case 'validation':
        await store.markFailed(op.id, message);
        await this.markEntityFailed(op);
        summary.failed++;
        return 'continue';
    }
  }

  private async markEntityFailed(op: SyncOperation) {
    if (op.entityType === 'note') await this.deps.store.setNoteSyncState(op.entityId, 'failed');
    if (op.entityType === 'attachment') {
      await this.deps.store.setAttachmentState(op.entityId, 'failed');
    }
  }

  private async scheduleNextRetry() {
    this.stop();
    const next = await this.deps.store.nextAttemptAt();
    if (!next) return;
    const wait = Math.max(
      0,
      new Date(next).getTime() - (this.deps.now?.() ?? new Date()).getTime(),
    );
    if (wait === 0) return; // due now: the next kick will pick it up
    this.timer = (this.deps.schedule ?? setTimeout)(() => {
      this.timer = null;
      this.kickIfOnline();
    }, wait);
  }
}
