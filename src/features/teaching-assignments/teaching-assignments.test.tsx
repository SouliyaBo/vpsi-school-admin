import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { paginated, renderWithProviders } from '@/test/utils';
import { AssignmentList } from './components/AssignmentList';
import { TeacherTimetable } from './components/TeacherTimetable';

/**
 * The two things this module has to get right: a PATCH that touches only what
 * the API will accept, and a rejected save that says *which* period clashed.
 *
 * Editing is the path under test rather than creating, because it reaches the
 * schedule editor and the schema without four reference pickers in the way — the
 * references are fixed once an assignment exists.
 */

const TEACHER_ID = '507f1f77bcf86cd799439011';
const SUBJECT_ID = '507f1f77bcf86cd799439012';
const CLASSROOM_ID = '507f1f77bcf86cd799439013';
const SEMESTER_ID = '507f1f77bcf86cd799439014';
const ASSIGNMENT_ID = '507f1f77bcf86cd799439015';
const GRADE_ID = '507f1f77bcf86cd799439018';

const teacher = {
  id: TEACHER_ID,
  teacherCode: 'T-001',
  firstNameLo: 'ສົມໃຈ',
  lastNameLo: 'ວົງສາ',
  firstNameEn: 'Somchai',
  lastNameEn: 'Vongsa',
};

const subject = { id: SUBJECT_ID, code: 'MATH4', nameLo: 'ຄະນິດສາດ', nameEn: 'Mathematics' };
/** Two more subjects of the same grade, for the batch dialog to tick. */
const subjectB = {
  id: '507f1f77bcf86cd799439021',
  code: 'LAO4',
  nameLo: 'ພາສາລາວ',
  nameEn: 'Lao',
};
const subjectC = {
  id: '507f1f77bcf86cd799439022',
  code: 'SCI4',
  nameLo: 'ວິທະຍາສາດ',
  nameEn: 'Science',
};

/** Populated grade level: the section letter alone does not identify a class. */
const classroom = {
  id: CLASSROOM_ID,
  name: 'A',
  gradeLevelId: { id: GRADE_ID, code: 'm4' },
};

const semester = { id: SEMESTER_ID, nameLo: 'ພາກ 1', nameEn: 'Semester 1', isActive: true };
const schoolYear = { id: '507f1f77bcf86cd799439016', nameLo: '2025-26', nameEn: '2025-26' };

const assignment = {
  id: ASSIGNMENT_ID,
  teacherId: teacher,
  subjectId: subject,
  classroomId: classroom,
  semesterId: SEMESTER_ID,
  schoolYearId: schoolYear.id,
  // Inside the school's teaching window (15:10–16:55), the same hours the form
  // defaults a new row to — a fixture outside it would be a timetable the API
  // would refuse.
  schedule: [
    { dayOfWeek: 1, startTime: '15:10', endTime: '16:00', room: 'R1', periodNumber: 1 },
    { dayOfWeek: 3, startTime: '16:05', endTime: '16:55', room: null, periodNumber: null },
  ],
  isActive: true,
  notes: null,
};

/** One route table for every GET the page and its pickers make. */
function route(path: string): unknown {
  if (path === '/teaching-assignments') return paginated([assignment]);
  if (path.startsWith('/teaching-assignments/teacher/')) return [assignment];
  if (path === '/teachers') return paginated([teacher]);
  if (path === '/subjects') return paginated([subject, subjectB, subjectC]);
  if (path === `/subjects/${SUBJECT_ID}`) return { ...subject, gradeLevelId: GRADE_ID };
  if (path === '/classrooms') return paginated([classroom]);
  if (path === `/classrooms/${CLASSROOM_ID}`) return classroom;
  if (path === '/semesters') return paginated([semester]);
  if (path === '/semesters/active') return semester;
  if (path === '/school-years/active') return schoolYear;
  return paginated([]);
}

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

/**
 * The row is only stable once the list *and* the active-year lookup behind the
 * filters have both landed — clicking before that aims at a node the next render
 * replaces, and the menu never opens.
 */
async function settled() {
  await waitFor(() => expect(screen.getByText('Mathematics')).toBeInTheDocument());
}

