import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { ClassroomsPage } from './ClassroomsPage';

/**
 * What a classroom PATCH is allowed to carry.
 *
 * The API validates with `forbidNonWhitelisted`, so a property its update DTO
 * does not declare fails the whole request rather than being ignored. A form
 * naturally holds every field, including the two that are fixed at creation, so
 * "assign a homeroom teacher and save" was a 400 until the payload was trimmed —
 * which is the case these tests pin down.
 */

const YEAR_ID = '507f1f77bcf86cd799439011';
const GRADE_ID = '507f1f77bcf86cd799439012';
const CLASSROOM_ID = '507f1f77bcf86cd799439013';
const TEACHER_ID = '507f1f77bcf86cd799439014';

const classroom = {
  id: CLASSROOM_ID,
  name: 'ກ',
  schoolYearId: YEAR_ID,
  gradeLevelId: { id: GRADE_ID, code: 'm4', nameLo: 'ມ.4', nameEn: 'Grade 10' },
  homeroomTeacherId: null,
  capacity: 45,
  currentCount: 12,
  room: 'A101',
  isActive: true,
};

const teacher = {
  id: TEACHER_ID,
  teacherCode: 'T-2627-001',
  firstNameLo: 'ສົມເພັດ',
  lastNameLo: 'ພັນໂນລາດ',
  firstNameEn: 'Somphet',
  lastNameEn: 'Phannolath',
  status: 'active',
};

const schoolYear = { id: YEAR_ID, code: '2026-2027', nameLo: '2026-2027', nameEn: '2026-2027' };
const gradeLevel = { id: GRADE_ID, code: 'm4', nameLo: 'ມ.4', nameEn: 'Grade 10', level: 4 };

// Full permissions: the page hides its buttons without them.
vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

/** Routes each list endpoint the page and its reference pickers call. */
function stubGet() {
  vi.spyOn(apiClient, 'get').mockImplementation((path: string) => {
    if (path === '/classrooms') return Promise.resolve(paginated([classroom]) as never);
    if (path === '/teachers') return Promise.resolve(paginated([teacher]) as never);
    if (path === '/school-years') return Promise.resolve(paginated([schoolYear]) as never);
    if (path === '/grade-levels') return Promise.resolve(paginated([gradeLevel]) as never);
    return Promise.resolve(paginated([]) as never);
  });
}

async function openEditDialog() {
  renderWithProviders(<ClassroomsPage />);
  await userEvent.click(await screen.findByRole('button', { name: /actions/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));
  return screen.findByRole('dialog');
}

describe('ClassroomsPage — editing', () => {
  beforeEach(() => {
    stubGet();
    vi.spyOn(apiClient, 'patch').mockResolvedValue(classroom);
    vi.spyOn(apiClient, 'post').mockResolvedValue(classroom);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves a homeroom teacher without sending the fields the API will not take', async () => {
    const dialog = await openEditDialog();

    await userEvent.click(within(dialog).getByRole('combobox', { name: /homeroom teacher/i }));
    await userEvent.click(await screen.findByRole('button', { name: /T-2627-001/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.patch).mock.calls[0]!;

    expect(path).toBe(`/classrooms/${CLASSROOM_ID}`);
    expect(body).toMatchObject({ homeroomTeacherId: TEACHER_ID, name: 'ກ', capacity: 45 });
    // The two the update DTO does not declare — their presence is the 400.
    expect(body).not.toHaveProperty('schoolYearId');
    expect(body).not.toHaveProperty('gradeLevelId');
  });

  it('clears the homeroom teacher with an explicit null rather than an omission', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation((path: string) => {
      if (path === '/classrooms') {
        return Promise.resolve(
          paginated([{ ...classroom, homeroomTeacherId: teacher }]) as never,
        );
      }
      if (path === '/teachers') return Promise.resolve(paginated([teacher]) as never);
      if (path === '/school-years') return Promise.resolve(paginated([schoolYear]) as never);
      if (path === '/grade-levels') return Promise.resolve(paginated([gradeLevel]) as never);
      return Promise.resolve(paginated([]) as never);
    });

    const dialog = await openEditDialog();

    // The clear affordance lives inside the picker's own trigger, so it is
    // scoped to that combobox — the year and grade pickers carry one too.
    const picker = within(dialog).getByRole('combobox', { name: /homeroom teacher/i });
    await userEvent.click(within(picker).getByRole('button', { name: /remove/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.patch).mock.calls[0]!;

    // Dropped as a blank instead, the teacher would silently stay assigned.
    expect(body).toMatchObject({ homeroomTeacherId: null });
  });

  it('will not offer to move an existing class to another year or grade', async () => {
    const dialog = await openEditDialog();

    expect(within(dialog).getByRole('combobox', { name: /school year/i })).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: /grade level/i })).toBeDisabled();
  });

  it('still sends year and grade when creating', async () => {
    renderWithProviders(<ClassroomsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add classroom/i }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('combobox', { name: /school year/i }));
    await userEvent.click(await screen.findByRole('button', { name: /2026-2027/ }));
    await userEvent.click(within(dialog).getByRole('combobox', { name: /grade level/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Grade 10|ມ\.4/ }));
    await userEvent.type(within(dialog).getByLabelText(/section/i), 'ຂ');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0]!;

    expect(path).toBe('/classrooms');
    expect(body).toMatchObject({ schoolYearId: YEAR_ID, gradeLevelId: GRADE_ID, name: 'ຂ' });
  });
});
