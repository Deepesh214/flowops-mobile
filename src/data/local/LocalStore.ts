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

export type TaskPatch = Partial<Pick<Task, 'status' | 'completedAt' | 'updatedAt'>>;

/**
 * Durable on-device storage: the offline copy of tasks plus the sync queue.
 * Screens never touch this directly; they go through the task repository.
 */
export interface LocalStore {
  init(): Promise<void>;

  listTasks(): Promise<TaskSummary[]>;
  getTaskDetail(id: string): Promise<TaskDetail | null>;
  /** Upserts server data, leaving tasks with unsynced local changes untouched. */
  applyRemote(bundles: RemoteTaskBundle[]): Promise<void>;

  updateTask(id: string, patch: TaskPatch): Promise<void>;
  updateChecklistItem(
    id: string,
    isDone: boolean,
    updatedAt: string,
  ): Promise<ChecklistItem | null>;
  insertNote(note: Note): Promise<void>;
  setNoteSyncState(id: string, state: SyncState): Promise<void>;
  insertAttachment(attachment: Attachment): Promise<void>;
  setAttachmentState(id: string, state: SyncState, remotePath?: string): Promise<void>;
  getAttachment(id: string): Promise<Attachment | null>;

  /** Adds an operation, merging into an existing queued update for the same entity. */
  enqueue(input: SyncOperationInput, now: string, id: string): Promise<SyncOperation>;
  getDueOperations(now: string, limit: number): Promise<SyncOperation[]>;
  markInFlight(id: string): Promise<void>;
  deleteOperation(id: string): Promise<void>;
  scheduleRetry(
    id: string,
    retryCount: number,
    nextAttemptAt: string,
    error: string,
  ): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  /** Moves failed operations back to pending; returns how many. */
  retryFailed(now: string): Promise<number>;
  /** Operations interrupted mid-flight (app killed) go back to pending. */
  resetInFlight(): Promise<void>;
  countOperations(): Promise<{ pending: number; failed: number }>;
  nextAttemptAt(): Promise<string | null>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
  clearAll(): Promise<void>;
}

/**
 * Merges a newer payload into a queued one. Keys prefixed with `base` describe
 * the server version the first edit started from, so the original is kept.
 */
export function mergePayload(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing, ...incoming };
  for (const key of Object.keys(existing)) {
    if (key.startsWith('base')) merged[key] = existing[key];
  }
  return merged;
}

/**
 * Coalescing rule shared by both implementations: a new update merges into a
 * queued (or failed) update of the same entity, so rapid toggles produce one
 * operation carrying the latest value. An in-flight operation is never touched,
 * because the worker would delete it on success and drop the newer value.
 */
export function canCoalesce(existing: SyncOperation, input: SyncOperationInput): boolean {
  return (
    existing.status !== 'in_flight' &&
    existing.entityType === input.entityType &&
    existing.entityId === input.entityId &&
    existing.operation === 'update' &&
    input.operation === 'update'
  );
}
