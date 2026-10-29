import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEMO_ACCOUNT, IS_DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/constants/config';
import { SqliteStore } from '@/data/local/sqliteStore';
import { DemoApi } from '@/data/remote/demoApi';
import type { RemoteApi } from '@/data/remote/RemoteApi';
import { SupabaseApi } from '@/data/remote/supabaseApi';
import { TaskRepository } from '@/data/repositories/taskRepository';
import { SyncEngine } from '@/features/sync/syncEngine';
import { isOnlineNow, useAppStore } from '@/store/appStore';

import { queryClient, queryKeys } from './queryClient';

/**
 * Composition root: the one place that picks concrete implementations.
 * Everything else depends on the LocalStore / RemoteApi interfaces.
 */
export const localStore = new SqliteStore();

export const remoteApi: RemoteApi = IS_DEMO_MODE
  ? new DemoApi({ storage: AsyncStorage, isOnline: isOnlineNow, password: DEMO_ACCOUNT.password })
  : new SupabaseApi(SUPABASE_URL, SUPABASE_ANON_KEY);

let authErrorHandler: () => void = () => undefined;
export function setAuthErrorHandler(fn: () => void) {
  authErrorHandler = fn;
}

export async function refreshQueueState() {
  const counts = await localStore.countOperations();
  useAppStore.getState().setCounts(counts);
  await queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
}

export const syncEngine = new SyncEngine({
  store: localStore,
  api: remoteApi,
  isOnline: isOnlineNow,
  onChange: () => {
    refreshQueueState().catch(() => undefined);
  },
  onAuthError: () => authErrorHandler(),
  onConflict: (count) => {
    useAppStore
      .getState()
      .setNotice(
        count === 1
          ? 'A task was changed elsewhere. The latest server version was kept.'
          : `${count} changes conflicted with newer server data. The server versions were kept.`,
      );
  },
});

export const taskRepository = new TaskRepository(localStore, remoteApi, syncEngine);
