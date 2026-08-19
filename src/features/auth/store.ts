import { create } from 'zustand';
import { setSessionExpiredHandler } from '@/lib/api-client';
import { hasPermission } from '@/lib/permissions';
import { tokenStore } from '@/lib/token-store';
import type { AuthUser } from '@/types/common';
import type { PermissionAction, PermissionResource } from '@/types/enums';
import { authApi } from './api';

type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'anonymous';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  /** Set when the session ended on its own, so /login can explain why. */
  expired: boolean;

  login: (username: string, password: string) => Promise<AuthUser>;
  logout: (options?: { everywhere?: boolean }) => Promise<void>;
  /** Runs once at boot: trades a stored refresh token for a live session. */
  restore: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (resource: PermissionResource, action?: PermissionAction) => boolean;
}

export const useAuthStore = create<AuthState>((set, getState) => ({
  user: null,
  status: 'idle',
  expired: false,

  async login(username, password) {
    const { tokens, user } = await authApi.login(username, password);
    tokenStore.setAccessToken(tokens.accessToken, tokens.expiresIn);
    tokenStore.setRefreshToken(tokens.refreshToken);

    // The login payload carries the resolved permission matrix, so no follow-up
    // /auth/me round trip is needed here.
    set({ user, status: 'authenticated', expired: false });
    return user;
  },

  async logout({ everywhere = false } = {}) {
    try {
      if (everywhere) await authApi.logoutAll();
      else await authApi.logout(tokenStore.getRefreshToken());
    } catch {
      // A failed revoke must not trap the user in a session they asked to end;
      // the tokens are dropped locally either way.
    }
    tokenStore.clear();
    set({ user: null, status: 'anonymous', expired: false });
  },

  async restore() {
    if (!tokenStore.getRefreshToken()) {
      set({ status: 'anonymous' });
      return;
    }

    set({ status: 'restoring' });
    try {
      // The access token lives in memory only, so a reload always starts by
      // exchanging the stored refresh token for a new pair.
      const tokens = await authApi.refresh(tokenStore.getRefreshToken()!);
      tokenStore.setAccessToken(tokens.accessToken, tokens.expiresIn);
      tokenStore.setRefreshToken(tokens.refreshToken);

      const user = await authApi.me();
      set({ user, status: 'authenticated' });
    } catch {
      tokenStore.clear();
      set({ user: null, status: 'anonymous' });
    }
  },

  async refreshUser() {
    const user = await authApi.me();
    set({ user });
  },

  can(resource, action = 'read') {
    return hasPermission(getState().user?.permissions, resource, action);
  },
}));

/**
 * When the axios layer gives up on a session (refresh rejected, token reuse
 * detected), clear the store so the router redirects to /login with a reason.
 */
setSessionExpiredHandler(() => {
  const { status } = useAuthStore.getState();
  if (status === 'anonymous') return;
  useAuthStore.setState({ user: null, status: 'anonymous', expired: true });
});

/** Non-reactive read, for use outside React. */
export const authState = () => useAuthStore.getState();
