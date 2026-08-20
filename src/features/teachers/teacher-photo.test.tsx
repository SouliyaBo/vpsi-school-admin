import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfilePage } from '@/features/profile/pages/ProfilePage';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { TeachersPage } from './pages/TeachersPage';

/**
 * Teacher portraits: who may put one on file, and where it then shows.
 *
 * The upload exists twice on purpose — the office does it from the staff page,
 * and a teacher does their own from the profile page — and the two go to
 * different endpoints, because the teacher role holds `teachers:read` but not
 * `teachers:update`. That is what these tests pin: the profile page must never
 * post to `/teachers/:id/photo`, which would 403 for the person it is for.
 */

const teacher = {
  id: '507f1f77bcf86cd799439011',
  teacherCode: 'T-2627-001',
  firstNameLo: 'ບຸນມີ',
  lastNameLo: 'ວົງສາ',
  gender: 'female',
  status: 'active',
  isAcademicHead: false,
  photoUrl: 'https://s3.local/photos/teachers/signed.jpg?sig=abc',
};

const account = {
  id: 'user-1',
  username: 'bounmy',
  roleCode: 'teacher',
  personType: 'teacher',
  personId: teacher.id,
  mustChangePassword: false,
  locale: 'lo',
  permissions: [{ resource: 'teachers', actions: ['read'] }],
};

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => account,
  useSeesEveryStudent: () => true,
}));

vi.mock('@/features/auth/store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ logout: vi.fn(), refreshUser: vi.fn(), user: account }),
}));

/**
 * Radix's `Avatar` keeps showing the initials until the browser reports the image
 * loaded, and jsdom loads nothing — so without this the fallback would stand in
 * for every teacher and no assertion could tell a working photo from a missing
 * one. Radix reads `complete`/`naturalWidth` off a probe image it constructs
 * itself, so reporting a finished decode is the whole stub.
 */
class LoadedImage {
  complete = true;
  naturalWidth = 1;
  src = '';
  addEventListener() {}
  removeEventListener() {}
}

beforeEach(() => {
  vi.stubGlobal('Image', LoadedImage);

  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/teachers/me') return teacher as never;
    if (url === '/teachers') return paginated([teacher]) as never;
    return paginated([]) as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const A_PHOTO = new File(['jpeg-bytes'], 'me.jpg', { type: 'image/jpeg' });

it('shows the photo on the staff list, not just initials', async () => {
  renderWithProviders(<TeachersPage />);

  const photo = await waitFor(() => {
    const image = document.querySelector<HTMLImageElement>(`img[src="${teacher.photoUrl}"]`);
    expect(image).not.toBeNull();
    return image!;
  });
  // Decorative: the name is right beside it, so a screen reader would only hear
  // the same person twice.
  expect(photo.getAttribute('alt')).toBe('');
});

it('uploads a teacher’s own photo through the self-service route', async () => {
  const upload = vi.spyOn(apiClient, 'upload').mockResolvedValue(teacher);

  renderWithProviders(<ProfilePage />);
  expect(await screen.findByText(teacher.teacherCode)).toBeInTheDocument();

  await userEvent.upload(document.querySelector('input[type="file"]')!, A_PHOTO);
  // Selection alone must not post — the file is confirmed first.
  expect(upload).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole('button', { name: /upload/i }));

  await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
  expect(upload.mock.calls[0]![0]).toBe('/teachers/me/photo');
  expect((upload.mock.calls[0]![1] as FormData).get('file')).toBe(A_PHOTO);
});

it('leaves the photo card off an account with no staff record behind it', async () => {
  vi.spyOn(apiClient, 'get').mockResolvedValue(paginated([]) as never);
  account.personType = 'staff';
  account.personId = null as unknown as string;

  renderWithProviders(<ProfilePage />);
  expect(await screen.findByRole('button', { name: /save/i })).toBeInTheDocument();

  expect(document.querySelector('input[type="file"]')).toBeNull();
  expect(apiClient.get).not.toHaveBeenCalledWith('/teachers/me');

  account.personType = 'teacher';
  account.personId = teacher.id;
});
