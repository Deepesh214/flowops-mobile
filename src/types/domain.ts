export type Priority = 'low' | 'medium' | 'high';
export type TaskStatus = 'assigned' | 'in_progress' | 'blocked' | 'completed';

/** Local sync state is independent from the business status above. */
export type SyncState = 'synced' | 'pending' | 'failed';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
}

export interface Session {
  user: User;
  /** Opaque token; never logged. */
  accessToken: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  dueAt: string | null; // ISO UTC
  assigneeId: string;
  requiresEvidence: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  label: string;
  isRequired: boolean;
  isDone: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface Note {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  syncState: SyncState;
}

export interface Attachment {
  id: string;
  taskId: string;
  localUri: string | null;
  remotePath: string | null;
  caption: string;
  mimeType: string;
  createdAt: string;
  syncState: SyncState;
}

/** Row shape used by lists: task plus derived checklist and sync info. */
export interface TaskSummary extends Task {
  checklistTotal: number;
  checklistDone: number;
  syncState: SyncState;
}

export interface TaskDetail {
  task: Task;
  checklist: ChecklistItem[];
  notes: Note[];
  attachments: Attachment[];
  syncState: SyncState;
  lastError: string | null;
}

/** What the server returns for one assigned task. */
export interface RemoteTaskBundle {
  task: Task;
  checklist: ChecklistItem[];
  notes: Omit<Note, 'syncState'>[];
  attachments: Omit<Attachment, 'syncState' | 'localUri'>[];
}

export type EntityType = 'task' | 'checklist' | 'note' | 'attachment';
export type OperationType = 'create' | 'update' | 'delete' | 'upload';

export interface SyncOperation {
  id: string;
  entityType: EntityType;
  entityId: string;
  taskId: string;
  operation: OperationType;
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  nextAttemptAt: string;
  status: 'pending' | 'in_flight' | 'failed';
  lastError: string | null;
}

export type SyncOperationInput = Pick<
  SyncOperation,
  'entityType' | 'entityId' | 'taskId' | 'operation' | 'payload'
>;

export interface SyncSummary {
  processed: number;
  succeeded: number;
  retried: number;
  failed: number;
  conflicts: number;
  skipped: boolean;
}
