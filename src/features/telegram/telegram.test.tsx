import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { TelegramCard } from './components/TelegramCard';

/**
 * Linking an account to the bot.
 *
 * The two things worth pinning down are both about not lying to the person: a
 * school with no bot configured must not be shown a button that cannot work,
 * and the code must be readable on its own for the case where the deep link
 * opens on a machine with no Telegram installed.
 */
describe('the Telegram card', () => {
  afterEach(() => vi.restoreAllMocks());

  function stub(status: unknown) {
    vi.spyOn(apiClient, 'get').mockImplementation(async () => status as never);
  }

  it('shows nothing at all when the school has no bot', async () => {
    stub({ available: false, linked: false, linkedAt: null });
    renderWithProviders(<TelegramCard />);

    // Nothing arrives, rather than a button that could only ever fail. Waited
    // on because the card renders a skeleton until the status comes back.
    await waitFor(() => expect(screen.queryByText(/telegram notifications/i)).toBeNull());
    expect(screen.queryByRole('button', { name: /connect telegram/i })).toBeNull();
  });

  it('offers the code and the deep link once a code is issued', async () => {
    stub({ available: true, linked: false, linkedAt: null });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      available: true,
      linked: false,
      linkedAt: null,
      code: '481920',
      expiresAt: '2026-09-24T12:00:00.000Z',
      deepLink: 'https://t.me/vpsi_school_bot?start=481920',
    } as never);

    renderWithProviders(<TelegramCard />);
    await userEvent.click(await screen.findByRole('button', { name: /connect telegram/i }));

    await waitFor(() => expect(post).toHaveBeenCalledWith('/telegram/link'));

    // Both routes in: the one-tap link, and the message to type if it is not.
    expect(await screen.findByText('/start 481920')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open bot/i })).toHaveAttribute(
      'href',
      'https://t.me/vpsi_school_bot?start=481920',
    );
  });

  it('offers a test send once linked, and no code', async () => {
    stub({ available: true, linked: true, linkedAt: '2026-09-20T03:00:00.000Z' });
    renderWithProviders(<TelegramCard />);

    expect(await screen.findByRole('button', { name: /send a test message/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect telegram/i })).toBeNull();
  });
});
