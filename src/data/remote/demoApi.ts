import type { Attachment, Note, RemoteTaskBundle, Session } from '@/types/domain';

import { buildDemoSeed, DEMO_USER } from './demoSeed';
import { RemoteError } from './errors';
import type { RemoteApi, TaskUpdatePayload } from './RemoteApi';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const DB_KEY = 'flowops.demo.server.v1';
const SESSION_KEY = 'flowops.demo.session.v1';

interface DemoOptions {
  storage: KeyValueStorage;
  /** The demo "server" is unreachable whenever this returns false. */
  isOnline: () => boolean;
  latencyMs?: number;
  password: string;
}

/**
 * On-device backend used when no Supabase project is configured. Respects
 * connectivity (including "simulate offline"), adds latency, and applies the
 * same ownership and last-write-wins rules as the real backend.
 */
export class DemoApi implements RemoteApi {
  readonly mode = 'demo' as const;
  private cache: RemoteTaskBundle[] | null = null;

  constructor(private readonly opts: DemoOptions) {}

  private async network() {
    const ms = this.opts.latencyMs ?? 350 + Math.random() * 300;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    if (!this.opts.isOnline()) throw new RemoteError('network', 'Network request failed');
  }

  private async load(): Promise<RemoteTaskBundle[]> {
    if (this.cache) return this.cache;
    const raw = await this.opts.storage.getItem(DB_KEY);
    this.cache = raw ? (JSON.parse(raw) as RemoteTaskBundle[]) : buildDemoSeed();
    if (!raw) await this.save();
    return this.cache;
  }

  private async save() {
    await this.opts.storage.setItem(DB_KEY, JSON.stringify(this.cache));
  }

  private session(): Session {
    return { user: DEMO_USER, accessToken: 'demo-token' };
  }

  async signIn(email: string, password: string) {
    await this.network();
    if (email.trim().toLowerCase() !== DEMO_USER.email || password !== this.opts.password) {
      throw new RemoteError('invalid_credentials', 'Invalid login credentials', 400);
    }
    await this.opts.storage.setItem(SESSION_KEY, '1');
    return this.session();
  }

  async signOut() {
    await this.opts.storage.removeItem(SESSION_KEY);
  }

  async restoreSession() {
    // Session restore is local; it works offline like a persisted Supabase session.
    return (await this.opts.storage.getItem(SESSION_KEY)) ? this.session() : null;
  }

  onSessionExpired() {
    // Demo sessions never expire.
    return () => undefined;
  }

  async fetchAssignedTasks(userId: string) {
    await this.network();
    const db = await this.load();
    return structuredCloneSafe(db.filter((b) => b.task.assigneeId === userId));
  }

  private async findTask(id: string) {
    const bundle = (await this.load()).find((b) => b.task.id === id);
    if (!bundle) throw new RemoteError('not_found', 'Task not found', 404);
    if (bundle.task.assigneeId !== DEMO_USER.id) throw new RemoteError('auth', 'Forbidden', 403);
    return bundle;
  }

  async updateTask(id: string, payload: TaskUpdatePayload) {
    await this.network();
    const bundle = await this.findTask(id);
    if (bundle.task.updatedAt > payload.baseUpdatedAt) {
      throw new RemoteError('conflict', 'Task changed on server', 409);
    }
    bundle.task.status = payload.status;
    bundle.task.completedAt = payload.completedAt;
    bundle.task.updatedAt = payload.updatedAt;
    await this.save();
    return { updatedAt: payload.updatedAt };
  }

  async updateChecklistItem(id: string, isDone: boolean, updatedAt: string) {
    await this.network();
    const db = await this.load();
    const item = db.flatMap((b) => b.checklist).find((c) => c.id === id);
    if (!item) throw new RemoteError('not_found', 'Checklist item not found', 404);
    if (item.updatedAt <= updatedAt) {
      item.isDone = isDone;
      item.updatedAt = updatedAt;
    }
    await this.save();
  }

  async createNote(note: Omit<Note, 'syncState'>) {
    await this.network();
    const bundle = await this.findTask(note.taskId);
    if (!note.body.trim()) throw new RemoteError('validation', 'Note body required', 422);
    // Idempotent on the client-generated id, so a retried request never duplicates.
    if (!bundle.notes.some((n) => n.id === note.id)) bundle.notes.push(note);
    await this.save();
  }

  async uploadAttachment(attachment: Attachment) {
    await this.network();
    const bundle = await this.findTask(attachment.taskId);
    if (!attachment.localUri) throw new RemoteError('validation', 'Local file missing', 422);
    const remotePath = `${attachment.taskId}/${attachment.id}.jpg`;
    if (!bundle.attachments.some((a) => a.id === attachment.id)) {
      bundle.attachments.push({
        id: attachment.id,
        taskId: attachment.taskId,
        remotePath,
        caption: attachment.caption,
        mimeType: attachment.mimeType,
        createdAt: attachment.createdAt,
      });
    }
    await this.save();
    return { remotePath };
  }

  async getAttachmentUrl() {
    return null; // demo files only exist on this device; the local uri is used instead
  }

  async registerPushToken() {}

  async reset() {
    this.cache = buildDemoSeed();
    await this.save();
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
