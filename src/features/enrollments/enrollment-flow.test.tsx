import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { StudentsPage } from '@/features/students/pages/StudentsPage';
import { paginated, renderWithProviders } from '@/test/utils';
import { PlacementQueue } from './components/PlacementQueue';

/**
 * Placement: how a student comes to be in a classroom.
 *
 * The rules under test all live in the API and are only *surfaced* here — one
 * active enrollment per student per year, classroom capacity, and a bulk endpoint
 * that rejects rows individually. What the frontend owns is the flow: offering to
 * place a student the moment they are created, and showing which students are
 * still unplaced.
 */

const activeYear = { id: '507f1f77bcf86cd799439001', code: '2025-2026', nameLo: 'ປີ 2025-2026', isActive: true };
const classroom = {
  id: '507f1f77bcf86cd799439002',
  name: 'A',
  capacity: 45,
  currentCount: 12,
  gradeLevelId: { id: 'g1', code: 'm4' },
  schoolYearId: activeYear.id,
  isActive: true,
};

const placedStudent = {
  id: '507f1f77bcf86cd799439010',
  studentCode: 'S-0001',
  firstNameLo: 'ສົມຈິດ',
  lastNameLo: 'ວົງສາ',
  gender: 'male',
  dateOfBirth: '2010-05-02T00:00:00.000Z',
  status: 'active',
  guardians: [],
  currentEnrollment: {
    enrollmentId: 'e1',
    classroomId: classroom.id,
    classroomName: 'A',
    gradeLevelId: 'g1',
    gradeLevelCode: 'm4',
    schoolYearId: activeYear.id,
    rollNumber: 7,
    enrolledAt: '2026-05-01T00:00:00.000Z',
  },
};

const unplacedStudent = {
  ...placedStudent,
  id: '507f1f77bcf86cd799439011',
  studentCode: 'S-0002',
  firstNameLo: 'ນາງ',
  lastNameLo: 'ຄຳ',
  currentEnrollment: null,
};

/** Flipped by the homeroom-teacher block at the bottom; everything else is the office. */
let currentUser: Record<string, unknown> = { username: 'admin', permissions: [] };
let seesEveryStudent = true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => currentUser,
  useSeesEveryStudent: () => seesEveryStudent,
}));

/** Routes each GET the pages make to a fixture. */
function stubReads(students: unknown[]) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, config?: { params?: Record<string, string> }) => {
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/students') {
      const wantsUnplaced = config?.params?.enrolled === 'false';
      const rows = wantsUnplaced
        ? students.filter((student) => !(student as { currentEnrollment: unknown }).currentEnrollment)
        : students;
      return paginated(rows) as never;
    }
    if (url === '/classrooms') return paginated([classroom]) as never;
    return paginated([]) as never;
  });
}

describe('placement — students list', () => {
  beforeEach(() => stubReads([placedStudent, unplacedStudent]));
  afterEach(() => vi.restoreAllMocks());

  it('shows the classroom and roll number for a placed student', async () => {
    renderWithProviders(<StudentsPage />);

    // Comes from `currentEnrollment` on the row — no extra request per student.
    expect(await screen.findByText('m4 A')).toBeInTheDocument();
    expect(screen.getByText(/roll no\. 7/i)).toBeInTheDocument();
  });

  it('flags a student with no class', async () => {
    renderWithProviders(<StudentsPage />);

    expect(await screen.findByText(/no class yet/i)).toBeInTheDocument();
  });

  it('offers to place a student straight after creating them', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(unplacedStudent);
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const form = await screen.findByRole('dialog');

    await userEvent.type(within(form).getByLabelText(/student code/i), 'S-0003');
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
    fireEvent.change(within(form).getByLabelText(/date of birth/i), {
      target: { value: '2011-03-04' },
    });
    await userEvent.click(within(form).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(form).getAllByLabelText(/phone/i).at(-1)!, '2055512345');
    await userEvent.click(within(form).getByRole('button', { name: /^save$/i }));

    // The prompt is the whole point: a student with no class is invisible to
    // rosters, score entry and attendance.
    expect(await screen.findByText(/place this student in a class\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /place now/i }));
    expect(await screen.findByRole('dialog', { name: /place .* in a class/i })).toBeInTheDocument();
  });

  it('places the student in one go when a classroom was picked on the form', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/students') return unplacedStudent as never;
      return { id: 'e2' } as never;
    });
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const form = await screen.findByRole('dialog');

    await userEvent.type(within(form).getByLabelText(/student code/i), 'S-0003');
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
    fireEvent.change(within(form).getByLabelText(/date of birth/i), {
      target: { value: '2011-03-04' },
    });
    await userEvent.click(within(form).getByRole('combobox', { name: /classroom/i }));
    await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
    await userEvent.click(within(form).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(form).getAllByLabelText(/phone/i).at(-1)!, '2055512345');
    await userEvent.click(within(form).getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/enrollments', {
        studentId: unplacedStudent.id,
        classroomId: classroom.id,
      }),
    );

    // Already placed, so the follow-up prompt would only be noise.
    expect(screen.queryByText(/place this student in a class\?/i)).not.toBeInTheDocument();
  });

  it('keeps the saved student and re-offers placement when the class is full', async () => {
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/students') return unplacedStudent as never;
      throw new Error('Classroom is at capacity');
    });
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const form = await screen.findByRole('dialog');

    await userEvent.type(within(form).getByLabelText(/student code/i), 'S-0004');
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
    fireEvent.change(within(form).getByLabelText(/date of birth/i), {
      target: { value: '2011-03-04' },
    });
    await userEvent.click(within(form).getByRole('combobox', { name: /classroom/i }));
    await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
    await userEvent.click(within(form).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(form).getAllByLabelText(/phone/i).at(-1)!, '2055512345');
    await userEvent.click(within(form).getByRole('button', { name: /^save$/i }));

    // The student exists either way — a rejected placement must not read as a
    // failed save, and the prompt is how they get another class.
    expect(await screen.findByText(/place this student in a class\?/i)).toBeInTheDocument();
  });
});

