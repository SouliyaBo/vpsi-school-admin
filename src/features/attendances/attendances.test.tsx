import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { ApiError } from '@/lib/api-error';
import { paginated, renderWithProviders } from '@/test/utils';
import { CoverageReport } from '@/features/coverage/CoverageReport';
import { ClassroomSummary } from './components/ClassroomSummary';
import { RollCallSheet } from './components/RollCallSheet';
import { AttendancesPage } from './pages/AttendancesPage';

/**
 * Roll call, and reading it back.
 *
 * The rules under test belong to the frontend. The API is happy to accept one
 * entry for a class of three, so what stops a half-finished sheet from being
 * saved as a full day is here — as is the decision never to pre-select a status,
 * which is what keeps "not yet marked" distinguishable from "present".
 */

const activeYear = {
  id: '507f1f77bcf86cd799439001',
  code: '2025-2026',
  nameLo: 'ປີ 2025-2026',
  isActive: true,
};

const semester = {
  id: '507f1f77bcf86cd799439003',
  nameLo: 'ພາກຮຽນ 1',
  nameEn: 'Semester 1',
  number: 1,
  schoolYearId: activeYear.id,
  startDate: '2025-09-01T00:00:00.000Z',
  endDate: '2026-01-31T00:00:00.000Z',
  status: 'active',
  isActive: true,
};

const classroom = {
  id: '507f1f77bcf86cd799439002',
  name: 'A',
  capacity: 45,
  currentCount: 3,
  gradeLevelId: { id: 'g1', code: 'm4' },
  schoolYearId: activeYear.id,
  isActive: true,
};

const STUDENTS = [
  { studentId: 'stu-1', studentCode: 'S-0001', studentNameLo: 'ສົມຈິດ ວົງສາ', rollNumber: 1 },
  { studentId: 'stu-2', studentCode: 'S-0002', studentNameLo: 'ນາງ ຄຳ', rollNumber: 2 },
  { studentId: 'stu-3', studentCode: 'S-0003', studentNameLo: 'ບຸນມີ ສີສຸກ', rollNumber: 3 },
];

const lesson = {
  teachingAssignmentId: '507f1f77bcf86cd799439004',
  period: 1,
  startTime: '15:10',
  endTime: '16:55',
  room: null,
  subject: { id: 'sub-1', code: 'MATH', nameLo: 'ຄະນິດສາດ', nameEn: 'Mathematics' },
  teacher: {
    id: 'tea-1',
    teacherCode: 'T-001',
    firstNameLo: 'ສົມສັກ',
    lastNameLo: 'ພົມມະ',
    firstNameEn: 'Somsack',
    lastNameEn: 'Phomma',
  },
};

/** One lesson's roster with nothing recorded yet. */
const blankEntries = STUDENTS.map((student) => ({
  ...student,
  status: null,
  minutesLate: null,
  reason: null,
}));

/** A day's sheet with nothing recorded yet. */
const blankSheet = {
  date: '2026-08-08',
  lessons: [{ ...lesson, entries: blankEntries }],
};

/**
 * Swapped per test: the coverage tab is gated on `attendances:manage`, which only
 * the administrator and the head of academic affairs hold.
 */
let permits: (resource: string, action?: string) => boolean = () => true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

type GetConfig = { params?: Record<string, unknown> };

/**
 * Routes every GET the sheet makes to a fixture; `overrides` win.
 *
 * Returns nothing on purpose — a spy is callable, and Vitest treats a function
 * returned from `beforeEach` as a teardown, which would invoke the restored
 * original with no URL and fire a real request.
 */
function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, _config?: GetConfig) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === `/classrooms/${classroom.id}`) return classroom as never;
    if (url === '/attendances/daily-sheet') return blankSheet as never;
    return paginated([]) as never;
  });
}

/** Picks the classroom, which is what makes the sheet load. */
async function chooseClassroom() {
  await userEvent.click(await screen.findByRole('combobox', { name: /classroom/i }));
  await userEvent.click(await screen.findByRole('button', { name: /m4 A/ }));
}

