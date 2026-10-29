import type {
  Attachment,
  ChecklistItem,
  Note,
  RemoteTaskBundle,
  SyncOperation,
  SyncOperationInput,
  SyncState,
  Task,
  TaskDetail,
  TaskSummary,
} from '@/types/domain';

import { canCoalesce, mergePayload, type LocalStore, type TaskPatch } from './LocalStore';

/**
 * In-memory LocalStore with the same semantics as the SQLite one.
 * Used by unit/integration tests so queue and repository logic run in Node.
 */
export class MemoryStore implements LocalStore {
  tasks = new Map<string, Task>();
  checklist = new Map<string, ChecklistItem>();
  notes = new Map<string, Note>();
  attachments = new Map<string, Attachment>();
  ops: SyncOperation[] = [];
  meta = new Map<string, string>();

  async init() {}

  private taskSyncState(taskId: string): { state: SyncState; lastError: string | null } {
    const ops = this.ops.filter((o) => o.taskId === taskId);
    const failed = ops.find((o) => o.status === 'failed');
    if (failed) return { state: 'failed', lastError: failed.lastError };
    return { state: ops.length > 0 ? 'pending' : 'synced', lastError: null };
  }

  async listTasks(): Promise<TaskSummary[]> {
    return [...this.tasks.values()].map((task) => {
      const items = [...this.checklist.values()].filter((c) => c.taskId === task.id);
      return {
        ...task,
        checklistTotal: items.length,
        checklistDone: items.filter((c) => c.isDone).length,
        syncState: this.taskSyncState(task.id).state,
      };
    });
  }

  async getTaskDetail(id: string): Promise<TaskDetail | null> {
    const task = this.tasks.get(id);
    if (!task) return null;
    const { state, lastError } = this.taskSyncState(id);
    return {
      task: { ...task },
      checklist: [...this.checklist.values()]
        .filter((c) => c.taskId === id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ ...c })),
      notes: [...this.notes.values()]
        .filter((n) => n.taskId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      attachments: [...this.attachments.values()]
        .filter((a) => a.taskId === id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      syncState: state,
      lastError,
    };
  }

  async applyRemote(bundles: RemoteTaskBundle[]) {
    const dirty = new Set(this.ops.map((o) => o.taskId));
    const incoming = new Set(bundles.map((b) => b.task.id));
    for (const id of [...this.tasks.keys()]) {
      if (!incoming.has(id) && !dirty.has(id)) this.removeTask(id);
    }
    for (const b of bundles) {
      if (dirty.has(b.task.id)) continue;
      const previous = [...this.attachments.values()].filter((a) => a.taskId === b.task.id);
      this.removeTask(b.task.id);
      this.tasks.set(b.task.id, { ...b.task });
      b.checklist.forEach((c) => this.checklist.set(c.id, { ...c }));
      b.notes.forEach((n) => this.notes.set(n.id, { ...n, syncState: 'synced' }));
      b.attachments.forEach((a) =>
        this.attachments.set(a.id, {
          ...a,
          localUri: previous.find((p) => p.id === a.id)?.localUri ?? null,
          syncState: 'synced',
        }),
      );
    }
  }

  private removeTask(id: string) {
    this.tasks.delete(id);
    for (const [k, v] of this.checklist) if (v.taskId === id) this.checklist.delete(k);
    for (const [k, v] of this.notes) if (v.taskId === id) this.notes.delete(k);
    for (const [k, v] of this.attachments) if (v.taskId === id) this.attachments.delete(k);
  }

  async updateTask(id: string, patch: TaskPatch) {
    const t = this.tasks.get(id);
    if (t) this.tasks.set(id, { ...t, ...patch });
  }

  async updateChecklistItem(id: string, isDone: boolean, updatedAt: string) {
    const c = this.checklist.get(id);
    if (!c) return null;
    const next = { ...c, isDone, updatedAt };
    this.checklist.set(id, next);
    return { ...next };
  }

  async insertNote(note: Note) {
    this.notes.set(note.id, { ...note });
  }

  async setNoteSyncState(id: string, state: SyncState) {
    const n = this.notes.get(id);
    if (n) this.notes.set(id, { ...n, syncState: state });
  }

  async insertAttachment(attachment: Attachment) {
    this.attachments.set(attachment.id, { ...attachment });
  }

  async setAttachmentState(id: string, state: SyncState, remotePath?: string) {
    const a = this.attachments.get(id);
    if (a)
      this.attachments.set(id, { ...a, syncState: state, remotePath: remotePath ?? a.remotePath });
  }

  async getAttachment(id: string) {
    const a = this.attachments.get(id);
    return a ? { ...a } : null;
  }

  async enqueue(input: SyncOperationInput, now: string, id: string) {
    const existing = this.ops.find((o) => canCoalesce(o, input));
    if (existing) {
      existing.payload = mergePayload(existing.payload, input.payload);
      existing.status = 'pending';
      existing.retryCount = 0;
      existing.nextAttemptAt = now;
      existing.lastError = null;
      return { ...existing };
    }
    const op: SyncOperation = {
      ...input,
      id,
      createdAt: now,
      retryCount: 0,
      nextAttemptAt: now,
      status: 'pending',
      lastError: null,
    };
    this.ops.push(op);
    return { ...op };
  }

  async getDueOperations(now: string, limit: number) {
    return this.ops
      .filter((o) => o.status === 'pending' && o.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((o) => ({ ...o, payload: { ...o.payload } }));
  }

  private op(id: string) {
    return this.ops.find((o) => o.id === id);
  }

  async markInFlight(id: string) {
    const o = this.op(id);
    if (o) o.status = 'in_flight';
  }

  async deleteOperation(id: string) {
    this.ops = this.ops.filter((o) => o.id !== id);
  }

  async scheduleRetry(id: string, retryCount: number, nextAttemptAt: string, error: string) {
    const o = this.op(id);
    if (o) Object.assign(o, { status: 'pending', retryCount, nextAttemptAt, lastError: error });
  }

  async markFailed(id: string, error: string) {
    const o = this.op(id);
    if (o) Object.assign(o, { status: 'failed', lastError: error });
  }

  async retryFailed(now: string) {
    const failed = this.ops.filter((o) => o.status === 'failed');
    failed.forEach((o) =>
      Object.assign(o, { status: 'pending', retryCount: 0, nextAttemptAt: now }),
    );
    return failed.length;
  }

  async resetInFlight() {
    this.ops.forEach((o) => {
      if (o.status === 'in_flight') o.status = 'pending';
    });
  }

  async countOperations() {
    return {
      pending: this.ops.filter((o) => o.status !== 'failed').length,
      failed: this.ops.filter((o) => o.status === 'failed').length,
    };
  }

  async nextAttemptAt() {
    const pending = this.ops.filter((o) => o.status === 'pending').map((o) => o.nextAttemptAt);
    return pending.length ? pending.sort()[0] : null;
  }

  async getMeta(key: string) {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string) {
    this.meta.set(key, value);
  }

  async clearAll() {
    this.tasks.clear();
    this.checklist.clear();
    this.notes.clear();
    this.attachments.clear();
    this.ops = [];
    this.meta.clear();
  }
}
