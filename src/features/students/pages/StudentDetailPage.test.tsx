import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
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

/** The student's current placement, as `/enrollments/student/:id` returns it. */
const enrollment = {
  id: '507f1f77bcf86cd799439031',
  studentId: '507f1f77bcf86cd799439011',
  studentCode: 'S-0001',
  studentNameLo: 'ສົມຈິດ ວົງສາ',
  classroomId: { id: '507f1f77bcf86cd799439041', name: 'A' },
  schoolYearId: { id: '507f1f77bcf86cd799439001', code: '2025-2026', nameLo: '2025-2026' },
  gradeLevelId: { id: 'g1', code: 'm1', nameLo: 'ມ.1', level: 1 },
  rollNumber: 3,
  enrolledAt: '2025-09-01T00:00:00.000Z',
  status: 'active',
};

/** A brother in another class, linked through the same father. */
const sibling = {
  id: '507f1f77bcf86cd799439021', studentCode: 'S-0002', firstNameLo: 'ສົມສັກ', lastNameLo: 'ວົງສາ',
  nickname: 'ໂຕ້', gender: 'male', dateOfBirth: '2008-01-09T00:00:00.000Z', status: 'active',
  guardians: [],
  currentEnrollment: { classroomName: 'B', gradeLevelCode: 'm6' },
  sharedGuardians: [{ guardianId: 'g1', fullNameLo: 'ບຸນມີ', relationship: 'father' }],
};

const activeYear = { id: '507f1f77bcf86cd799439001', code: '2025-2026', nameLo: '2025-2026', isActive: true };

/**
 * The room the student is in, and the one the transfer test moves them to.
 * Real ObjectId-shaped ids: the picker validates the format before submitting.
 */
const roomA = { id: '507f1f77bcf86cd799439041', name: 'A', capacity: 45, currentCount: 40, gradeLevelId: { id: 'g1', code: 'm1' }, schoolYearId: activeYear.id, isActive: true };
const roomB = { ...roomA, id: '507f1f77bcf86cd799439042', name: 'B', currentCount: 12 };

/** Swapped per test: the placement tests want a placed student, the rest do not. */
let enrollments: unknown[] = [];

beforeEach(() => {
  enrollments = [];
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    // Ahead of the `/students/` catch-all below, which would otherwise swallow it.
    if (url.endsWith('/siblings')) return [sibling] as never;
    if (url.includes('/students/')) return student as never;
    // Returns a bare array, not a paginated envelope.
    if (url.includes('/enrollments/student/')) return enrollments as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/classrooms') return paginated([roomA, roomB]) as never;
    if (url.includes('/semesters/active')) throw new Error('no active semester');
    return paginated([]) as never;
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

/**
 * Moving a placed student is a transfer, not a second placement: it frees the
 * seat in the old room and takes one in the new. The office usually has one
 * child in front of them rather than a whole class, so the action is offered
 * here as well as on the class roster — and both go through the same dialog.
 */
it('transfers a placed student to another class from their own page', async () => {
  enrollments = [enrollment];
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ ...enrollment, status: 'transferred' });

  renderWithProviders(<StudentDetailPage />);
  await screen.findAllByText('S-0001');

  // A placed student is offered a transfer, never a fresh placement.
  expect(screen.queryByRole('button', { name: /^enroll/i })).not.toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: /transfer/i }));

  const dialog = await screen.findByRole('dialog');
  // Which child, and which room they are leaving.
  expect(dialog).toHaveTextContent('S-0001');
  expect(dialog).toHaveTextContent('A');

  await userEvent.click(within(dialog).getByRole('combobox', { name: /transfer to/i }));
  // The picker renders its options as buttons in a popover, not as `option`s.
  await userEvent.click(await screen.findByRole('button', { name: /m1 B/ }));
  await userEvent.click(within(dialog).getByRole('button', { name: /^transfer$/i }));

  await waitFor(() => expect(patch).toHaveBeenCalled());
  const [url, body] = patch.mock.calls[0]!;
  expect(url).toBe(`/enrollments/${enrollment.id}/status`);
  expect(body).toMatchObject({ status: 'transferred', transferredToClassroomId: roomB.id });
});

it('offers the terminal moves from the enrollment history too', async () => {
  enrollments = [enrollment];

  renderWithProviders(<StudentDetailPage />);
  await screen.findAllByText('S-0001');

  await userEvent.click(screen.getByRole('tab', { name: /enrollment history/i }));
  const panel = screen.getByRole('tabpanel');
  await userEvent.click(within(panel).getByRole('button', { name: /actions/i }));

  // Exactly what `ALLOWED_TRANSITIONS` permits from `active`.
  for (const label of [/transfer/i, /promote/i, /repeat/i, /drop/i]) {
    expect(await screen.findByRole('menuitem', { name: label })).toBeInTheDocument();
  }
});