describe('placement — queue', () => {
  beforeEach(() => stubReads([placedStudent, unplacedStudent]));
  afterEach(() => vi.restoreAllMocks());

  it('lists only the unplaced students, asking the API to filter', async () => {
    renderWithProviders(<PlacementQueue />);

    expect(await screen.findByText('S-0002')).toBeInTheDocument();
    expect(screen.queryByText('S-0001')).not.toBeInTheDocument();

    const call = vi
      .mocked(apiClient.get)
      .mock.calls.find(([url]) => url === '/students');
    expect(call?.[1]?.params).toMatchObject({ enrolled: 'false', status: 'active' });
  });

  it('places the selected students in one bulk request keyed by student code', async () => {
    const bulk = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ enrolled: 1, failed: 0, errors: [] });

    renderWithProviders(<PlacementQueue />);
    await screen.findByText('S-0002');

    await userEvent.click(screen.getByRole('checkbox', { name: /ນາງ ຄຳ/ }));
    // The action bar only appears once something is selected.
    await userEvent.click(await screen.findByRole('combobox', { name: /select a classroom/i }));
    await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
    await userEvent.click(screen.getByRole('button', { name: /place 1 student/i }));

    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk.mock.calls[0]![0]).toBe('/enrollments/bulk');
    expect(bulk.mock.calls[0]![1]).toEqual({
      items: [{ studentCode: 'S-0002', classroomId: classroom.id }],
    });
  });

  it('reports the rows the API rejected instead of claiming success', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      enrolled: 0,
      failed: 1,
      errors: [{ studentCode: 'S-0002', reason: 'classroom.capacityExceeded' }],
    });

    renderWithProviders(<PlacementQueue />);
    await screen.findByText('S-0002');

    await userEvent.click(screen.getByRole('checkbox', { name: /ນາງ ຄຳ/ }));
    await userEvent.click(await screen.findByRole('combobox', { name: /select a classroom/i }));
    await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
    await userEvent.click(screen.getByRole('button', { name: /place 1 student/i }));

    // A partial failure must name the students still needing a class.
    expect(await screen.findByText(/0 placed, 1 failed/i)).toBeInTheDocument();
    expect(screen.getByText(/S-0002: classroom.capacityExceeded/)).toBeInTheDocument();
  });
});

/**
 * A homeroom teacher adding a newcomer.
 *
 * The API refuses to place a student anywhere but the teacher's own room, and a
 * student left unplaced is invisible to the teacher who just entered them — so
 * the form picks their room for them rather than offering the whole school.
 */
describe('placement — a homeroom teacher', () => {
  const teacherId = '507f1f77bcf86cd799439099';
  const otherRoom = {
    ...classroom,
    id: '507f1f77bcf86cd799439003',
    name: 'B',
    homeroomTeacherId: '507f1f77bcf86cd799439098',
  };
  const myRoom = { ...classroom, homeroomTeacherId: teacherId };

  beforeEach(() => {
    currentUser = { username: 't-2627-002', permissions: [], personId: teacherId };
    seesEveryStudent = false;

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/school-years/active') return activeYear as never;
      if (url === '/students') return paginated([placedStudent]) as never;
      if (url === '/classrooms') return paginated([myRoom, otherRoom]) as never;
      return paginated([]) as never;
    });
  });

  afterEach(() => {
    currentUser = { username: 'admin', permissions: [] };
    seesEveryStudent = true;
    vi.restoreAllMocks();
  });

  it('places the newcomer in the teacher’s own room without them choosing it', async () => {
    const post = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/students') return unplacedStudent as never;
      return { id: 'e3' } as never;
    });
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const form = await screen.findByRole('dialog');

    await userEvent.type(within(form).getByLabelText(/student code/i), 'S-0005');
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
    fireEvent.change(within(form).getByLabelText(/date of birth/i), {
      target: { value: '2011-03-04' },
    });
    await userEvent.click(within(form).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(form).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(form).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(form).getAllByLabelText(/phone/i).at(-1)!, '2055512345');
    await userEvent.click(within(form).getByRole('button', { name: /^save$/i }));

    // Never touched the classroom picker, and the child still lands in m4 A.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/enrollments', {
        studentId: unplacedStudent.id,
        classroomId: myRoom.id,
      }),
    );
  });

  it('does not offer anyone else’s room', async () => {
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const form = await screen.findByRole('dialog');
    await userEvent.click(within(form).getByRole('combobox', { name: /classroom/i }));

    expect(await screen.findByRole('button', { name: /m4 A/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /m4 B/ })).not.toBeInTheDocument();
  });
});
