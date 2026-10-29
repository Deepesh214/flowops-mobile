import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

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

type TxConnection = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync'>;

const SCHEMA_VERSION = 1;

const MIGRATION_1 = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS tasks_local (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  due_at TEXT,
  assignee_id TEXT NOT NULL,
  requires_evidence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS checklist_local (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0,
  is_done INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklist_task ON checklist_local(task_id);
CREATE TABLE IF NOT EXISTS notes_local (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_task ON notes_local(task_id);
CREATE TABLE IF NOT EXISTS attachments_local (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  local_uri TEXT,
  remote_path TEXT,
  caption TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sync_state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments_local(task_id);
CREATE TABLE IF NOT EXISTS sync_operations (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ops_status ON sync_operations(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

type TaskRow = {
  id: string;
  title: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  due_at: string | null;
  assignee_id: string;
  requires_evidence: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};
type ChecklistRow = {
  id: string;
  task_id: string;
  label: string;
  is_required: number;
  is_done: number;
  sort_order: number;
  updated_at: string;
};
type NoteRow = {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  sync_state: SyncState;
};
type AttachmentRow = {
  id: string;
  task_id: string;
  local_uri: string | null;
  remote_path: string | null;
  caption: string;
  mime_type: string;
  created_at: string;
  sync_state: SyncState;
};
type OpRow = {
  id: string;
  entity_type: SyncOperation['entityType'];
  entity_id: string;
  task_id: string;
  operation: SyncOperation['operation'];
  payload_json: string;
  created_at: string;
  retry_count: number;
  next_attempt_at: string;
  status: SyncOperation['status'];
  last_error: string | null;
};

const toTask = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  description: r.description,
  priority: r.priority,
  status: r.status,
  dueAt: r.due_at,
  assigneeId: r.assignee_id,
  requiresEvidence: r.requires_evidence === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});
const toChecklist = (r: ChecklistRow): ChecklistItem => ({
  id: r.id,
  taskId: r.task_id,
  label: r.label,
  isRequired: r.is_required === 1,
  isDone: r.is_done === 1,
  sortOrder: r.sort_order,
  updatedAt: r.updated_at,
});
const toNote = (r: NoteRow): Note => ({
  id: r.id,
  taskId: r.task_id,
  authorId: r.author_id,
  authorName: r.author_name,
  body: r.body,
  createdAt: r.created_at,
  syncState: r.sync_state,
});
const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id,
  taskId: r.task_id,
  localUri: r.local_uri,
  remotePath: r.remote_path,
  caption: r.caption,
  mimeType: r.mime_type,
  createdAt: r.created_at,
  syncState: r.sync_state,
});
const toOp = (r: OpRow): SyncOperation => ({
  id: r.id,
  entityType: r.entity_type,
  entityId: r.entity_id,
  taskId: r.task_id,
  operation: r.operation,
  payload: JSON.parse(r.payload_json),
  createdAt: r.created_at,
  retryCount: r.retry_count,
  nextAttemptAt: r.next_attempt_at,
  status: r.status,
  lastError: r.last_error,
});

// Task-level sync state: failed beats pending beats synced.
const TASK_SYNC_STATE_SQL = `
  CASE
    WHEN EXISTS (SELECT 1 FROM sync_operations o WHERE o.task_id = t.id AND o.status = 'failed') THEN 'failed'
    WHEN EXISTS (SELECT 1 FROM sync_operations o WHERE o.task_id = t.id) THEN 'pending'
    ELSE 'synced'
  END`;

export class SqliteStore implements LocalStore {
  private dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  constructor(private readonly name = 'flowops.db') {}

  private db() {
    if (!this.dbPromise) this.dbPromise = SQLite.openDatabaseAsync(this.name);
    return this.dbPromise;
  }

  /**
   * Exclusive transactions isolate the queue from concurrent writes on native.
   * The web build only offers plain transactions.
   */
  private async transaction(task: (tx: TxConnection) => Promise<void>) {
    const db = await this.db();
    if (Platform.OS === 'web') await db.withTransactionAsync(() => task(db));
    else await db.withExclusiveTransactionAsync(task);
  }

  async init() {
    const db = await this.db();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    if ((row?.user_version ?? 0) < SCHEMA_VERSION) {
      await db.execAsync(MIGRATION_1);
      await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  }

  async listTasks(): Promise<TaskSummary[]> {
    const db = await this.db();
    const rows = await db.getAllAsync<
      TaskRow & { checklist_total: number; checklist_done: number; sync_state: SyncState }
    >(
      `SELECT t.*,
        (SELECT COUNT(*) FROM checklist_local c WHERE c.task_id = t.id) AS checklist_total,
        (SELECT COUNT(*) FROM checklist_local c WHERE c.task_id = t.id AND c.is_done = 1) AS checklist_done,
        ${TASK_SYNC_STATE_SQL} AS sync_state
       FROM tasks_local t`,
    );
    return rows.map((r) => ({
      ...toTask(r),
      checklistTotal: r.checklist_total,
      checklistDone: r.checklist_done,
      syncState: r.sync_state,
    }));
  }

  async getTaskDetail(id: string): Promise<TaskDetail | null> {
    const db = await this.db();
    const t = await db.getFirstAsync<TaskRow & { sync_state: SyncState }>(
      `SELECT t.*, ${TASK_SYNC_STATE_SQL} AS sync_state FROM tasks_local t WHERE t.id = ?`,
      id,
    );
    if (!t) return null;
    const [checklist, notes, attachments, failed] = await Promise.all([
      db.getAllAsync<ChecklistRow>(
        'SELECT * FROM checklist_local WHERE task_id = ? ORDER BY sort_order',
        id,
      ),
      db.getAllAsync<NoteRow>(
        'SELECT * FROM notes_local WHERE task_id = ? ORDER BY created_at',
        id,
      ),
      db.getAllAsync<AttachmentRow>(
        'SELECT * FROM attachments_local WHERE task_id = ? ORDER BY created_at',
        id,
      ),
      db.getFirstAsync<{ last_error: string | null }>(
        "SELECT last_error FROM sync_operations WHERE task_id = ? AND status = 'failed' LIMIT 1",
        id,
      ),
    ]);
    return {
      task: toTask(t),
      checklist: checklist.map(toChecklist),
      notes: notes.map(toNote),
      attachments: attachments.map(toAttachment),
      syncState: t.sync_state,
      lastError: failed?.last_error ?? null,
    };
  }

  async applyRemote(bundles: RemoteTaskBundle[]) {
    await this.transaction(async (tx) => {
      const dirtyRows = await tx.getAllAsync<{ task_id: string }>(
        'SELECT DISTINCT task_id FROM sync_operations',
      );
      const dirty = new Set(dirtyRows.map((r) => r.task_id));
      const incoming = bundles.map((b) => b.task.id);

      // Drop tasks that are no longer assigned, unless they still hold local changes.
      const localIds = await tx.getAllAsync<{ id: string }>('SELECT id FROM tasks_local');
      for (const { id } of localIds) {
        if (!incoming.includes(id) && !dirty.has(id)) await deleteTaskRows(tx, id);
      }

      for (const b of bundles) {
        if (dirty.has(b.task.id)) continue; // local changes win until they are pushed
        const keptUris = await tx.getAllAsync<{ id: string; local_uri: string | null }>(
          'SELECT id, local_uri FROM attachments_local WHERE task_id = ?',
          b.task.id,
        );
        await deleteTaskRows(tx, b.task.id);
        const t = b.task;
        await tx.runAsync(
          `INSERT INTO tasks_local (id, title, description, priority, status, due_at, assignee_id,
            requires_evidence, created_at, updated_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          t.id,
          t.title,
          t.description,
          t.priority,
          t.status,
          t.dueAt,
          t.assigneeId,
          t.requiresEvidence ? 1 : 0,
          t.createdAt,
          t.updatedAt,
          t.completedAt,
        );
        for (const c of b.checklist) {
          await tx.runAsync(
            `INSERT INTO checklist_local (id, task_id, label, is_required, is_done, sort_order, updated_at)
             VALUES (?,?,?,?,?,?,?)`,
            c.id,
            c.taskId,
            c.label,
            c.isRequired ? 1 : 0,
            c.isDone ? 1 : 0,
            c.sortOrder,
            c.updatedAt,
          );
        }
        for (const n of b.notes) {
          await tx.runAsync(
            `INSERT INTO notes_local (id, task_id, author_id, author_name, body, created_at, sync_state)
             VALUES (?,?,?,?,?,?,'synced')`,
            n.id,
            n.taskId,
            n.authorId,
            n.authorName,
            n.body,
            n.createdAt,
          );
        }
        for (const a of b.attachments) {
          const kept = keptUris.find((k) => k.id === a.id)?.local_uri ?? null;
          await tx.runAsync(
            `INSERT INTO attachments_local (id, task_id, local_uri, remote_path, caption, mime_type, created_at, sync_state)
             VALUES (?,?,?,?,?,?,?,'synced')`,
            a.id,
            a.taskId,
            kept,
            a.remotePath,
            a.caption,
            a.mimeType,
            a.createdAt,
          );
        }
      }
    });
  }

  async updateTask(id: string, patch: TaskPatch) {
    const db = await this.db();
    const sets: string[] = [];
    const values: (string | null)[] = [];
    const columns = {
      status: 'status',
      completedAt: 'completed_at',
      updatedAt: 'updated_at',
    } as const;
    for (const key of Object.keys(columns) as (keyof typeof columns)[]) {
      if (patch[key] === undefined) continue;
      sets.push(`${columns[key]} = ?`);
      values.push(patch[key] ?? null);
    }
    if (!sets.length) return;
    await db.runAsync(`UPDATE tasks_local SET ${sets.join(', ')} WHERE id = ?`, ...values, id);
  }

  async updateChecklistItem(id: string, isDone: boolean, updatedAt: string) {
    const db = await this.db();
    await db.runAsync(
      'UPDATE checklist_local SET is_done = ?, updated_at = ? WHERE id = ?',
      isDone ? 1 : 0,
      updatedAt,
      id,
    );
    const row = await db.getFirstAsync<ChecklistRow>(
      'SELECT * FROM checklist_local WHERE id = ?',
      id,
    );
    return row ? toChecklist(row) : null;
  }

  async insertNote(n: Note) {
    const db = await this.db();
    await db.runAsync(
      `INSERT OR REPLACE INTO notes_local (id, task_id, author_id, author_name, body, created_at, sync_state)
       VALUES (?,?,?,?,?,?,?)`,
      n.id,
      n.taskId,
      n.authorId,
      n.authorName,
      n.body,
      n.createdAt,
      n.syncState,
    );
  }

  async setNoteSyncState(id: string, state: SyncState) {
    const db = await this.db();
    await db.runAsync('UPDATE notes_local SET sync_state = ? WHERE id = ?', state, id);
  }

  async insertAttachment(a: Attachment) {
    const db = await this.db();
    await db.runAsync(
      `INSERT OR REPLACE INTO attachments_local (id, task_id, local_uri, remote_path, caption, mime_type, created_at, sync_state)
       VALUES (?,?,?,?,?,?,?,?)`,
      a.id,
      a.taskId,
      a.localUri,
      a.remotePath,
      a.caption,
      a.mimeType,
      a.createdAt,
      a.syncState,
    );
  }

  async setAttachmentState(id: string, state: SyncState, remotePath?: string) {
    const db = await this.db();
    await db.runAsync(
      'UPDATE attachments_local SET sync_state = ?, remote_path = COALESCE(?, remote_path) WHERE id = ?',
      state,
      remotePath ?? null,
      id,
    );
  }

  async getAttachment(id: string) {
    const db = await this.db();
    const row = await db.getFirstAsync<AttachmentRow>(
      'SELECT * FROM attachments_local WHERE id = ?',
      id,
    );
    return row ? toAttachment(row) : null;
  }

  async enqueue(input: SyncOperationInput, now: string, id: string): Promise<SyncOperation> {
    let result: SyncOperation | null = null;
    await this.transaction(async (tx) => {
      const candidates = await tx.getAllAsync<OpRow>(
        'SELECT * FROM sync_operations WHERE entity_type = ? AND entity_id = ?',
        input.entityType,
        input.entityId,
      );
      const existing = candidates.map(toOp).find((o) => canCoalesce(o, input));
      if (existing) {
        const payload = mergePayload(existing.payload, input.payload);
        await tx.runAsync(
          `UPDATE sync_operations SET payload_json = ?, status = 'pending', retry_count = 0,
            next_attempt_at = ?, last_error = NULL WHERE id = ?`,
          JSON.stringify(payload),
          now,
          existing.id,
        );
        result = {
          ...existing,
          payload,
          status: 'pending',
          retryCount: 0,
          nextAttemptAt: now,
          lastError: null,
        };
        return;
      }
      await tx.runAsync(
        `INSERT INTO sync_operations (id, entity_type, entity_id, task_id, operation, payload_json,
          created_at, retry_count, next_attempt_at, status, last_error)
         VALUES (?,?,?,?,?,?,?,0,?,'pending',NULL)`,
        id,
        input.entityType,
        input.entityId,
        input.taskId,
        input.operation,
        JSON.stringify(input.payload),
        now,
        now,
      );
      result = {
        ...input,
        id,
        createdAt: now,
        retryCount: 0,
        nextAttemptAt: now,
        status: 'pending',
        lastError: null,
      };
    });
    return result!;
  }

  async getDueOperations(now: string, limit: number) {
    const db = await this.db();
    const rows = await db.getAllAsync<OpRow>(
      `SELECT * FROM sync_operations WHERE status = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at, rowid LIMIT ?`,
      now,
      limit,
    );
    return rows.map(toOp);
  }

  async markInFlight(id: string) {
    const db = await this.db();
    await db.runAsync("UPDATE sync_operations SET status = 'in_flight' WHERE id = ?", id);
  }

  async deleteOperation(id: string) {
    const db = await this.db();
    await db.runAsync('DELETE FROM sync_operations WHERE id = ?', id);
  }

  async scheduleRetry(id: string, retryCount: number, nextAttemptAt: string, error: string) {
    const db = await this.db();
    await db.runAsync(
      `UPDATE sync_operations SET status = 'pending', retry_count = ?, next_attempt_at = ?, last_error = ?
       WHERE id = ?`,
      retryCount,
      nextAttemptAt,
      error,
      id,
    );
  }

  async markFailed(id: string, error: string) {
    const db = await this.db();
    await db.runAsync(
      "UPDATE sync_operations SET status = 'failed', last_error = ? WHERE id = ?",
      error,
      id,
    );
  }

  async retryFailed(now: string) {
    const db = await this.db();
    const r = await db.runAsync(
      `UPDATE sync_operations SET status = 'pending', retry_count = 0, next_attempt_at = ?
       WHERE status = 'failed'`,
      now,
    );
    return r.changes;
  }

  async resetInFlight() {
    const db = await this.db();
    await db.runAsync("UPDATE sync_operations SET status = 'pending' WHERE status = 'in_flight'");
  }

  async countOperations() {
    const db = await this.db();
    const row = await db.getFirstAsync<{ pending: number; failed: number }>(
      `SELECT
        COALESCE(SUM(CASE WHEN status != 'failed' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
       FROM sync_operations`,
    );
    return { pending: row?.pending ?? 0, failed: row?.failed ?? 0 };
  }

  async nextAttemptAt() {
    const db = await this.db();
    const row = await db.getFirstAsync<{ next: string | null }>(
      "SELECT MIN(next_attempt_at) AS next FROM sync_operations WHERE status = 'pending'",
    );
    return row?.next ?? null;
  }

  async getMeta(key: string) {
    const db = await this.db();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM meta WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  }

  async setMeta(key: string, value: string) {
    const db = await this.db();
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }

  async clearAll() {
    const db = await this.db();
    await db.execAsync(`
      DELETE FROM tasks_local; DELETE FROM checklist_local; DELETE FROM notes_local;
      DELETE FROM attachments_local; DELETE FROM sync_operations; DELETE FROM meta;`);
  }
}

async function deleteTaskRows(tx: TxConnection, taskId: string): Promise<void> {
  await tx.runAsync('DELETE FROM checklist_local WHERE task_id = ?', taskId);
  await tx.runAsync('DELETE FROM notes_local WHERE task_id = ?', taskId);
  await tx.runAsync('DELETE FROM attachments_local WHERE task_id = ?', taskId);
  await tx.runAsync('DELETE FROM tasks_local WHERE id = ?', taskId);
}