/** The status buttons on one student's row. */
function rowFor(name: string) {
  return screen.getByText(name).closest('tr') as HTMLElement;
}

describe('roll call — marking a class', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('starts with every student unmarked and nothing to save', async () => {
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    expect(await screen.findByText('0/3 marked')).toBeInTheDocument();
    // No status is pressed anywhere on the sheet — a blank row means "not yet
    // decided", which is not the same fact as "present".
    for (const button of screen.getAllByRole('button', { pressed: false })) {
      expect(button).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.queryByRole('button', { pressed: true })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('sends only the students that were marked, once the gap is acknowledged', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 2 });
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    await userEvent.click(within(rowFor('ສົມຈິດ ວົງສາ')).getByRole('button', { name: /present/i }));
    await userEvent.click(within(rowFor('ນາງ ຄຳ')).getByRole('button', { name: /absent/i }));

    expect(await screen.findByText('2/3 marked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    // The third student is unmarked, so saving is a decision, not a reflex.
    expect(await screen.findByText(/some students are unmarked/i)).toBeInTheDocument();
    expect(screen.getByText(/1 students are still unmarked/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /save the marked ones/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // The lesson identifies the roll call; classroom, subject, teacher and
    // semester are the API's to derive, and are deliberately not sent.
    expect(post.mock.calls[0]![1]).toMatchObject({
      teachingAssignmentId: lesson.teachingAssignmentId,
      entries: [
        { studentId: 'stu-1', status: 'present' },
        { studentId: 'stu-2', status: 'absent' },
      ],
    });
    expect(post.mock.calls[0]![1]).not.toHaveProperty('classroomId');
    expect(post.mock.calls[0]![1]).not.toHaveProperty('subjectId');
  });

  it('saves a complete sheet without asking', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 3 });
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    // Fills only the untouched rows, so an absence already marked survives it.
    await userEvent.click(within(rowFor('ນາງ ຄຳ')).getByRole('button', { name: /absent/i }));
    await userEvent.click(
      await screen.findByRole('button', { name: /mark remaining as present/i }),
    );

    expect(await screen.findByText('3/3 marked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/some students are unmarked/i)).not.toBeInTheDocument();
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [
        { studentId: 'stu-1', status: 'present' },
        { studentId: 'stu-2', status: 'absent' },
        { studentId: 'stu-3', status: 'present' },
      ],
    });
  });

  it('asks how late only for a late arrival, and carries it through', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 1 });
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const row = rowFor('ສົມຈິດ ວົງສາ');
    await userEvent.click(within(row).getByRole('button', { name: /present/i }));
    expect(within(row).queryByLabelText(/minutes late/i)).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: /^late$/i }));
    await userEvent.type(within(row).getByLabelText(/minutes late/i), '15');

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save the marked ones/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [{ studentId: 'stu-1', status: 'late', minutesLate: 15 }],
    });
  });

  it('does not offer "sick" — a sick day is a leave, recorded with its reason', async () => {
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const row = rowFor('ສົມຈິດ ວົງສາ');
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: /present/i })).toBeEnabled(),
    );
    expect(within(row).queryByRole('button', { name: /^sick$/i })).not.toBeInTheDocument();
  });

  it('will not save a leave until it says why', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 1 });
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const row = rowFor('ສົມຈິດ ວົງສາ');
    await userEvent.click(within(row).getByRole('button', { name: /present/i }));
    expect(within(row).queryByRole('combobox', { name: /reason/i })).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: /^excused$/i }));

    // Marked, but not saveable: an unexplained leave is the record this sheet
    // exists to stop, so the save waits rather than being chased up later.
    expect(await screen.findByText('1/3 marked')).toBeInTheDocument();
    expect(screen.getByText(/1 leave\(s\) still need a reason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();

    await userEvent.click(within(row).getByRole('combobox', { name: /reason/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'ໄປຫາໝໍ' }));

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save the marked ones/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // The chosen reason goes through as its own text — the list is a shortcut to
    // the same free-text field, not a code the API has to know about.
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [{ studentId: 'stu-1', status: 'excused', reason: 'ໄປຫາໝໍ' }],
    });
  });

  it('drops the reason when the row moves off "excused"', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 1 });
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const row = rowFor('ສົມຈິດ ວົງສາ');
    await userEvent.click(within(row).getByRole('button', { name: /^excused$/i }));
    await userEvent.click(within(row).getByRole('combobox', { name: /reason/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'ໄປຫາໝໍ' }));
    await userEvent.click(within(row).getByRole('button', { name: /present/i }));

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save the marked ones/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    // A reason typed against a leave must not follow the row to "present".
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [{ studentId: 'stu-1', status: 'present' }],
    });
    expect((post.mock.calls[0]![1] as { entries: object[] }).entries[0]).not.toHaveProperty(
      'reason',
    );
  });

  it('reports a rejected date next to the sheet instead of losing it in a toast', async () => {
    vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiError({
        message: 'Date outside semester',
        status: 400,
        messageKey: 'attendance.outsideSemester',
      }),
    );
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    await userEvent.click(within(rowFor('ສົມຈິດ ວົງສາ')).getByRole('button', { name: /present/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save the marked ones/i }));

    expect(
      await screen.findByText(/date falls outside the selected semester/i),
    ).toBeInTheDocument();
  });
});

