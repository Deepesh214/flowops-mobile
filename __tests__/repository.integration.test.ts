import { MemoryStore } from '@/data/local/memoryStore';
import { DEMO_USER } from '@/data/remote/demoSeed';
import { TaskRepository, TaskRuleError } from '@/data/repositories/taskRepository';
import { SyncEngine } from '@/features/sync/syncEngine';

import { demoApi, flush } from './helpers';

/**
 * Local repository + queue against the demo backend (a mocked remote that
 * honours connectivity), covering the offline demo flow end to end.
 */
async function setup() {
  const online = { value: true };
  const api = demoApi(online);
  const store = new MemoryStore();
  const engine = new SyncEngine({ store, api, isOnline: () => online.value, schedule: () => null });
  const repo = new TaskRepository(store, api, engine);
  await repo.refreshFromRemote(DEMO_USER.id);
  return { online, api, store, engine, repo };
}

const HVAC = 'HVAC inspection – Building C rooftop';

describe('offline-first repository', () => {
  it('caches tasks locally so they stay visible offline', async () => {
    const { online, repo } = await setup();
    online.value = false;
    const tasks = await repo.listTasks();
    expect(tasks.length).toBeGreaterThan(5);
    expect(tasks.find((t) => t.title === HVAC)).toBeDefined();
  });

  it('a refresh failure keeps the cached list', async () => {
    const { online, repo } = await setup();
    online.value = false;
    await expect(repo.refreshFromRemote(DEMO_USER.id)).rejects.toMatchObject({ kind: 'network' });
    expect((await repo.listTasks()).length).toBeGreaterThan(5);
  });

  it('offline edit shows Pending, then syncs after reconnect and survives a refresh', async () => {
    const { online, repo, engine, api } = await setup();
    const hvac = (await repo.listTasks()).find((t) => t.title === HVAC)!;
    const detail = (await repo.getTask(hvac.id))!;
    const step = detail.checklist.find((c) => !c.isDone)!;

    online.value = false;
    await repo.toggleChecklist(hvac.id, step.id, true);
    expect((await repo.getTask(hvac.id))!.syncState).toBe('pending');

    online.value = true;
    await engine.process();
    await flush();
    expect((await repo.getTask(hvac.id))!.syncState).toBe('synced');

    const server = await api.fetchAssignedTasks(DEMO_USER.id);
    expect(
      server.find((b) => b.task.id === hvac.id)!.checklist.find((c) => c.id === step.id)!.isDone,
    ).toBe(true);

    await repo.refreshFromRemote(DEMO_USER.id);
    expect((await repo.getTask(hvac.id))!.checklist.find((c) => c.id === step.id)!.isDone).toBe(
      true,
    );
  });

  it('server refresh does not overwrite tasks with unsynced local changes', async () => {
    const { online, repo, store } = await setup();
    const hvac = (await repo.listTasks()).find((t) => t.title === HVAC)!;
    online.value = false;
    await repo.setStatus(hvac.id, 'blocked');
    // Simulate a pull while still queued (e.g. sync failing on this item).
    await store.applyRemote([]);
    expect((await repo.getTask(hvac.id))!.task.status).toBe('blocked');
  });

  it('offline photo remains visible as pending evidence and unlocks completion', async () => {
    const { online, repo } = await setup();
    const hvac = (await repo.listTasks()).find((t) => t.title === HVAC)!;
    online.value = false;

    await expect(repo.setStatus(hvac.id, 'completed')).rejects.toBeInstanceOf(TaskRuleError);

    const detail = (await repo.getTask(hvac.id))!;
    for (const c of detail.checklist.filter((i) => i.isRequired && !i.isDone)) {
      await repo.toggleChecklist(hvac.id, c.id, true);
    }
    await repo.addAttachment({
      taskId: hvac.id,
      localUri: 'file:///cache/photo.jpg',
      mimeType: 'image/jpeg',
      caption: 'Coil',
    });
    const withPhoto = (await repo.getTask(hvac.id))!;
    expect(withPhoto.attachments).toHaveLength(1);
    expect(withPhoto.attachments[0].syncState).toBe('pending');

    await repo.setStatus(hvac.id, 'completed');
    expect((await repo.getTask(hvac.id))!.task.status).toBe('completed');

    online.value = true;
    await repo.refreshFromRemote(DEMO_USER.id);
    const synced = (await repo.getTask(hvac.id))!;
    expect(synced.attachments[0]).toMatchObject({
      syncState: 'synced',
      localUri: 'file:///cache/photo.jpg',
    });
    expect(synced.task.status).toBe('completed');
  });

  it('completed tasks are read-only', async () => {
    const { repo } = await setup();
    const done = (await repo.listTasks()).find((t) => t.status === 'completed')!;
    const item = (await repo.getTask(done.id))!.checklist[0];
    await expect(repo.toggleChecklist(done.id, item.id, false)).rejects.toThrow(/read-only/);
  });

  it('rejects empty notes before touching storage', async () => {
    const { repo, store } = await setup();
    const any = (await repo.listTasks())[0];
    await expect(repo.addNote(any.id, '   ', DEMO_USER)).rejects.toThrow(/Write something/);
    expect(store.ops).toHaveLength(0);
  });

  it('logout clears local data', async () => {
    const { repo } = await setup();
    await repo.clearLocalData();
    expect(await repo.listTasks()).toEqual([]);
  });
});