async function openRowMenu() {
  await settled();
  await userEvent.click(screen.getByRole('button', { name: /actions/i }));
}

async function openEditDialog() {
  await openRowMenu();
  await userEvent.click(await screen.findByRole('menuitem', { name: /^edit$/i }));
  return screen.findByRole('dialog');
}

describe('teaching assignments — list', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(route(path))) as typeof apiClient.get);
    vi.spyOn(apiClient, 'patch').mockResolvedValue(assignment);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the teacher, subject and every weekly period', async () => {
    renderWithProviders(<AssignmentList />);
    await settled();

    expect(screen.getByText('Somchai Vongsa')).toBeInTheDocument();
    expect(screen.getByText(/Mon 15:10.*16:00.*R1/)).toBeInTheDocument();
    expect(screen.getByText(/Wed 16:05.*16:55/)).toBeInTheDocument();
    // Grade-qualified, so a teacher's m3 A and m4 A do not read alike.
    expect(screen.getByText('m4 A')).toBeInTheDocument();
  });

  it('turns an assignment off without touching its references', async () => {
    renderWithProviders(<AssignmentList />);

    await openRowMenu();
    await userEvent.click(await screen.findByRole('menuitem', { name: /deactivate/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(path).toBe(`/teaching-assignments/${ASSIGNMENT_ID}`);
    expect(body).toEqual({ isActive: false });
  });
});

describe('teaching assignments — schedule editor', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(route(path))) as typeof apiClient.get);
    vi.spyOn(apiClient, 'patch').mockResolvedValue(assignment);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefills every period and PATCHes only what an update may carry', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    const starts = within(dialog).getAllByLabelText(/^start$/i);
    expect(starts).toHaveLength(2);
    expect(starts[0]).toHaveValue('15:10');
    expect(within(dialog).getAllByLabelText(/^room$/i)[0]).toHaveValue('R1');

    await userEvent.type(within(dialog).getByLabelText(/notes/i), 'Lab week 3');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    expect(body).toEqual({
      notes: 'Lab week 3',
      schedule: [
        {
          dayOfWeek: 1,
          startTime: '15:10',
          endTime: '16:00',
          room: 'R1',
          periodNumber: 1,
          isRotating: false,
        },
        // The blank room and the absent period number are dropped, not sent as
        // `''`, which the API's whitelist validation would reject. `isRotating`
        // is not dropped with them — `false` is an answer, not a blank, and the
        // schedule is replaced wholesale, so omitting it would erase a tick.
        { dayOfWeek: 3, startTime: '16:05', endTime: '16:55', isRotating: false },
      ],
    });
    // The references are not the client's to change.
    expect(body).not.toHaveProperty('teacherId');
    expect(body).not.toHaveProperty('classroomId');
  });

  /**
   * The school's Friday swap: two teachers trade two classes in the last period,
   * so the same slot legitimately holds more than one lesson. The tick is how
   * that gets said, and the API waives the clash check only where it is set.
   */
  it('marks a period as a swap slot and sends the flag', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    const ticks = within(dialog).getAllByLabelText(/swap slot/i);
    expect(ticks[0]).not.toBeChecked();

    await userEvent.click(ticks[0]!);
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    const schedule = (body as { schedule: { isRotating?: boolean }[] }).schedule;

    expect(schedule[0]).toMatchObject({ startTime: '15:10', isRotating: true });
    // Only the ticked row. The flag belongs to the slot, not the assignment.
    expect(schedule[1]).not.toHaveProperty('isRotating', true);
  });

  /**
   * Reopening an edit must show the swap tick that is already stored.
   *
   * Not a cosmetic prefill: the PATCH replaces the whole schedule, so a field the
   * form did not load is a field the next save silently erases. This is how the
   * tick came back off a lesson that had been marked correctly.
   */
  it('reloads a stored swap tick and carries it back through an unrelated edit', async () => {
    const marked = {
      ...assignment,
      schedule: [
        { ...assignment.schedule[0], isRotating: true },
        { ...assignment.schedule[1], isRotating: false },
      ],
    };
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(
        path === '/teaching-assignments' ? paginated([marked]) : route(path),
      )) as typeof apiClient.get);

    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    const ticks = within(dialog).getAllByLabelText(/swap slot/i);
    expect(ticks[0]).toBeChecked();
    expect(ticks[1]).not.toBeChecked();

    // Touch something else entirely and save.
    await userEvent.type(within(dialog).getByLabelText(/notes/i), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(apiClient.patch).mock.calls[0]!;
    const schedule = (body as { schedule: { isRotating?: boolean }[] }).schedule;

    expect(schedule[0].isRotating).toBe(true);
    expect(schedule[1].isRotating).toBe(false);
  });

  it('still refuses a swap slot that overlaps another period of its own', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    // One teacher, one subject, one class cannot take turns with itself, so
    // ticking must not buy an exemption from the self-overlap rule.
    await userEvent.click(within(dialog).getByRole('button', { name: /add period/i }));
    const ticks = within(dialog).getAllByLabelText(/swap slot/i);
    await userEvent.click(ticks[0]!);
    await userEvent.click(ticks[ticks.length - 1]!);
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(
      await within(dialog).findByText(/overlaps another one in the same schedule/i),
    ).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('rejects a period that ends before it starts', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    fireEvent.change(within(dialog).getAllByLabelText(/^end$/i)[0]!, {
      target: { value: '07:00' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(
      await within(dialog).findByText(/end time must be after the start time/i),
    ).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });

  it('catches a schedule that overlaps itself before the round trip', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    // A fresh row defaults to Monday 15:10–16:55, which covers the first period.
    await userEvent.click(within(dialog).getByRole('button', { name: /add period/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByText(/overlaps another one/i)).toBeInTheDocument();
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe('teaching assignments — conflicts', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(route(path))) as typeof apiClient.get);

    vi.spyOn(apiClient, 'patch').mockRejectedValue(
      new ApiError({
        message: 'Schedule conflict',
        status: 409,
        messageKey: 'assignment.teacherConflict',
        details: {
          conflicts: [
            {
              kind: 'teacher',
              assignmentId: '507f1f77bcf86cd799439017',
              dayOfWeek: 1,
              existing: { startTime: '15:30', endTime: '16:20', room: 'R2' },
              requested: { startTime: '15:10', endTime: '16:00', room: 'R1' },
            },
          ],
        },
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists the clashing period next to the editor instead of toasting it', async () => {
    renderWithProviders(<AssignmentList />);
    const dialog = await openEditDialog();

    fireEvent.change(within(dialog).getAllByLabelText(/^end$/i)[0]!, {
      target: { value: '16:30' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/already has a class scheduled at this time/i);
    expect(alert).toHaveTextContent(/Mon 15:30.*16:20/);
    // The dialog stays open so the schedule can be corrected in place.
    expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });
});

describe('teaching assignments — several subjects at once', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(route(path))) as typeof apiClient.get);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Walks an `EntitySelect` inside the dialog: open it, then take the option. */
  async function pick(dialog: HTMLElement, field: RegExp, option: RegExp) {
    await userEvent.click(within(dialog).getByRole('combobox', { name: field }));
    await userEvent.click(await screen.findByRole('button', { name: option }));
  }

  /** Gets as far as two ticked subjects, both still on the default period. */
  async function openWithTwoSubjects() {
    renderWithProviders(<AssignmentList />);
    await settled();

    await userEvent.click(screen.getByRole('button', { name: /several subjects/i }));
    const dialog = await screen.findByRole('dialog');

    await pick(dialog, /semester/i, /Semester 1/);
    await pick(dialog, /classroom/i, /m4 A/);
    await pick(dialog, /teacher/i, /T-001/);

    await userEvent.click(await within(dialog).findByRole('checkbox', { name: /LAO4/ }));
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /SCI4/ }));

    return dialog;
  }

  it('lists only the subjects of the grade the class belongs to', async () => {
    renderWithProviders(<AssignmentList />);
    await settled();

    await userEvent.click(screen.getByRole('button', { name: /several subjects/i }));
    const dialog = await screen.findByRole('dialog');

    // Nothing to tick until a classroom fixes the grade level.
    expect(within(dialog).getByText(/pick a classroom to list its subjects/i)).toBeInTheDocument();

    await pick(dialog, /classroom/i, /m4 A/);

    expect(await within(dialog).findByRole('checkbox', { name: /MATH4/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: /LAO4/ })).toBeInTheDocument();
  });

  it('warns which subjects the class is already taught, and by whom', async () => {
    renderWithProviders(<AssignmentList />);
    await settled();

    await userEvent.click(screen.getByRole('button', { name: /several subjects/i }));
    const dialog = await screen.findByRole('dialog');

    await pick(dialog, /semester/i, /Semester 1/);
    await pick(dialog, /classroom/i, /m4 A/);

    // The one existing assignment of this class is MATH4, taught by T-001.
    const math = await within(dialog).findByRole('checkbox', { name: /MATH4/ });
    expect(math.closest('label')).toHaveTextContent(/already taught by Somchai Vongsa/i);
    expect(
      within(dialog).getByRole('checkbox', { name: /LAO4/ }).closest('label'),
    ).not.toHaveTextContent(/already taught by/i);
  });

  it('refuses to send two subjects booked on the same hour', async () => {
    const post = vi.spyOn(apiClient, 'post');
    const dialog = await openWithTwoSubjects();

    // Both subjects still hold the default Monday 15:10–16:55 period.
    await userEvent.click(within(dialog).getByRole('button', { name: /create 2 assignments/i }));

    expect(
      await within(dialog).findByText(/clashes with another subject in this batch/i),
    ).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('posts one assignment per subject, sharing the teacher and class', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(assignment);
    const dialog = await openWithTwoSubjects();

    // Both default to the whole teaching window, so the first is shortened and
    // the second follows it rather than being nudged past the end of the day.
    const starts = within(dialog).getAllByLabelText(/^start$/i);
    const ends = within(dialog).getAllByLabelText(/^end$/i);
    fireEvent.change(ends[0]!, { target: { value: '16:00' } });
    fireEvent.change(starts[1]!, { target: { value: '16:05' } });
    fireEvent.change(ends[1]!, { target: { value: '16:55' } });

    await userEvent.click(within(dialog).getByRole('button', { name: /create 2 assignments/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const bodies = vi.mocked(post).mock.calls.map(([, body]) => body);

    expect(bodies[0]).toEqual({
      teacherId: TEACHER_ID,
      classroomId: CLASSROOM_ID,
      semesterId: SEMESTER_ID,
      subjectId: subjectB.id,
      // `isRotating: false` travels rather than being dropped: it is a real
      // answer — this period is not part of a swap — not a blank field.
      schedule: [{ dayOfWeek: 1, startTime: '15:10', endTime: '16:00', isRotating: false }],
    });
    expect(bodies[1]).toMatchObject({
      subjectId: subjectC.id,
      schedule: [{ dayOfWeek: 1, startTime: '16:05', endTime: '16:55' }],
    });
  });

  it('keeps the subjects that worked and re-offers only the one that clashed', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValueOnce(assignment)
      .mockRejectedValueOnce(
        new ApiError({
          message: 'Schedule conflict',
          status: 409,
          messageKey: 'assignment.teacherConflict',
          details: {
            conflicts: [
              {
                kind: 'teacher',
                assignmentId: ASSIGNMENT_ID,
                dayOfWeek: 1,
                existing: { startTime: '09:00', endTime: '09:50', room: null },
                requested: { startTime: '09:00', endTime: '09:50', room: null },
              },
            ],
          },
        }),
      );

    const dialog = await openWithTwoSubjects();
    fireEvent.change(within(dialog).getAllByLabelText(/^start$/i)[1]!, {
      target: { value: '09:00' },
    });
    fireEvent.change(within(dialog).getAllByLabelText(/^end$/i)[1]!, {
      target: { value: '09:50' },
    });

    await userEvent.click(within(dialog).getByRole('button', { name: /create 2 assignments/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    // The dialog stays open: one subject settled into a done row, the other is
    // still editable and shows why it was refused.
    const done = await within(dialog).findByText(/^created$/i);
    expect(done.closest('div')).toHaveTextContent('LAO4');
    expect(
      within(dialog).getByText(/already has a class scheduled at this time/i),
    ).toBeInTheDocument();

    // Submitting again re-sends the failed subject only.
    const retry = within(dialog).getByRole('button', { name: /retry 1 remaining/i });
    post.mockResolvedValueOnce(assignment);
    await userEvent.click(retry);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(3));
    expect(vi.mocked(post).mock.calls[2]![1]).toMatchObject({ subjectId: subjectC.id });
  });
});

describe('teaching assignments — teacher timetable', () => {
  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(route(path))) as typeof apiClient.get);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for the active semester and lays the week out by day', async () => {
    renderWithProviders(<TeacherTimetable />);

    await userEvent.click(await screen.findByRole('combobox', { name: /teacher/i }));
    await userEvent.click(await screen.findByRole('button', { name: /T-001 — Somchai Vongsa/ }));

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        `/teaching-assignments/teacher/${TEACHER_ID}/semester/${SEMESTER_ID}`,
      ),
    );

    // Both periods of the one assignment, under the day each falls on.
    await waitFor(() => expect(screen.getAllByText('Mathematics')).toHaveLength(2));
    expect(screen.getByText('15:10–16:00')).toBeInTheDocument();
    expect(screen.getByText('16:05–16:55')).toBeInTheDocument();
    expect(screen.getAllByText('m4 A')).toHaveLength(2);
    expect(screen.getByText(/2 periods \/ week/i)).toBeInTheDocument();
  });

  /**
   * The school's Friday swap as the teacher sees it: two of their own lessons
   * in one hour. Saying only "swap slot" leaves the obvious question unanswered,
   * so the card names the class on the other side of the trade.
   */
  it('names the class a swap slot alternates with', async () => {
    const FRIDAY = 5;
    const otherClass = {
      id: '507f1f77bcf86cd799439031',
      name: 'B',
      gradeLevelId: { id: GRADE_ID, code: 'm4' },
    };
    const swap = [
      {
        ...assignment,
        id: '507f1f77bcf86cd799439041',
        schedule: [{ dayOfWeek: FRIDAY, startTime: '15:10', endTime: '16:55', isRotating: true }],
      },
      {
        ...assignment,
        id: '507f1f77bcf86cd799439042',
        classroomId: otherClass,
        schedule: [{ dayOfWeek: FRIDAY, startTime: '15:10', endTime: '16:55', isRotating: true }],
      },
    ];

    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(
        path.startsWith('/teaching-assignments/teacher/') ? swap : route(path),
      )) as typeof apiClient.get);

    renderWithProviders(<TeacherTimetable />);
    await userEvent.click(await screen.findByRole('combobox', { name: /teacher/i }));
    await userEvent.click(await screen.findByRole('button', { name: /T-001 — Somchai Vongsa/ }));

    // One card per side of the trade, each pointing at the other.
    expect(await screen.findByText('Swaps with m4 B')).toBeInTheDocument();
    expect(screen.getByText('Swaps with m4 A')).toBeInTheDocument();
    expect(screen.queryByText('Swap slot')).not.toBeInTheDocument();
  });

  it('falls back to an unqualified marker when the partner is not on screen', async () => {
    // A swap whose other half belongs to a teacher this week does not show.
    const lonely = [
      {
        ...assignment,
        schedule: [{ dayOfWeek: 5, startTime: '15:10', endTime: '16:55', isRotating: true }],
      },
    ];
    vi.spyOn(apiClient, 'get').mockImplementation(((path: string) =>
      Promise.resolve(
        path.startsWith('/teaching-assignments/teacher/') ? lonely : route(path),
      )) as typeof apiClient.get);

    renderWithProviders(<TeacherTimetable />);
    await userEvent.click(await screen.findByRole('combobox', { name: /teacher/i }));
    await userEvent.click(await screen.findByRole('button', { name: /T-001 — Somchai Vongsa/ }));

    expect(await screen.findByText('Swap slot')).toBeInTheDocument();
  });
});
