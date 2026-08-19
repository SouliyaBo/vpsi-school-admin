import { authRequestConfig, get, patch, post } from '@/lib/api-client';
import type { AuthMeResponse, AuthTokens, AuthUser, LoginResponse } from '@/types/common';

/**
 * `/auth/me` returns the request-scoped user, whose id field is the JWT's `sub`.
 * Normalising here means the rest of the app only ever sees `AuthUser`.
 */
function normalizeUser(user: AuthMeResponse): AuthUser {
  return {
    id: user.id ?? user.sub ?? '',
    username: user.username,
    roleCode: user.roleCode,
    personType: user.personType,
    personId: user.personId ?? null,
    mustChangePassword: Boolean(user.mustChangePassword),
    locale: user.locale ?? 'lo',
    permissions: user.permissions ?? [],
  };
}

export const authApi = {
  /** `_skipAuthRefresh` keeps a wrong password from triggering a refresh attempt. */
  login: (username: string, password: string) =>
    post<LoginResponse>('/auth/login', { username, password }, authRequestConfig),

  refresh: (refreshToken: string) =>
    post<AuthTokens>('/auth/refresh', { refreshToken }, authRequestConfig),

  me: async (): Promise<AuthUser> => normalizeUser(await get<AuthMeResponse>('/auth/me')),

  logout: (refreshToken?: string | null) =>
    post<void>('/auth/logout', refreshToken ? { refreshToken } : {}),

  logoutAll: () => post<void>('/auth/logout-all'),

  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>('/auth/change-password', { currentPassword, newPassword }),

  /**
   * Always 200, whether or not the username exists — the endpoint deliberately
   * cannot be used to enumerate accounts. With no mail transport configured, the
   * reset token comes back in the response for an administrator to relay.
   */
  requestPasswordReset: (username: string) =>
    post<{ token?: string; message?: string }>(
      '/auth/forgot-password',
      { username },
      authRequestConfig,
    ),

  resetPassword: (token: string, newPassword: string) =>
    post<void>('/auth/reset-password', { token, newPassword }, authRequestConfig),

  updateMyProfile: (body: { email?: string; locale?: 'lo' | 'en' }) =>
    patch<void>('/users/me', body),
};
