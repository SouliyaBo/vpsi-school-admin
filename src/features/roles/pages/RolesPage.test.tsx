import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { PERMISSION_RESOURCES } from '@/types/enums';
import { RolesPage } from './RolesPage';

/**
 * The two rules that make this page different from the other master-data
 * screens: `manage` is an umbrella rather than a fifth verb, and a system role's
 * matrix is fixed — a PATCH carrying `permissions` for one is refused outright by
 * `RolesService.update`.
 */

const admin = {
  id: '507f1f77bcf86cd799439001',
  code: 'admin',
  nameLo: 'ຜູ້ບໍລິຫານລະບົບ',
  nameEn: 'System Administrator',
  description: 'Full access to every resource.',
  isSystem: true,
  permissions: PERMISSION_RESOURCES.map((resource) => ({ resource, actions: ['manage'] })),
  createdAt: '2026-01-15T00:00:00.000Z',
};

const custom = {
  id: '507f1f77bcf86cd799439002',
  code: 'librarian',
  nameLo: 'ບັນນາຮັກ',
  nameEn: 'Librarian',
  description: null,
  isSystem: false,
  permissions: [
    { resource: 'students', actions: ['read'] },
    { resource: 'documents', actions: ['create', 'read', 'update'] },
  ],
  createdAt: '2026-01-15T00:00:00.000Z',
};

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

/** Opens the row menu of one role by its code cell. */
async function openRowMenu(code: string) {
  const row = (await screen.findByText(code)).closest('tr')!;
  await userEvent.click(within(row).getByRole('button', { name: /actions/i }));
}

describe('RolesPage', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([admin, custom]));
    vi.spyOn(apiClient, 'post').mockResolvedValue(custom);
    vi.spyOn(apiClient, 'patch').mockResolvedValue(custom);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists roles, and names the one that holds everything', async () => {
    renderWithProviders(<RolesPage />);

    expect(await screen.findByText('admin')).toBeInTheDocument();
    expect(screen.getByText('Librarian')).toBeInTheDocument();
    // `manage` on all 32 resources reads as full access rather than "32 resources".
    expect(screen.getByText(/full access/i)).toBeInTheDocument();
    expect(screen.getByText(/2 resources/i)).toBeInTheDocument();
    expect(screen.getByText(/system role/i)).toBeInTheDocument();
  });

  it('will not offer to delete a system role', async () => {
    renderWithProviders(<RolesPage />);

    await openRowMenu('admin');
    expect(await screen.findByRole('menuitem', { name: /view permissions/i })).toBeInTheDocument();
    // The API refuses it; the menu should not pretend otherwise.
    expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    await openRowMenu('librarian');
    expect(await screen.findByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('shows the granted actions of a role in the drawer', async () => {
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByText('Librarian'));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Documents')).toBeInTheDocument();
    // Only granted rows are listed — 'Scores' carries nothing on this role.
    expect(within(drawer).queryByText('Scores')).not.toBeInTheDocument();
  });

  it('sends the ticked boxes as the API-shaped permission list', async () => {
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /create role/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/code/i), 'homeroom_teacher');
    await userEvent.type(within(dialog).getByLabelText(/name \(lao\)/i), 'ຄູປະຈຳຫ້ອງ');
    await userEvent.type(within(dialog).getByLabelText(/name \(english\)/i), 'Homeroom Teacher');

    await userEvent.click(within(dialog).getByLabelText(/^Students — Read$/));
    await userEvent.click(within(dialog).getByLabelText(/^Attendance — Manage$/));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0]!;
    expect(path).toBe('/roles');
    expect(body).toEqual({
      code: 'homeroom_teacher',
      nameLo: 'ຄູປະຈຳຫ້ອງ',
      nameEn: 'Homeroom Teacher',
      permissions: [
        { resource: 'students', actions: ['read'] },
        { resource: 'attendances', actions: ['manage'] },
      ],
    });
    // A blank description would fail the API's whitelist validation.
    expect(body).not.toHaveProperty('description');
  });

  it('rejects a code that is not a machine key', async () => {
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /create role/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/code/i), 'Homeroom Teacher');
    await userEvent.type(within(dialog).getByLabelText(/name \(lao\)/i), 'ຄູປະຈຳຫ້ອງ');
    await userEvent.type(within(dialog).getByLabelText(/name \(english\)/i), 'Homeroom Teacher');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(
      await within(dialog).findByText(/only lowercase letters, digits and underscores/i),
    ).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('shows what manage covers, without letting a click half-undo it', async () => {
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /create role/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByLabelText(/^Classrooms — Manage$/));

    const read = within(dialog).getByLabelText(/^Classrooms — Read$/);
    expect(read).toBeChecked();
    expect(read).toBeDisabled();
  });

  it('starts a new role from an existing matrix', async () => {
    renderWithProviders(<RolesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /create role/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('combobox', { name: /copy from a role/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Librarian' }));

    expect(within(dialog).getByLabelText(/^Documents — Update$/)).toBeChecked();
    expect(within(dialog).getByLabelText(/^Documents — Delete$/)).not.toBeChecked();
  });

  it('keeps the permission grid out of a system role update', async () => {
    renderWithProviders(<RolesPage />);

    await openRowMenu('admin');
    await userEvent.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/fixed and cannot be edited/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Students — Read$/)).toBeDisabled();

    await userEvent.clear(within(dialog).getByLabelText(/name \(english\)/i));
    await userEvent.type(within(dialog).getByLabelText(/name \(english\)/i), 'Administrator');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(path).toBe(`/roles/${admin.id}`);
    expect(body).toMatchObject({ nameEn: 'Administrator' });
    // `RolesService.update` throws 403 if this key is present at all.
    expect(body).not.toHaveProperty('permissions');
    expect(body).not.toHaveProperty('code');
  });

  it('sends the edited grid for a custom role', async () => {
    renderWithProviders(<RolesPage />);

    await openRowMenu('librarian');
    await userEvent.click(await screen.findByRole('menuitem', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/^Documents — Delete$/));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(body).toMatchObject({
      permissions: [
        { resource: 'students', actions: ['read'] },
        { resource: 'documents', actions: ['create', 'read', 'update', 'delete'] },
      ],
    });
  });
});
