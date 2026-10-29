import type { Attachment, Note, RemoteTaskBundle, Session, TaskStatus } from '@/types/domain';

export interface TaskUpdatePayload {
  status: TaskStatus;
  completedAt: string | null;
  updatedAt: string;
  /** updated_at the client last saw; used for the last-write-wins check. */
  baseUpdatedAt: string;
}

/**
 * Everything the app needs from the backend. Implementations throw RemoteError
 * so the sync worker can classify failures without knowing the backend.
 */
export interface RemoteApi {
  readonly mode: 'supabase' | 'demo';

  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  restoreSession(): Promise<Session | null>;
  onSessionExpired(listener: () => void): () => void;

  fetchAssignedTasks(userId: string): Promise<RemoteTaskBundle[]>;
  updateTask(id: string, payload: TaskUpdatePayload): Promise<{ updatedAt: string }>;
  updateChecklistItem(id: string, isDone: boolean, updatedAt: string): Promise<void>;
  createNote(note: Omit<Note, 'syncState'>): Promise<void>;
  /** Uploads the file then inserts metadata; returns the storage path. */
  uploadAttachment(attachment: Attachment): Promise<{ remotePath: string }>;
  getAttachmentUrl(remotePath: string): Promise<string | null>;

  registerPushToken(userId: string, token: string, platform: string): Promise<void>;
}
