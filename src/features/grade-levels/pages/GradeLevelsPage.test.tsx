import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { GradeLevelsPage } from './GradeLevelsPage';

/**
 * Covers the form path every master-data page shares: required-field validation,
 * the empty-optional-field rule, and what actually reaches the API.
 *
 * The transport is stubbed at `lib/api-client` rather than with a mock server, so
 * the assertions are about the payload this app builds.
 */

const grade = {
  id: '507f1f77bcf86cd799439011',
  code: 'm4',
  nameLo: 'ມ.4',
  nameEn: 'Grade 4',
  level: 4,
  isExitLevel: true,
  createdAt: '2026-01-15T00:00:00.000Z',
};

// Full permissions: the page hides its buttons without them.
vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

describe('GradeLevelsPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([grade]));
    vi.spyOn(apiClient, 'post').mockResolvedValue(grade);
    vi.spyOn(apiClient, 'patch').mockResolvedValue(grade);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists records returned by the API', async () => {
    renderWithProviders(<GradeLevelsPage />);

    expect(await screen.findByText('m4')).toBeInTheDocument();
    expect(screen.getByText('Grade 4')).toBeInTheDocument();
  });

  it('requests the list with server-side pagination and sorting', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    const [path, config] = vi.mocked(apiClient.get).mock.calls[0]!;
    expect(path).toBe('/grade-levels');
    expect(config?.params).toMatchObject({ page: '1', limit: '20', sortBy: 'level', sortOrder: 'asc' });
  });

  it('blocks submission and names the empty required fields', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add grade level/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.clear(within(dialog).getByLabelText(/code/i));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // Both required fields are blank, so both report.
    expect(await within(dialog).findAllByText(/this field is required/i)).toHaveLength(2);
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('drops blank optional fields from the create payload', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add grade level/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/code/i), 'm6');
    await userEvent.type(within(dialog).getByLabelText(/name \(lao\)/i), 'ມ.6');
    // "Name (English)" is left untouched.
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0]!;
    expect(path).toBe('/grade-levels');
    // `nameEn: ''` would be rejected by the API's whitelist validation.
    expect(body).toEqual({ code: 'm6', nameLo: 'ມ.6', level: 1, isExitLevel: false });
    expect(body).not.toHaveProperty('nameEn');
  });

  it('prefills the form when editing and PATCHes the same record', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/code/i)).toHaveValue('m4');
    expect(within(dialog).getByLabelText(/name \(english\)/i)).toHaveValue('Grade 4');

    await userEvent.clear(within(dialog).getByLabelText(/name \(english\)/i));
    await userEvent.type(within(dialog).getByLabelText(/name \(english\)/i), 'Grade four');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(path).toBe(`/grade-levels/${grade.id}`);
    expect(body).toMatchObject({ nameEn: 'Grade four' });
    // `code` is fixed at creation and absent from the update DTO. The API
    // rejects unknown properties outright, so sending it back fails the save.
    expect(body).not.toHaveProperty('code');
  });

  it('will not offer to change the code of an existing level', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/code/i)).toBeDisabled();
  });

  it('rejects a level below the API minimum', async () => {
    renderWithProviders(<GradeLevelsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add grade level/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/code/i), 'm0');
    await userEvent.type(within(dialog).getByLabelText(/name \(lao\)/i), 'ມ.0');
    fireEvent.change(within(dialog).getByLabelText(/level order/i), { target: { value: '0' } });
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByText(/must be at least 1/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });
});
