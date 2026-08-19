import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { StudentDetailPage } from './StudentDetailPage';

/**
 * Smoke coverage for the detail page: it renders every tab, and the guardians tab
 * opens the same editor the create form uses — the component that used to throw
 * on mount. The active-semester lookup is made to fail here on purpose, since a
 * fresh deployment has none and both summary panels must degrade to an empty
 * state rather than an error.
 */

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => null,
  useSeesEveryStudent: () => true,
}));
// The page reads its id from the route; the rest of the router is left intact.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useParams: () => ({ id: '507f1f77bcf86cd799439011' }) };
});

const student = {
  id: '507f1f77bcf86cd799439011', studentCode: 'S-0001', firstNameLo: 'ສົມຈິດ', lastNameLo: 'ວົງສາ',
  gender: 'male', dateOfBirth: '2010-05-02T00:00:00.000Z', status: 'active',
  villageId: { id: 'v1', nameLo: 'ບ້ານດົງ' },
  guardians: [{ guardianId: 'g1', fullNameLo: 'ບຸນມີ', phone: '2055512345', relationship: 'father', isPrimary: true, isEmergencyContact: true, canViewRecords: true }],
};

/** A brother in another class, linked through the same father. */
const sibling = {
  id: '507f1f77bcf86cd799439021', studentCode: 'S-0002', firstNameLo: 'ສົມສັກ', lastNameLo: 'ວົງສາ',
  nickname: 'ໂຕ້', gender: 'male', dateOfBirth: '2008-01-09T00:00:00.000Z', status: 'active',
  guardians: [],
  currentEnrollment: { classroomName: 'B', gradeLevelCode: 'm6' },
  sharedGuardians: [{ guardianId: 'g1', fullNameLo: 'ບຸນມີ', relationship: 'father' }],
};

beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    // Ahead of the `/students/` catch-all below, which would otherwise swallow it.
    if (url.endsWith('/siblings')) return [sibling] as never;
    if (url.includes('/students/')) return student as never;
    // Returns a bare array, not a paginated envelope.
    if (url.includes('/enrollments/student/')) return [] as never;
    if (url.includes('/semesters/active')) throw new Error('no active semester');
    return { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } as never;
  });
});

it('renders the detail page and every tab, including the guardians editor', async () => {
  renderWithProviders(<StudentDetailPage />);
  expect((await screen.findAllByText('S-0001')).length).toBeGreaterThan(0);

  for (const tab of [/guardians/i, /academic summary/i, /attendance summary/i]) {
    await userEvent.click(screen.getByRole('tab', { name: tab }));
  }

  await userEvent.click(screen.getByRole('tab', { name: /guardians/i }));
  const panel = screen.getByRole('tabpanel');
  await userEvent.click(within(panel).getByRole('button', { name: /edit/i }));
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});

it('lists siblings under the guardians tab, with the link that makes them siblings', async () => {
  renderWithProviders(<StudentDetailPage />);
  await screen.findAllByText('S-0001');

  await userEvent.click(screen.getByRole('tab', { name: /guardians/i }));
  const panel = screen.getByRole('tabpanel');

  const row = (await within(panel).findByText(/ສົມສັກ ວົງສາ/)).closest('tr')!;
  // The nickname rides along with the name, as it does everywhere else.
  expect(row).toHaveTextContent('(ໂຕ້)');
  expect(row).toHaveTextContent('S-0002');
  // Where they are, so the office can go and find them.
  expect(row).toHaveTextContent('m6 B');
  // And *why* they are listed — an unexplained sibling row is unverifiable.
  expect(row).toHaveTextContent(/ບຸນມີ \(Father\)/);
});
