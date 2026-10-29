import { MemoryStore } from '@/data/local/memoryStore';
import { DemoApi, type KeyValueStorage } from '@/data/remote/demoApi';
import { DEMO_USER } from '@/data/remote/demoSeed';
import { RemoteError } from '@/data/remote/errors';
import type { RemoteApi } from '@/data/remote/RemoteApi';
import { TaskRepository } from '@/data/repositories/taskRepository';
import { SyncEngine } from '@/features/sync/syncEngine';
import type { ChecklistItem, RemoteTaskBundle, Task, TaskSummary } from '@/types/domain';

export const NOW = new Date('2026-10-29T10:00:00.000Z');

export function memoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: async (k) => map.get(k) ?? null,
    setItem: async (k, v) => void map.set(k, v),
    removeItem: async (k) => void map.delete(k),
  };
}

export function makeTask(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: overrides.id ?? 't1',
    title: 'Inspect pump',
    description: 'Check the pressure valve',
    priority: 'medium',
    status: 'assigned',
    dueAt: new Date(NOW.getTime() + 3_600_000).toISOString(),
    assigneeId: DEMO_USER.id,
    requiresEvidence: false,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    completedAt: null,
    checklistTotal: 0,
    checklistDone: 0,
    syncState: 'synced',
    ...overrides,
  };
}

export function makeBundle(
  task: Partial<Task> = {},
  checklist: Partial<ChecklistItem>[] = [],
): RemoteTaskBundle {
  const { checklistTotal: _a, checklistDone: _b, syncState: _c, ...base } = makeTask(task);
  return {
    task: base,
    checklist: checklist.map((c, i) => ({
      id: `${base.id}-c${i}`,
      taskId: base.id,
      label: `Step ${i + 1}`,
      isRequired: false,
      isDone: false,
      sortOrder: i,
      updatedAt: base.updatedAt,
      ...c,
    })),
    notes: [],
    attachments: [],
  };
}

/** A RemoteApi whose methods are jest mocks that succeed by default. */
export function fakeApi(): jest.Mocked<RemoteApi> {
  return {
    mode: 'demo',
    signIn: jest.fn(),
    signOut: jest.fn(),
    restoreSession: jest.fn(),
    onSessionExpired: jest.fn(() => () => undefined),
    fetchAssignedTasks: jest.fn(async () => []),
    updateTask: jest.fn(async (_id, p) => ({ updatedAt: p.updatedAt })),
    updateChecklistItem: jest.fn(async () => undefined),
    createNote: jest.fn(async () => undefined),
    uploadAttachment: jest.fn(async (a) => ({ remotePath: `${a.taskId}/${a.id}.jpg` })),
    getAttachmentUrl: jest.fn(async () => null),
    registerPushToken: jest.fn(async () => undefined),
  } as unknown as jest.Mocked<RemoteApi>;
}

export const networkError = () => new RemoteError('network', 'Network request failed');

export interface Harness {
  store: MemoryStore;
  api: jest.Mocked<RemoteApi>;
  engine: SyncEngine;
  repo: TaskRepository;
  online: { value: boolean };
  clock: { now: Date };
  onConflict: jest.Mock;
  onAuthError: jest.Mock;
}

export async function harness(bundles: RemoteTaskBundle[] = [makeBundle()]): Promise<Harness> {
  const store = new MemoryStore();
  await store.applyRemote(bundles);
  const api = fakeApi();
  const online = { value: true };
  const clock = { now: new Date(NOW) };
  const onConflict = jest.fn();
  const onAuthError = jest.fn();
  const engine = new SyncEngine({
    store,
    api,
    isOnline: () => online.value,
    now: () => clock.now,
    onConflict,
    onAuthError,
    schedule: () => null, // tests drive retries by advancing the clock
    cancel: () => undefined,
  });
  const repo = new TaskRepository(store, api, engine, () => clock.now);
  return { store, api, engine, repo, online, clock, onConflict, onAuthError };
}

export function demoApi(online: { value: boolean }) {
  return new DemoApi({
    storage: memoryStorage(),
    isOnline: () => online.value,
    latencyMs: 0,
    password: 'flowops123',
  });
}

/** Lets fire-and-forget kicks settle. */
export const flush = () => new Promise((r) => setTimeout(r, 0));
