import { create } from 'zustand';

/**
 * Small cross-screen state only: connectivity, sync counters and UI prefs.
 * Durable data (tasks, queue) lives in SQLite; server cache in React Query.
 */
interface AppState {
  /** From NetInfo. `null` until the first reading arrives. */
  isConnected: boolean | null;
  /** Developer/demo switch that makes the app behave as if offline. */
  simulateOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  /** Transient message shown after a last-write-wins conflict. */
  notice: string | null;
  remindersEnabled: boolean;

  setConnected(value: boolean): void;
  setSimulateOffline(value: boolean): void;
  setSyncing(value: boolean): void;
  setCounts(counts: { pending: number; failed: number }): void;
  setLastSyncedAt(value: string | null): void;
  setNotice(value: string | null): void;
  setRemindersEnabled(value: boolean): void;
  reset(): void;
}

const initial = {
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  notice: null,
};

export const useAppStore = create<AppState>((set) => ({
  isConnected: null,
  simulateOffline: false,
  remindersEnabled: false,
  ...initial,

  setConnected: (isConnected) => set({ isConnected }),
  setSimulateOffline: (simulateOffline) => set({ simulateOffline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setCounts: ({ pending, failed }) => set({ pendingCount: pending, failedCount: failed }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt }),
  setNotice: (notice) => set({ notice }),
  setRemindersEnabled: (remindersEnabled) => set({ remindersEnabled }),
  reset: () => set(initial),
}));

/** Treat "unknown" as online so the first launch can still attempt a fetch. */
export const selectIsOnline = (s: Pick<AppState, 'isConnected' | 'simulateOffline'>) =>
  !s.simulateOffline && s.isConnected !== false;

export const isOnlineNow = () => selectIsOnline(useAppStore.getState());
