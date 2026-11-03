import { screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { GuardiansPage } from './GuardiansPage';

/**
 * The guardians list answers "whose parent is this, and in which room" without
 * opening each row — staff know the child, not the parent.
 */

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
}));

const father = {
  id: '507f1f77bcf86cd799439051',
  firstNameLo: 'ບຸນມີ',
  lastNameLo: 'ວົງສາ',
  phone: '02055512345',
  createdAt: '2026-09-01T00:00:00.000Z',
  children: [
    {
      id: '507f1f77bcf86cd799439011',
      studentCode: '0802',
      firstNameLo: 'ສົມຈິດ',
      lastNameLo: 'ວົງສາ',
      nickname: 'ນ້ອຍ',
      status: 'active',
      relationship: 'father',
      classroomId: '507f1f77bcf86cd799439041',
      classroomName: 'ມ.1/ກ',
      gradeLevelCode: 'm1',
    },
    {
      id: '507f1f77bcf86cd799439012',
      studentCode: '0610',
      firstNameLo: 'ສົມສັກ',
      lastNameLo: 'ວົງສາ',
      nickname: null,
      status: 'graduated',
      relationship: 'father',
      classroomId: null,
      classroomName: null,
      gradeLevelCode: null,
    },
  ],
};

beforeEach(() => {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/guardians') return paginated([father]) as never;
    return paginated([]) as never;
  });
});

it("shows each guardian's children with their room and relationship", async () => {
  renderWithProviders(<GuardiansPage />);

  const row = (await screen.findByText('ບຸນມີ ວົງສາ')).closest('tr')!;
  const current = within(row).getByRole('link', { name: 'ສົມຈິດ ວົງສາ (ນ້ອຍ)' });
  expect(current).toHaveAttribute('href', '/students/507f1f77bcf86cd799439011');
  // The room's own name already carries its grade, so no latin prefix.
  expect(current.closest('li')).toHaveTextContent('ມ.1/ກ');
  expect(current.closest('li')).not.toHaveTextContent('m1/');
  expect(current.closest('li')).toHaveTextContent('Father');

  // A child who has left shows why there is no room, not "no class yet".
  const graduate = within(row).getByRole('link', { name: 'ສົມສັກ ວົງສາ' }).closest('li')!;
  expect(graduate).toHaveTextContent(/graduated/i);
});

it('sends the room filter from the URL to the API', async () => {
  renderWithProviders(<GuardiansPage />, { route: '/?classroomId=507f1f77bcf86cd799439041' });
  await screen.findByText('ບຸນມີ ວົງສາ');

  expect(apiClient.get).toHaveBeenCalledWith(
    '/guardians',
    expect.objectContaining({
      params: expect.objectContaining({ classroomId: '507f1f77bcf86cd799439041' }),
    }),
  );
});