describe('roll call — a date the class is not taught', () => {
  afterEach(() => vi.restoreAllMocks());

  it('says the timetable is empty rather than offering a sheet the API would reject', async () => {
    stubReads({ '/attendances/daily-sheet': { date: '2026-08-08', lessons: [] } });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    expect(await screen.findByText(/no lesson on this date/i)).toBeInTheDocument();
    // Nothing to mark and nothing to send: attendance belongs to a lesson, and
    // on this date there is none.
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/marked/i)).not.toBeInTheDocument();
  });
});

/**
 * A leave is granted for one of the same thirteen reasons nearly every time, so
 * the field is a list rather than a box. The box is still there behind "other" —
 * dropping it would make the unusual leave unrecordable.
 */
describe('roll call — the reason for a leave', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Marks the first student as excused and opens the reason list. */
  async function openReasonList() {
    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();
    const row = rowFor('ສົມຈິດ ວົງສາ');
    await userEvent.click(within(row).getByRole('button', { name: /^excused$/i }));
    await userEvent.click(within(row).getByRole('combobox', { name: /reason/i }));
    return row;
  }

  it('offers the office\u2019s own list, with "other" last', async () => {
    stubReads();
    await openReasonList();

    const options = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(options).toEqual([
      'ບໍ່ສະບາຍ',
      'ໄປວຽກຄອບຄົວ',
      'ໄປຫາໝໍ',
      'ຄອບກັບບ້ານກອນ',
      'ເຮັດວຽກສະພາ',
      'ໄປເບີ່ງແຂ່ງ',
      'ໄປຕ່າງປະເທດ',
      'ນັກກິລາ',
      'ໄປທັດສະນະ',
      'ຊ້ອມເຕັ້ນ,ກິລາ',
      'ຄົ້ນຄວ້າເສັງອັງກິດ',
      'ໄປຕ່າງແຂວງ',
      'ບໍ່ມີເຫດຜົນ',
      'Other',
    ]);
  });

  it('opens a box under "other", and sends what was typed there', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ recorded: 1 });
    stubReads();
    const row = await openReasonList();

    // Nothing to type into until "other" is the choice.
    expect(
      within(row).queryByRole('textbox', { name: /specify the reason/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    await userEvent.type(
      within(row).getByRole('textbox', { name: /specify the reason/i }),
      'ໄປງານແຕ່ງພີ່ສາວ',
    );

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save the marked ones/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [{ studentId: 'stu-1', status: 'excused', reason: 'ໄປງານແຕ່ງພີ່ສາວ' }],
    });
  });

  it('still blocks the save while "other" is picked but says nothing', async () => {
    stubReads();
    const row = await openReasonList();
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));

    // "Other" is a choice about *where* the reason comes from, not a reason.
    expect(within(row).getByRole('textbox', { name: /specify the reason/i })).toBeInTheDocument();
    expect(screen.getByText(/1 leave\(s\) still need a reason/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('reopens a reason that is not on the list under "other", text intact', async () => {
    stubReads({
      '/attendances/daily-sheet': {
        ...blankSheet,
        lessons: [
          {
            ...lesson,
            entries: [
              // Filed before the list existed, or through "other" at the time.
              { ...blankEntries[0]!, status: 'excused', reason: 'ໄປງານແຕ່ງພີ່ສາວ' },
              // On the list, so this one reopens as the list entry it is.
              { ...blankEntries[1]!, status: 'excused', reason: 'ໄປຫາໝໍ' },
              blankEntries[2]!,
            ],
          },
        ],
      },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const custom = rowFor('ສົມຈິດ ວົງສາ');
    expect(await screen.findByText('2/3 marked')).toBeInTheDocument();
    expect(within(custom).getByRole('textbox', { name: /specify the reason/i })).toHaveValue(
      'ໄປງານແຕ່ງພີ່ສາວ',
    );
    // Neither row is missing a reason, so the sheet saves as it stands.
    expect(screen.queryByText(/still need a reason/i)).not.toBeInTheDocument();

    const preset = rowFor('ນາງ ຄຳ');
    expect(
      within(preset).queryByRole('textbox', { name: /specify the reason/i }),
    ).not.toBeInTheDocument();
    expect(within(preset).getByRole('combobox', { name: /reason/i })).toHaveTextContent('ໄປຫາໝໍ');
  });
});

describe('roll call — correcting a day already recorded', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens on the day as it stands rather than on a blank sheet', async () => {
    stubReads({
      '/attendances/daily-sheet': {
        ...blankSheet,
        lessons: [
          {
            ...lesson,
            entries: [
              { ...blankEntries[0], status: 'absent' },
              { ...blankEntries[1], status: 'late', minutesLate: 20 },
              blankEntries[2],
            ],
          },
        ],
      },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    expect(await screen.findByText('2/3 marked')).toBeInTheDocument();
    expect(within(rowFor('ສົມຈິດ ວົງສາ')).getByRole('button', { name: /absent/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The minutes come back too — re-submitting corrects the record, so anything
    // dropped here would be silently erased.
    expect(within(rowFor('ນາງ ຄຳ')).getByLabelText(/minutes late/i)).toHaveValue(20);
  });

  it('keeps the retired "sick" button on a row that was filed as sick', async () => {
    stubReads({
      '/attendances/daily-sheet': {
        ...blankSheet,
        lessons: [
          {
            ...lesson,
            entries: [{ ...blankEntries[0], status: 'sick' }, blankEntries[1], blankEntries[2]],
          },
        ],
      },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    // The status is no longer offered, but a record already holding it must read
    // back as it was filed rather than looking unmarked.
    const row = rowFor('ສົມຈິດ ວົງສາ');
    expect(await screen.findByText('1/3 marked')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /^sick$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Every other row is back to the four current statuses.
    expect(
      within(rowFor('ນາງ ຄຳ')).queryByRole('button', { name: /^sick$/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * A teacher calling the roll recognises the child by what the class calls them,
 * not by the register name, so both the sheet and the summary carry the nickname
 * beside it. Fixtures are overridden rather than edited in place, so the rest of
 * the file keeps addressing rows by their bare register names.
 */
describe('roll call — nicknames', () => {
  afterEach(() => vi.restoreAllMocks());

  it('puts the nickname beside the register name on the sheet', async () => {
    stubReads({
      '/attendances/daily-sheet': {
        ...blankSheet,
        lessons: [
          {
            ...lesson,
            entries: [
              { ...blankEntries[0]!, studentNickname: 'ລິຕ້າ' },
              { ...blankEntries[1]!, studentNickname: null },
            ],
          },
        ],
      },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    const row = (await screen.findByText('ສົມຈິດ ວົງສາ')).closest('tr') as HTMLElement;
    expect(within(row).getByText('(ລິຕ້າ)')).toBeInTheDocument();
    // A child with none on file is left alone, not given an empty pair of brackets.
    expect(screen.getByText('ນາງ ຄຳ').textContent).toBe('ນາງ ຄຳ');
  });

  it('carries it on the summary, read off the joined student rather than the roster row', async () => {
    stubReads({
      [`/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`]: [],
      [`/enrollments/classroom/${classroom.id}/roster`]: [
        {
          id: 'e-stu-1',
          // The roster row populates the student, which is where the nickname
          // lives — `studentNameLo` beside it is the snapshot taken at placement.
          studentId: { id: 'stu-1', nickname: 'ລິຕ້າ', nicknameEn: 'RITA' },
          studentCode: 'S-0001',
          studentNameLo: 'ສົມຈິດ ວົງສາ',
          rollNumber: 1,
          status: 'active',
        },
      ],
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();

    const name = await screen.findByText('ສົມຈິດ ວົງສາ');
    expect(within(name.closest('a') as HTMLElement).getByText('(ລິຕ້າ)')).toBeInTheDocument();
  });
});

describe('attendance summary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a student the aggregation never saw, with zeroes rather than a gap', async () => {
    stubReads({
      [`/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`]: [
        {
          studentId: 'stu-1',
          present: 8,
          absent: 2,
          late: 0,
          excused: 0,
          sick: 0,
          totalRecorded: 10,
          attendanceRate: 80,
        },
      ],
      [`/enrollments/classroom/${classroom.id}/roster`]: STUDENTS.map((student) => ({
        id: `e-${student.studentId}`,
        studentId: student.studentId,
        studentCode: student.studentCode,
        studentNameLo: student.studentNameLo,
        rollNumber: student.rollNumber,
        status: 'active',
      })),
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();

    expect(await screen.findByText('80.0%')).toBeInTheDocument();
    // Two students have no records at all. Dropping them would read as a class
    // of one, so they are listed as unrecorded instead.
    expect(screen.getAllByText(/nothing recorded yet/i)).toHaveLength(2);
    expect(screen.getByText('ບຸນມີ ສີສຸກ')).toBeInTheDocument();
  });

  it('leaves out a student the office has taken off the roll', async () => {
    stubReads({
      [`/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`]: [],
      [`/enrollments/classroom/${classroom.id}/roster`]: STUDENTS.map((student, index) => ({
        id: `e-${student.studentId}`,
        // The placement is still open — closing it is a separate act the office
        // often never gets to — so the roster row alone cannot tell the class.
        studentId: {
          id: student.studentId,
          status: index === 1 ? 'dropped' : 'active',
        },
        studentCode: student.studentCode,
        studentNameLo: student.studentNameLo,
        rollNumber: student.rollNumber,
        status: 'active',
      })),
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();

    expect(await screen.findByText('ສົມຈິດ ວົງສາ')).toBeInTheDocument();
    expect(screen.getByText('ບຸນມີ ສີສຸກ')).toBeInTheDocument();
    expect(screen.queryByText('ນາງ ຄຳ')).not.toBeInTheDocument();
  });
});

/**
 * Which teacher never marked the roll.
 *
 * The one question the other three tabs cannot answer: they all read records that
 * exist, and an unmarked class is the absence of a record rather than an absent
 * student. Attendance is owed on every day a class is taught, which is where this
 * report parts company with the behaviour register's — so what is under test is
 * that the screen asks for it, and reports the days back.
 */
const coverageRow = (overrides: Record<string, unknown> = {}) => ({
  teachingAssignmentId: 'ta-1',
  teacherId: 'tea-1',
  teacherCode: 'T-2627-003',
  teacherName: 'ພອນທິບ ວົງພະຈັນ',
  subjectId: 'sub-1',
  subjectCode: 'LAO-M1',
  subjectNameLo: 'ພາສາລາວ-ວັນນະຄະດີ',
  subjectNameEn: 'Lao language',
  classroomId: classroom.id,
  classroomName: 'A',
  gradeLevelCode: 'm4',
  lessonsTimetabled: 3,
  lessonsElapsed: 3,
  lessonDates: ['2025-11-03', '2025-11-05', '2025-11-07'],
  missingDates: ['2025-11-05', '2025-11-07'],
  entries: 1,
  studentsNoted: 4,
  lastDate: '2025-11-03',
  status: 'missing',
  ...overrides,
});

const coverageWeek = (rows: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  scope: 'week',
  startDate: '2025-11-03',
  endDate: '2025-11-09',
  asOf: '2025-11-09',
  semester: { id: semester.id, nameLo: semester.nameLo, nameEn: semester.nameEn },
  rows,
  summary: {
    expected: rows.length,
    recorded: rows.filter((row) => row.status === 'recorded').length,
    missing: rows.filter((row) => row.status === 'missing').length,
    notYet: 0,
    coverageRate: 0,
    teachersMissing: 1,
    classroomsMissing: 1,
    ...((extra.summary as Record<string, unknown>) ?? {}),
  },
  ...extra,
});

/** Params of the most recent request to `url`. */
function lastParams(url: string) {
  const calls = vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === url);
  return (calls.at(-1)?.[1] as GetConfig | undefined)?.params;
}

describe('roll call — who has not marked it', () => {
  afterEach(() => {
    permits = () => true;
    vi.restoreAllMocks();
  });

  it('asks its own endpoint for the week, and names the days that went unmarked', async () => {
    stubReads({ '/attendances/coverage': coverageWeek([coverageRow()]) });

    renderWithProviders(<CoverageReport kind="attendance" />);

    expect(await screen.findByText('ພອນທິບ ວົງພະຈັນ')).toBeInTheDocument();
    await waitFor(() =>
      expect(lastParams('/attendances/coverage')).toMatchObject({ outstandingOnly: 'true' }),
    );

    // Marked once, on the Monday — so the two days to chase are the other two,
    // and it is those the row has to name rather than "1 of 3".
    expect(screen.getByText('Wed 5, Fri 7')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /days not marked/i })).toBeInTheDocument();
    expect(screen.getByText(/not recorded/i)).toBeInTheDocument();
  });

  it('reads one day on its own when asked to', async () => {
    stubReads({
      '/attendances/coverage': coverageWeek([coverageRow()], {
        scope: 'day',
        startDate: '2025-11-05',
        endDate: '2025-11-05',
        asOf: '2025-11-05',
      }),
    });

    renderWithProviders(<CoverageReport kind="attendance" />);
    await screen.findByText('ພອນທິບ ວົງພະຈັນ');

    await userEvent.click(screen.getByRole('button', { name: /one day/i }));

    await waitFor(() => {
      expect(lastParams('/attendances/coverage')?.date).toEqual(expect.any(String));
    });
    expect(lastParams('/attendances/coverage')?.weekOf).toBeUndefined();
    // The printed document says which of the two reports it is, and how wide.
    expect(screen.getByText(/daily roll-call coverage/i)).toBeInTheDocument();
  });

  it('is a tab only for the accounts that oversee the roll call', async () => {
    // A teacher may create, read and update attendance, but not `manage`: the
    // school's compliance is not theirs to read.
    permits = (_resource, action) => action !== 'manage';
    stubReads({ '/attendances/coverage': coverageWeek([]) });

    renderWithProviders(<AttendancesPage />);

    expect(await screen.findByRole('tab', { name: /roll call/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /not marked/i })).not.toBeInTheDocument();
    // …and the report itself is never requested, not merely hidden on screen.
    expect(
      vi.mocked(apiClient.get).mock.calls.some(([url]) => url === '/attendances/coverage'),
    ).toBe(false);
  });

  it('is a tab for the administrator and the head of academic affairs', async () => {
    stubReads({ '/attendances/coverage': coverageWeek([]) });

    renderWithProviders(<AttendancesPage />);

    expect(await screen.findByRole('tab', { name: /not marked/i })).toBeInTheDocument();
  });
});
