import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { EVIDENCE_BUCKET, REQUEST_TIMEOUT_MS } from '@/constants/config';
import type { Attachment, Note, RemoteTaskBundle, Session, User } from '@/types/domain';

import { RemoteError } from './errors';
import type { RemoteApi, TaskUpdatePayload } from './RemoteApi';

type PgError = { message: string; code?: string; status?: number } | null;

/** Converts supabase-js errors into RemoteError without leaking backend text to the UI. */
function toRemoteError(error: NonNullable<PgError>): RemoteError {
  const msg = error.message ?? '';
  if (/network request failed|failed to fetch|load failed|network error/i.test(msg)) {
    return new RemoteError('network', msg);
  }
  if (
    error.code === 'PGRST301' ||
    error.code === '42501' ||
    error.status === 401 ||
    error.status === 403
  ) {
    return new RemoteError('auth', msg, error.status);
  }
  if (
    error.code?.startsWith('23') ||
    error.code?.startsWith('22') ||
    error.status === 400 ||
    error.status === 422
  ) {
    return new RemoteError('validation', msg, error.status);
  }
  if (error.status === 404 || error.code === 'PGRST116')
    return new RemoteError('not_found', msg, 404);
  return new RemoteError('server', msg, error.status);
}

async function withTimeout<T>(promise: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RemoteError('timeout', 'Request timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (e) {
    if (e instanceof RemoteError) throw e;
    throw new RemoteError('network', e instanceof Error ? e.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

function check<T>(res: { data: T; error: PgError }): T {
  if (res.error) throw toRemoteError(res.error);
  return res.data;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'assigned' | 'in_progress' | 'blocked' | 'completed';
  due_at: string | null;
  assignee_id: string;
  requires_evidence: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  task_checklist_items: {
    id: string;
    task_id: string;
    label: string;
    is_required: boolean;
    is_done: boolean;
    sort_order: number;
    updated_at: string;
  }[];
  task_notes: {
    id: string;
    task_id: string;
    author_id: string;
    body: string;
    created_at: string;
    profiles: { full_name: string } | null;
  }[];
  task_attachments: {
    id: string;
    task_id: string;
    storage_path: string;
    caption: string | null;
    mime_type: string;
    created_at: string;
  }[];
};

export class SupabaseApi implements RemoteApi {
  readonly mode = 'supabase' as const;
  private client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Only refresh tokens while the app is in the foreground (Supabase RN guidance).
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (state) => {
        if (state === 'active') this.client.auth.startAutoRefresh();
        else this.client.auth.stopAutoRefresh();
      });
    }
  }

  private async toSession(
    accessToken: string,
    authUser: { id: string; email?: string },
  ): Promise<Session> {
    const { data } = await this.client
      .from('profiles')
      .select('full_name, role')
      .eq('id', authUser.id)
      .maybeSingle();
    const user: User = {
      id: authUser.id,
      email: authUser.email ?? '',
      fullName: data?.full_name ?? authUser.email?.split('@')[0] ?? 'Team member',
      role: data?.role ?? 'Technician',
    };
    return { user, accessToken };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await withTimeout(
      this.client.auth.signInWithPassword({ email: email.trim(), password }),
    );
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        throw new RemoteError('invalid_credentials', error.message, error.status);
      }
      throw toRemoteError(error);
    }
    return this.toSession(data.session.access_token, data.user);
  }

  async signOut() {
    await this.client.auth.signOut();
  }

  async restoreSession() {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return null;
    try {
      return await this.toSession(data.session.access_token, data.session.user);
    } catch {
      return null;
    }
  }

  onSessionExpired(listener: () => void) {
    const { data } = this.client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') listener();
    });
    return () => data.subscription.unsubscribe();
  }

  async fetchAssignedTasks(userId: string): Promise<RemoteTaskBundle[]> {
    const rows = check(
      await withTimeout(
        this.client
          .from('tasks')
          .select(
            '*, task_checklist_items(*), task_notes(id, task_id, author_id, body, created_at, profiles(full_name)), task_attachments(*)',
          )
          .eq('assignee_id', userId)
          .order('due_at', { ascending: true })
          .limit(200),
      ),
    ) as unknown as TaskRow[];

    return rows.map((r) => ({
      task: {
        id: r.id,
        title: r.title,
        description: r.description ?? '',
        priority: r.priority,
        status: r.status,
        dueAt: r.due_at,
        assigneeId: r.assignee_id,
        requiresEvidence: r.requires_evidence,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at,
      },
      checklist: r.task_checklist_items.map((c) => ({
        id: c.id,
        taskId: c.task_id,
        label: c.label,
        isRequired: c.is_required,
        isDone: c.is_done,
        sortOrder: c.sort_order,
        updatedAt: c.updated_at,
      })),
      notes: r.task_notes.map((n) => ({
        id: n.id,
        taskId: n.task_id,
        authorId: n.author_id,
        authorName: n.profiles?.full_name ?? 'Team member',
        body: n.body,
        createdAt: n.created_at,
      })),
      attachments: r.task_attachments.map((a) => ({
        id: a.id,
        taskId: a.task_id,
        remotePath: a.storage_path,
        caption: a.caption ?? '',
        mimeType: a.mime_type,
        createdAt: a.created_at,
      })),
    }));
  }

  async updateTask(id: string, p: TaskUpdatePayload) {
    // Conditional update implements last-write-wins: only apply if the server
    // row has not changed since the version this client based its edit on.
    const rows = check(
      await withTimeout(
        this.client
          .from('tasks')
          .update({ status: p.status, completed_at: p.completedAt, updated_at: p.updatedAt })
          .eq('id', id)
          .lte('updated_at', p.baseUpdatedAt)
          .select('updated_at'),
      ),
    );
    if (!rows || rows.length === 0) {
      const exists = check(
        await withTimeout(this.client.from('tasks').select('id').eq('id', id).maybeSingle()),
      );
      throw exists
        ? new RemoteError('conflict', 'Task changed on server', 409)
        : new RemoteError('not_found', 'Task not found or not assigned to you', 404);
    }
    return { updatedAt: rows[0].updated_at as string };
  }

  async updateChecklistItem(id: string, isDone: boolean, updatedAt: string) {
    check(
      await withTimeout(
        this.client
          .from('task_checklist_items')
          .update({ is_done: isDone, updated_at: updatedAt })
          .eq('id', id),
      ),
    );
  }

  async createNote(note: Omit<Note, 'syncState'>) {
    check(
      await withTimeout(
        this.client.from('task_notes').upsert(
          {
            id: note.id,
            task_id: note.taskId,
            author_id: note.authorId,
            body: note.body,
            created_at: note.createdAt,
          },
          { onConflict: 'id', ignoreDuplicates: true },
        ),
      ),
    );
  }

  async uploadAttachment(a: Attachment) {
    if (!a.localUri) throw new RemoteError('validation', 'Local file missing', 422);
    let body: ArrayBuffer;
    try {
      body = await (await fetch(a.localUri)).arrayBuffer();
    } catch {
      throw new RemoteError('validation', 'Local file missing', 422);
    }
    const path = `${a.taskId}/${a.id}.jpg`;
    const upload = await withTimeout(
      this.client.storage.from(EVIDENCE_BUCKET).upload(path, body, {
        contentType: a.mimeType,
        upsert: true,
      }),
      60_000,
    );
    if (upload.error) throw toRemoteError({ message: upload.error.message });
    check(
      await withTimeout(
        this.client.from('task_attachments').upsert(
          {
            id: a.id,
            task_id: a.taskId,
            storage_path: path,
            caption: a.caption,
            mime_type: a.mimeType,
            created_at: a.createdAt,
          },
          { onConflict: 'id' },
        ),
      ),
    );
    return { remotePath: path };
  }

  async getAttachmentUrl(remotePath: string) {
    const { data } = await this.client.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(remotePath, 60 * 60);
    return data?.signedUrl ?? null;
  }

  async registerPushToken(userId: string, token: string, platform: string) {
    check(
      await this.client
        .from('device_tokens')
        .upsert(
          { user_id: userId, push_token: token, platform, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,push_token' },
        ),
    );
  }
}
