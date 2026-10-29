import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { queryClient } from '@/data/queryClient';
import { refreshQueueState, syncEngine, taskRepository } from '@/data/container';
import { notifySyncIssue } from '@/features/notifications/notifications';
import { selectIsOnline, useAppStore } from '@/store/appStore';

/**
 * Mounted once while signed in. Wires connectivity to the sync engine:
 * offline → online transitions and app foregrounding both drain the queue.
 */
export function useSyncBootstrap(enabled: boolean) {
  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      // isInternetReachable is null while unknown; fall back to isConnected.
      const connected = state.isConnected !== false && state.isInternetReachable !== false;
      useAppStore.getState().setConnected(connected);
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      await refreshQueueState();
      const last = await taskRepository.getLastSyncedAt();
      if (!cancelled) useAppStore.getState().setLastSyncedAt(last);
      syncEngine.kickIfOnline();
    })().catch(() => undefined);

    const unsubscribe = useAppStore.subscribe((state, prev) => {
      const online = selectIsOnline(state);
      if (wasOnline.current === false && online) {
        syncEngine.kickIfOnline();
        // Pull fresh server data too once the queue has had a chance to drain.
        queryClient.invalidateQueries({ queryKey: ['remote-refresh'] });
      }
      wasOnline.current = online;

      if (state.failedCount > prev.failedCount && prev.failedCount === 0) {
        notifySyncIssue(state.failedCount);
      }
    });

    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncEngine.kickIfOnline();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      appState.remove();
      syncEngine.stop();
    };
  }, [enabled]);
}
