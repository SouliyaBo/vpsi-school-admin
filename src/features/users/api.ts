import { useMutation, useQueryClient } from '@tanstack/react-query';
import { post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks } from '@/lib/crud';
import type { User } from '@/types/entities';
import type { Locale, PersonType, UserStatus } from '@/types/enums';

export interface UserInput {
  username: string;
  email?: string;
  password: string;
  roleId: string;
  personType: PersonType;
  /** Required for every type but `staff` — the person the login belongs to. */
  personId?: string;
  /** Defaults to `true` server-side: a password someone else typed must be replaced. */
  mustChangePassword?: boolean;
}

/**
 * PATCH deliberately takes neither `username`, `password`, `personType` nor
 * `personId`. The identity of an account is fixed once it exists, and a password
 * change goes through `reset-password` so it is always audited as one.
 */
export interface UserUpdate {
  email?: string;
  roleId?: string;
  status?: UserStatus;
  locale?: Locale;
}

export const usersApi = {
  ...createCrudApi<User, UserInput, UserUpdate>('/users'),
  /** Forces a change at next login and revokes the account's sessions. */
  resetPassword: (id: string, temporaryPassword: string) =>
    post<void>(`/users/${id}/reset-password`, { temporaryPassword }),
  /** Clears a brute-force lockout before it expires on its own. */
  unlock: (id: string) => post<void>(`/users/${id}/unlock`),
};

export const users = createCrudHooks<User, UserInput, UserUpdate>('users', usersApi);

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      usersApi.resetPassword(id, temporaryPassword),
    meta: { successMessage: 'user.passwordReset' },
    // `mustChangePassword` flips on the row, and the lockout is cleared with it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUnlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: usersApi.unlock,
    meta: { successMessage: 'user.unlocked' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
