import type { LocalStore } from '@/data/local/LocalStore';
import type { RemoteApi, TaskUpdatePayload } from '@/data/remote/RemoteApi';
import type { SyncEngine } from '@/features/sync/syncEngine';
import { canTransition, getCompletionBlockers, STATUS_LABEL } from '@/features/tasks/taskRules';
import type { Attachment, Note, TaskDetail, TaskStatus, TaskSummary, User } from '@/types/domain';
import { uuid } from '@/utils/uuid';

/** A rule violation the user can fix; `reasons` lists exactly what is missing. */
export class TaskRuleError extends Error {
  constructor(
    message: string,
    readonly reasons: string[] = [message],
  ) {
    super(message);
    this.name = 'TaskRuleError';
  }
}

export const LAST_SYNCED_KEY = 'last_synced_at';

export interface NewAttachment {
  taskId: string;
  localUri: string;
  mimeType: string;
  caption: string;
}

/**
 * The only data entry point for screens. Every write follows the same
 * local-first pattern: update SQLite, enqueue an operation, kick the worker.
 */
export class TaskRepository {
  constructor(
    private readonly store: LocalStore,
    private readonly api: RemoteApi,
    private readonly sync: SyncEngine,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listTasks(): Promise<TaskSummary[]> {
    return this.store.listTasks();
  }

  getTask(id: string): Promise<TaskDetail | null> {
    return this.store.getTaskDetail(id);
  }

  /** Push queued changes first, then pull so the server view includes them. */
  async refreshFromRemote(userId: string): Promise<string> {
    await this.sync.process();
    const bundles = await this.api.fetchAssignedTasks(userId);
    await this.store.applyRemote(bundles);
    const at = this.now().toISOString();
    await this.store.setMeta(LAST_SYNCED_KEY, at);
    return at;
  }

  getLastSyncedAt(): Promise<string | null> {
    return this.store.getMeta(LAST_SYNCED_KEY);
  }

  private async requireTask(id: string): Promise<TaskDetail> {
    const detail = await this.store.getTaskDetail(id);
    if (!detail) throw new TaskRuleError('This task is no longer available on this device.');
    return detail;
  }

  async setStatus(id: string, status: TaskStatus): Promise<void> {
    const detail = await this.requireTask(id);
    const { task } = detail;
    if (task.status === status) return;
    if (!canTransition(task.status, status)) {
      throw new TaskRuleError(
        `A task that is ${STATUS_LABEL[task.status]} can't be moved to ${STATUS_LABEL[status]}.`,
      );
    }
    if (status === 'completed') {
      const blockers = getCompletionBlockers(detail);
      if (blockers.length)
        throw new TaskRuleError('This task is not ready to complete yet.', blockers);
    }
    const at = this.now().toISOString();
    const completedAt = status === 'completed' ? at : null;
    await this.store.updateTask(id, { status, completedAt, updatedAt: at });
    const payload: TaskUpdatePayload = {
      status,
      completedAt,
      updatedAt: at,
      baseUpdatedAt: task.updatedAt,
    };
    await this.sync.enqueue({
      entityType: 'task',
      entityId: id,
      taskId: id,
      operation: 'update',
      payload: { ...payload },
    });
    this.sync.kickIfOnline();
  }

  async toggleChecklist(taskId: string, itemId: string, isDone: boolean): Promise<void> {
    const { task } = await this.requireTask(taskId);
    if (task.status === 'completed') {
      throw new TaskRuleError('Completed tasks are read-only.');
    }
    const at = this.now().toISOString();
    const item = await this.store.updateChecklistItem(itemId, isDone, at);
    if (!item) throw new TaskRuleError('This checklist item no longer exists.');
    await this.sync.enqueue({
      entityType: 'checklist',
      entityId: itemId,
      taskId,
      operation: 'update',
      payload: { isDone, updatedAt: at },
    });
    // Ticking a step on an untouched task implicitly starts it.
    if (task.status === 'assigned' && isDone) await this.setStatus(taskId, 'in_progress');
    else this.sync.kickIfOnline();
  }

  async addNote(taskId: string, body: string, author: User): Promise<Note> {
    const text = body.trim();
    if (!text) throw new TaskRuleError('Write something before saving the note.');
    if (text.length > 2000) throw new TaskRuleError('Notes are limited to 2,000 characters.');
    await this.requireTask(taskId);
    const note: Note = {
      id: uuid(),
      taskId,
      authorId: author.id,
      authorName: author.fullName,
      body: text,
      createdAt: this.now().toISOString(),
      syncState: 'pending',
    };
    await this.store.insertNote(note);
    const { syncState: _omit, ...remote } = note;
    await this.sync.enqueue({
      entityType: 'note',
      entityId: note.id,
      taskId,
      operation: 'create',
      payload: { ...remote },
    });
    this.sync.kickIfOnline();
    return note;
  }

  async addAttachment(input: NewAttachment): Promise<Attachment> {
    const { task } = await this.requireTask(input.taskId);
    if (task.status === 'completed') throw new TaskRuleError('Completed tasks are read-only.');
    const attachment: Attachment = {
      id: uuid(),
      taskId: input.taskId,
      localUri: input.localUri,
      remotePath: null,
      caption: input.caption.trim(),
      mimeType: input.mimeType,
      createdAt: this.now().toISOString(),
      syncState: 'pending',
    };
    await this.store.insertAttachment(attachment);
    await this.sync.enqueue({
      entityType: 'attachment',
      entityId: attachment.id,
      taskId: input.taskId,
      operation: 'upload',
      payload: {},
    });
    this.sync.kickIfOnline();
    return attachment;
  }

  /** Logout: drop every session-scoped row, including unsynced changes. */
  clearLocalData() {
    return this.store.clearAll();
  }
}
