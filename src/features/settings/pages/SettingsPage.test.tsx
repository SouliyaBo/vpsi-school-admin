import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import type { Setting } from '@/types/entities';
import { SettingsPage } from './SettingsPage';

/**
 * The contract worth pinning here is the payload: this screen must send only the
 * keys the operator actually changed, with `value` typed as the catalogue says —
 * a number for a pass mark, an array for the teaching days — and it must refuse
 * to send a JSON value that does not parse.
 */

function setting(
  overrides: Partial<Setting> & Pick<Setting, 'key' | 'value' | 'category'>,
): Setting {
  return {
    id: overrides.key,
    isPublic: false,
    isSystem: true,
    description: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T03:04:00.000Z',
    ...overrides,
  } as Setting;
}

const SETTINGS: Setting[] = [
  setting({ key: 'school.nameLo', value: 'ໂຮງຮຽນ ທົດສອບ', category: 'school', isPublic: true }),
  setting({
    key: 'grading.passingPercentage',
    value: 50,
    category: 'grading',
    // The seed stores this English sentence for every reader; the catalogue's
    // translated hint should win over it.
    description: 'Default pass mark; a subject may override it',
  }),
  setting({
    key: 'grading.scale',
    value: [{ grade: 'A', minPercentage: 80 }],
    category: 'grading',
  }),
  setting({ key: 'schedule.teachingDays', value: [1, 2, 3, 4, 5], category: 'schedule' }),
  setting({
    key: 'custom.flag',
    value: false,
    category: 'general',
    isSystem: false,
    description: 'A note the office typed itself',
  }),
];

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(SETTINGS);
    vi.spyOn(apiClient, 'put').mockImplementation((_url, body) => Promise.resolve(body as Setting));
    vi.spyOn(apiClient, 'del').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups the catalogue into a tab per category', async () => {
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('tab', { name: /School details/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Grading/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /General/ })).toBeInTheDocument();
    // The first tab is open, and shows the key next to its translated label.
    expect(screen.getByText('school.nameLo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ໂຮງຮຽນ ທົດສອບ')).toBeInTheDocument();
  });

  it('translates the hint of a catalogued key, and keeps the stored note otherwise', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('tab', { name: /Grading/ }));
    expect(
      screen.getByText('The default pass mark — a subject may set its own'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Default pass mark; a subject may override it'),
    ).not.toBeInTheDocument();

    // A key the catalogue does not know has no translation to offer, so the
    // description stored with it is what the row shows.
    await user.click(screen.getByRole('tab', { name: /General/ }));
    expect(screen.getByText('A note the office typed itself')).toBeInTheDocument();
  });

  it('keeps the save bar hidden until a value actually differs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    const input = await screen.findByDisplayValue('ໂຮງຮຽນ ທົດສອບ');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    await user.type(input, 'X');
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();

    // Typed back to the stored value: no longer a change.
    await user.type(input, '{backspace}');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument(),
    );
  });

  it('sends only the edited keys, with the value typed as the catalogue says', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('tab', { name: /Grading/ }));

    const passMark = screen.getByLabelText('Pass mark');
    await user.clear(passMark);
    await user.type(passMark, '60');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalledTimes(1));
    expect(apiClient.put).toHaveBeenCalledWith('/settings', {
      key: 'grading.passingPercentage',
      value: 60,
    });
  });

  it('writes a weekday list as an array of day numbers', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('tab', { name: /Timetable/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Sat' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put).toHaveBeenCalledWith('/settings', {
      key: 'schedule.teachingDays',
      value: [1, 2, 3, 4, 5, 6],
    });
  });

  it('refuses to save a JSON value that does not parse', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    await user.click(await screen.findByRole('tab', { name: /Grading/ }));

    // Set through `fireEvent`: `userEvent.type` reads `[` and `{` as key
    // descriptors, and escaping them would obscure what is being typed.
    fireEvent.change(screen.getByLabelText('Grade bands'), {
      target: { value: '[{ "grade": "A"' },
    });

    expect(await screen.findByText('Not valid JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('offers delete only for a setting the API allows deleting', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsPage />);

    // A seeded (`isSystem`) setting cannot be removed, so no button is offered.
    const schoolTab = await screen.findByRole('tab', { name: /School details/ });
    expect(within(schoolTab).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /General/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(apiClient.del).toHaveBeenCalledWith('/settings/custom.flag'));
  });
});
