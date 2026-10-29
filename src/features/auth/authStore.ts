import { create } from 'zustand';

import { localStore, remoteApi, setAuthErrorHandler, syncEngine } from '@/data/container';
import { queryClient } from '@/data/queryClient';
import { RemoteError, userMessage } from '@/data/remote/errors';
import { cancelAllReminders } from '@/features/notifications/notifications';
import { useAppStore } from '@/store/appStore';
import type { User } from '@/types/domain';

type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Set when the backend rejected the session; Login explains why. */
  expired: boolean;
  restore(): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const OWNER_KEY = 'owner_user_id';

export const useAuthStore = create<AuthState>((set) => ({
  status: 'restoring',
  user: null,
  expired: false,

  async restore() {
    try {
      await localStore.init();
      await localStore.resetInFlight();
      const session = await remoteApi.restoreSession();
      set(
        session ? { status: 'signedIn', user: session.user } : { status: 'signedOut', user: null },
      );
    } catch {
      // Failure fallback: never strand the user on the splash screen.
      set({ status: 'signedOut', user: null });
    }
  },

  async signIn(email, password) {
    let session;
    try {
      session = await remoteApi.signIn(email, password);
    } catch (e) {
      throw new Error(userMessage(e instanceof RemoteError ? e : new RemoteError('network', '')));
    }
    // Unsynced data from a different account must never leak into this one.
    const owner = await localStore.getMeta(OWNER_KEY);
    if (owner && owner !== session.user.id) await localStore.clearAll();
    await localStore.setMeta(OWNER_KEY, session.user.id);
    set({ status: 'signedIn', user: session.user, expired: false });
  },

  async signOut() {
    // Flip state first so the SIGNED_OUT auth event isn't mistaken for expiry.
    set({ status: 'signedOut', user: null, expired: false });
    syncEngine.stop();
    try {
      await remoteApi.signOut();
    } catch {
      // Signing out locally must succeed even if the server is unreachable.
    }
    await localStore.clearAll();
    await cancelAllReminders();
    queryClient.clear();
    useAppStore.getState().reset();
  },
}));

// Expired session: return to Login safely but keep queued work, which syncs
// after the same user signs back in.
function handleExpired() {
  if (useAuthStore.getState().status !== 'signedIn') return;
  queryClient.clear();
  useAuthStore.setState({ status: 'signedOut', user: null, expired: true });
}
setAuthErrorHandler(handleExpired);
remoteApi.onSessionExpired(handleExpired);
