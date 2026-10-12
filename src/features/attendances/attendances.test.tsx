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
    if (url === `/semesters/${semester.id}`) return semester as never;
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

/** A summary row as the API shapes it, with ວັນຂາດ read under the three-lates rule. */
function summaryRow(
  counts: { present: number; absent: number; late: number; excused: number; sick: number },
  overrides: Record<string, unknown> = {},
) {
  const lateAsAbsent = Math.floor(counts.late / 3);
  const absentUnexcused = counts.absent + lateAsAbsent;
  const absentExcused = counts.excused + counts.sick;
  const totalRecorded = counts.present + counts.absent + counts.late + counts.excused + counts.sick;
  return {
    studentId: 'stu-1',
    ...counts,
    totalRecorded,
    lateAsAbsent,
    lateRemainder: counts.late - lateAsAbsent * 3,
    absentUnexcused,
    absentExcused,
    absentTotal: absentUnexcused + absentExcused,
    latesPerAbsence: 3,
    attendanceRate:
      totalRecorded === 0
        ? 0
        : Math.round(((totalRecorded - absentUnexcused) / totalRecorded) * 10000) / 100,
    ...overrides,
  };
}

describe('attendance summary', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a student the aggregation never saw, with zeroes rather than a gap', async () => {
    stubReads({
      [`/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`]: [
        summaryRow({ present: 8, absent: 2, late: 0, excused: 0, sick: 0 }),
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

  /**
   * ວັນຂາດ are the API's figures, not the raw statuses: three lates are a day
   * absent without a reason, a sick day is a leave, and the two kinds add up.
   * The table says where a day made of lates came from, or the office would be
   * chasing an absence nobody ever marked.
   */
  it('reads ວັນຂາດ under the three-lates rule, and says which days are lates', async () => {
    stubReads({
      [`/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`]: [
        // 7 lates: 2 days absent and 1 still late. 1 excused + 1 sick: 2 with reason.
        summaryRow({ present: 10, absent: 1, late: 7, excused: 1, sick: 1 }),
      ],
      [`/enrollments/classroom/${classroom.id}/roster`]: [
        {
          id: 'e-stu-1',
          studentId: 'stu-1',
          studentCode: 'S-0001',
          studentNameLo: 'ສົມຈິດ ວົງສາ',
          rollNumber: 1,
          status: 'active',
        },
      ],
      '/attendances': paginated([]),
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();

    const row = (await screen.findByText('ສົມຈິດ ວົງສາ')).closest('tr') as HTMLElement;
    const cells = within(row).getAllByRole('cell');
    // No. · student · present · late · no reason · with reason · total · rate · toggle
    expect(cells[2]).toHaveTextContent('10');
    expect(cells[3]).toHaveTextContent('7');
    expect(cells[3]).toHaveTextContent('1 still late');
    expect(cells[4]).toHaveTextContent('3');
    expect(cells[4]).toHaveTextContent('2 from lates');
    expect(cells[5]).toHaveTextContent('2');
    expect(cells[6]).toHaveTextContent('5');
    // 20 recorded, 3 days absent without reason: 85%.
    expect(cells[7]).toHaveTextContent('85.0%');

    // Opened up, the rule is spelled out above the dated lessons, since the
    // day it made has no date of its own.
    await userEvent.click(within(row).getByRole('button', { name: /show which lessons/i }));
    expect(
      await screen.findByText(/Late 7 times — counted as 2 day\(s\) absent without a reason/),
    ).toBeInTheDocument();
    expect(screen.getByText(/every 3 lates make one/)).toBeInTheDocument();
  });

  /**
   * "Who is at 15 days, and 30" is asked of the whole school, with the room
   * beside the name — and, once a room is picked, of that room alone.
   */
  it('lists the school over a ວັນຂາດ threshold with each student’s room, then narrows to one', async () => {
    const absencesUrl = `/attendances/summary/semester/${semester.id}/absences`;
    const summaryUrl = `/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`;
    stubReads({
      [absencesUrl]: [
        {
          ...summaryRow(
            { present: 40, absent: 10, late: 6, excused: 5, sick: 0 },
            { studentId: 'stu-9' },
          ),
          studentCode: 'S-0009',
          studentNameLo: 'ຄຳຫຼ້າ ໄຊຍະວົງ',
          studentNickname: 'ຫຼ້າ',
          classroomId: 'room-7',
          classroomName: 'ມ.7/ຂ',
          gradeLevelCode: 'm7',
        },
        {
          ...summaryRow({ present: 30, absent: 15, late: 0, excused: 0, sick: 0 }),
          studentCode: 'S-0001',
          studentNameLo: 'ສົມຈິດ ວົງສາ',
          studentNickname: null,
          classroomId: classroom.id,
          classroomName: 'A',
          gradeLevelCode: 'm4',
        },
      ],
      [summaryUrl]: [
        summaryRow({ present: 30, absent: 15, late: 0, excused: 0, sick: 0 }),
        summaryRow(
          { present: 40, absent: 2, late: 0, excused: 0, sick: 0 },
          { studentId: 'stu-2' },
        ),
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
    // No room picked: nothing is asked for until the threshold is.
    expect(screen.getByText(/pick a classroom for its summary/i)).toBeInTheDocument();
    expect(lastParams(absencesUrl)).toBeUndefined();

    await userEvent.click(screen.getByRole('combobox', { name: /days absent from/i }));
    await userEvent.click(screen.getByRole('option', { name: '15 days or more' }));

    // The school-wide list, worst first, each with their room.
    expect(await screen.findByText('ຄຳຫຼ້າ ໄຊຍະວົງ')).toBeInTheDocument();
    expect(lastParams(absencesUrl)).toEqual({ minAbsentDays: '15' });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByRole('button', { name: 'ມ.7/ຂ' })).toBeInTheDocument();
    // 10 absent + 2 from six lates + 5 with reason = 17 days.
    expect(within(rows[0]!).getAllByRole('cell')[6]).toHaveTextContent('17');
    expect(within(rows[1]!).getByRole('button', { name: 'A' })).toBeInTheDocument();
    expect(screen.queryByText(/^No\.$/)).not.toBeInTheDocument();

    // Clicking the room narrows the tab to it: the roster comes back, and the
    // threshold keeps thinning it to the one student over the line.
    await userEvent.click(within(rows[1]!).getByRole('button', { name: 'A' }));
    expect(await screen.findByRole('columnheader', { name: 'No.' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('ສົມຈິດ ວົງສາ')).toBeInTheDocument());
    expect(screen.queryByText('ນາງ ຄຳ')).not.toBeInTheDocument();
    expect(screen.queryByText('ຄຳຫຼ້າ ໄຊຍະວົງ')).not.toBeInTheDocument();

    // Back to everyone in the room.
    await userEvent.click(screen.getByRole('combobox', { name: /days absent from/i }));
    await userEvent.click(screen.getByRole('option', { name: 'Everyone' }));
    expect(await screen.findByText('ນາງ ຄຳ')).toBeInTheDocument();
  });

  /**
   * The counts say how often; the office's next question is which subject, which
   * day, whose lesson. That comes off the log, on demand, one student at a time.
   */
  it('opens a row up to the lessons behind its counts — subject, day and teacher', async () => {
    const summaryUrl = `/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`;
    stubReads({
      [summaryUrl]: [
        summaryRow({ present: 8, absent: 1, late: 1, excused: 0, sick: 0 }),
        summaryRow(
          { present: 10, absent: 0, late: 0, excused: 0, sick: 0 },
          { studentId: 'stu-2' },
        ),
      ],
      [`/enrollments/classroom/${classroom.id}/roster`]: STUDENTS.map((student) => ({
        id: `e-${student.studentId}`,
        studentId: student.studentId,
        studentCode: student.studentCode,
        studentNameLo: student.studentNameLo,
        rollNumber: student.rollNumber,
        status: 'active',
      })),
      '/attendances': paginated([
        {
          id: 'att-1',
          studentId: 'stu-1',
          date: '2025-09-19T00:00:00.000Z',
          period: 1,
          subjectId: lesson.subject,
          teacherId: lesson.teacher,
          recordedBy: { id: 'u-1', username: 'office', personType: 'staff', personId: 'staff-1' },
          status: 'absent',
          reason: 'ບໍ່ມີເຫດຜົນ',
        },
        {
          id: 'att-2',
          studentId: 'stu-1',
          date: '2025-09-18T00:00:00.000Z',
          period: 1,
          subjectId: lesson.subject,
          teacherId: lesson.teacher,
          recordedBy: { id: 'u-2', username: 'somsack', personType: 'teacher', personId: 'tea-1' },
          status: 'late',
          minutesLate: 15,
        },
      ]),
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();

    // Nothing is fetched for anyone until a row is opened, and a clean row
    // has nothing to open.
    await screen.findByText('90.0%');
    expect(lastParams('/attendances')).toBeUndefined();
    expect(
      within(rowFor('ນາງ ຄຳ')).queryByRole('button', { name: /show which lessons/i }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(rowFor('ສົມຈິດ ວົງສາ')).getByRole('button', { name: /show which lessons/i }),
    );

    expect(await screen.findByText('19/09/2025')).toBeInTheDocument();
    expect(lastParams('/attendances')).toMatchObject({
      studentId: 'stu-1',
      semesterId: semester.id,
      classroomId: classroom.id,
      // `cleanParams` writes query values as strings; the API reads `'true'`.
      notPresent: 'true',
    });
    // Subject and teacher for each lesson, and who filed it when that was
    // someone other than the teacher.
    expect(screen.getAllByText('Mathematics')).toHaveLength(2);
    expect(screen.getAllByText('Somsack Phomma').length).toBeGreaterThan(0);
    expect(screen.getByText('recorded by office')).toBeInTheDocument();
    expect(screen.getByText('15 min late')).toBeInTheDocument();
    expect(screen.getByText('ບໍ່ມີເຫດຜົນ')).toBeInTheDocument();
  });

  /**
   * The counts can be read over one month, any stretch of dates, or one subject.
   * Whatever narrows the counts narrows the lessons under a row the same way,
   * or the two would disagree — and the log has no `month`, so it is handed the
   * month as its own two bounds.
   */
  it('narrows both the counts and the lessons to a month, a date range, and a subject', async () => {
    const summaryUrl = `/attendances/summary/classroom/${classroom.id}/semester/${semester.id}`;
    stubReads({
      [summaryUrl]: [summaryRow({ present: 8, absent: 2, late: 0, excused: 0, sick: 0 })],
      [`/enrollments/classroom/${classroom.id}/roster`]: STUDENTS.map((student) => ({
        id: `e-${student.studentId}`,
        studentId: student.studentId,
        studentCode: student.studentCode,
        studentNameLo: student.studentNameLo,
        rollNumber: student.rollNumber,
        status: 'active',
      })),
      '/subjects': paginated([lesson.subject]),
    });

    renderWithProviders(<ClassroomSummary />);
    await chooseClassroom();
    await screen.findByText('80.0%');
    // The whole term, until something narrows it.
    expect(lastParams(summaryUrl)).toEqual({});

    // The term runs September to January, so those are the months on offer.
    await userEvent.click(screen.getByRole('combobox', { name: /^month$/i }));
    expect(screen.getByRole('option', { name: 'September 2025' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'January 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /February/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option', { name: 'October 2025' }));
    await waitFor(() => expect(lastParams(summaryUrl)).toEqual({ month: '10' }));

    await userEvent.click(
      within(rowFor('ສົມຈິດ ວົງສາ')).getByRole('button', { name: /show which lessons/i }),
    );
    await waitFor(() =>
      expect(lastParams('/attendances')).toMatchObject({ from: '2025-10-01', to: '2025-10-31' }),
    );

    // A date range replaces the month rather than intersecting with it.
    await userEvent.type(screen.getByLabelText(/^from$/i), '2025-09-15');
    await userEvent.type(screen.getByLabelText(/^to$/i), '2025-09-30');
    await waitFor(() =>
      expect(lastParams(summaryUrl)).toEqual({ from: '2025-09-15', to: '2025-09-30' }),
    );
    expect(screen.getByRole('combobox', { name: /^month$/i })).toHaveTextContent('Whole term');
    await waitFor(() =>
      expect(lastParams('/attendances')).toMatchObject({ from: '2025-09-15', to: '2025-09-30' }),
    );

    await userEvent.click(screen.getByRole('combobox', { name: /subject/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Mathematics/ }));
    await waitFor(() => expect(lastParams(summaryUrl)).toMatchObject({ subjectId: 'sub-1' }));
    await waitFor(() => expect(lastParams('/attendances')).toMatchObject({ subjectId: 'sub-1' }));
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

/**
 * ການສອນແທນ — the way through the refusal.
 *
 * The teacher standing in for an absent colleague is not the teacher on the
 * timetable, so the API refuses their roll call. Before this, the only way through
 * was to telephone the office, and the register was keyed in from a paper note
 * days later. The sheet now offers the claim at the point it would otherwise
 * simply fail the save.
 */
describe('roll call — covering a colleague’s lesson', () => {
  const claimable = {
    canRecord: false,
    canClaim: true,
    blockedBy: null,
    claimableUntil: '2026-08-10T05:00:00.000Z',
    claimedByTeacherId: null,
  };

  afterEach(() => vi.restoreAllMocks());

  it('offers the claim when the lesson is not the caller’s', async () => {
    stubReads({ '/lesson-substitutions/claimability': claimable });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'sub-1' });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    expect(await screen.findByText(/this lesson is not yours/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /i taught this lesson/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe('/lesson-substitutions');
    // The lesson and the day are the whole of the claim. Who is claiming is the
    // session's to say, not the form's — naming a colleague is the office's power.
    expect(post.mock.calls[0]![1]).toMatchObject({
      teachingAssignmentId: lesson.teachingAssignmentId,
      reason: 'Sick leave',
    });
    expect(post.mock.calls[0]![1]).not.toHaveProperty('substituteTeacherId');
  });

  it('says why when the claim window has already shut', async () => {
    stubReads({
      '/lesson-substitutions/claimability': {
        ...claimable,
        canClaim: false,
        blockedBy: 'substitution.claimWindowClosed',
      },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    // The server's own refusal, translated by its key — so the reason on screen is
    // the reason the API would give rather than a second guess at it.
    expect(await screen.findByText(/deadline for this lesson’s register has passed/i))
      .toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /i taught this lesson/i })).not.toBeInTheDocument();
  });

  it('says nothing at all to the teacher whose lesson it is', async () => {
    stubReads({
      '/lesson-substitutions/claimability': { ...claimable, canRecord: true, canClaim: false },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    await screen.findByText('0/3 marked');
    // Almost every mount of this panel is this case. A teacher marking their own
    // class must not be shown a feature about somebody else's absence.
    expect(screen.queryByText(/this lesson is not yours/i)).not.toBeInTheDocument();
  });

  it('names the stand-in on the sheet once cover is on file', async () => {
    stubReads({
      '/attendances/daily-sheet': {
        ...blankSheet,
        lessons: [
          {
            ...blankSheet.lessons[0],
            substituteTeacher: {
              teacherId: 'tea-9',
              teacherCode: 'T-009',
              teacherName: 'ຄຳຫລ້າ ວົງສາ',
            },
          },
        ],
      },
      '/lesson-substitutions/claimability': { ...claimable, canRecord: true, canClaim: false },
    });

    renderWithProviders(<RollCallSheet />);
    await chooseClassroom();

    // A register signed off by somebody who was not in the building is the first
    // thing the office asks about, so the sheet answers it before they ask.
    expect(await screen.findByText(/Covered by: ຄຳຫລ້າ ວົງສາ/)).toBeInTheDocument();
  });
});
