import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/lib/api-client';

/**
 * Connecting one's own account to the school's Telegram bot.
 *
 * Every call here acts on the signed-in account and no other, which is why none
 * of them is behind a permission — the same reasoning as changing one's own
 * password. There is nothing here for the office to do on a colleague's behalf.
 */

export interface TelegramLinkStatus {
  /** False when the school has no bot configured — the card then says so. */
  available: boolean;
  linked: boolean;
  linkedAt: string | null;
}

export interface TelegramLinkCode extends TelegramLinkStatus {
  code: string;
  expiresAt: string;
  /** Opens the bot with the code already filled in; null if the bot is unnamed. */
  deepLink: string | null;
}

const KEY = 'telegram-link';

export const telegramApi = {
  status: () => get<TelegramLinkStatus>('/telegram/link'),
  issue: () => post<TelegramLinkCode>('/telegram/link'),
  unlink: () => del<{ unlinked: true }>('/telegram/link'),
  test: () => post<{ sent: boolean; reason?: string }>('/telegram/test'),
};

export function useTelegramStatus() {
  return useQuery({ queryKey: [KEY], queryFn: telegramApi.status });
}

/**
 * Asks for a code.
 *
 * Not a query: it writes — each call replaces whatever code the account had, so
 * a screen left open somewhere stops working. A refetch on window focus would
 * quietly invalidate the code the person is in the middle of typing.
 */
export function useIssueTelegramCode() {
  return useMutation({ mutationFn: telegramApi.issue });
}

export function useUnlinkTelegram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: telegramApi.unlink,
    meta: { successMessage: 'telegram.unlinked' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useTestTelegram() {
  return useMutation({ mutationFn: telegramApi.test });
}
