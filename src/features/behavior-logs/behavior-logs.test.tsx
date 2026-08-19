import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { MonthlySheet } from './components/MonthlySheet';

/**
 * The behaviour register, written and read as rows.
 *
 * What is under test is the frontend's half of the row abstraction. The API stores
 * one record per student, so it is this screen that has to put a row back together
 * on read, take it apart on write, and refuse the one thing the paper form cannot
 * carry — a line with neither a class note nor a name.
 */

const activeYear = {
  id: '507f1f77bcf86cd799439001',
  code: '2025-2026',
  nameLo: 'ປີ 2025-2026',
  isActive: true,
};

const classroom = {
  id: '507f1f77bcf86cd799439002',
  name: 'ກ',
  capacity: 45,
  currentCount: 4,
  gradeLevelId: { id: 'g1', code: 'm1' },
  homeroomTeacherId: {
    id: 'tea-9',
    teacherCode: 'T-009',
    firstNameLo: 'ນຸ່ລິ',
    lastNameLo: 'ສີສະຫວາດ',
  },
  schoolYearId: activeYear.id,
  isActive: true,
};

const teacher = {
  id: 'tea-1',
  teacherCode: 'T-001',
  firstNameLo: 'ພອນທິບ',
  lastNameLo: 'ພົມມະ',
  firstNameEn: 'Phonthip',
  lastNameEn: 'Phomma',
};

const subject = { id: 'sub-1', code: 'LAO', nameLo: 'ພາສາລາວ', nameEn: 'Lao' };

const lesson = {
  teachingAssignmentId: '507f1f77bcf86cd799439004',
  period: 2,
  startTime: '09:00',
  endTime: '09:45',
  room: null,
  subject,
  teacher,
};

const ROSTER = [
  { studentId: 'stu-1', studentCode: 'S-0001', studentNameLo: 'ທ້າວ ແດນມີ', rollNumber: 1 },
  { studentId: 'stu-2', studentCode: 'S-0002', studentNameLo: 'ທ້າວ ວົນລັງສຸມ', rollNumber: 2 },
  { studentId: 'stu-3', studentCode: 'S-0003', studentNameLo: 'ທ້າວ ວິໄຊ', rollNumber: 3 },
];

/** Two students caught doing the same thing — the paper form's commonest row. */
const sharedRow = {
  groupId: 'grp-1',
  date: '2025-11-11',
  period: 2,
  subject,
  teacher,
  classNote: 'ມີການສັບປ່ຽນບ່ອນນັ່ງ',
  remark: 'ພອນທິບ',
  teachingAssignmentId: lesson.teachingAssignmentId,
  students: [
    { id: 'rec-1', studentId: 'stu-1', studentCode: 'S-0001', studentNameLo: 'ທ້າວ ແດນມີ', behavior: 'ວົນແຊວ', action: 'ເຕືອນ 2 ຄັ້ງ' },
    { id: 'rec-2', studentId: 'stu-3', studentCode: 'S-0003', studentNameLo: 'ທ້າວ ວິໄຊ', behavior: 'ວົນແຊວ', action: 'ເຕືອນ 2 ຄັ້ງ' },
  ],
};

/** A row about nobody in particular — the class as a whole. */
const classOnlyRow = {
  groupId: 'grp-2',
  date: '2025-11-07',
  period: 2,
  subject,
  teacher,
  classNote: 'ໂດຍລວມແລ້ວນັກຮຽນຕັ້ງໃຈຮຽນ ແຕ່ຍັງມີບາງຄົນວົນແຊວ',
  remark: null,
  teachingAssignmentId: lesson.teachingAssignmentId,
  students: [],
};

const sheet = { classroom, year: 2025, month: 11, rows: [classOnlyRow, sharedRow] };

const entryContext = { date: '2025-11-30', lessons: [lesson], roster: ROSTER };

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === `/classrooms/${classroom.id}`) return classroom as never;
    if (url === '/behavior-logs/monthly-sheet') return sheet as never;
    if (url === '/behavior-logs/entry-context') return entryContext as never;
    return paginated([]) as never;
  });
}

/** Picking the class is what makes the sheet load. */
async function chooseClassroom() {
  await userEvent.click(await screen.findByRole('combobox', { name: /class/i }));
  await userEvent.click(await screen.findByRole('button', { name: /m1 ກ/ }));
}

/**
 * Moves the sheet to a month in the past.
 *
 * Deliberately a past year: what is under test is that a new row defaults into
 * the *viewed* month, and if the viewed month happened to be the current one the
 * assertion would hold for the wrong reason.
 */
async function viewMonth(year: string, month: string) {
  await userEvent.click(screen.getByRole('combobox', { name: /month/i }));
  await userEvent.click(await screen.findByRole('option', { name: month }));

  const yearInput = screen.getByLabelText(/^year$/i);
  await userEvent.clear(yearInput);
  await userEvent.type(yearInput, year);
}

describe('behaviour register — the monthly sheet', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('heads the sheet with the class and its homeroom teacher', async () => {
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    // Scoped to the sheet's own header: the class also names the filter above it,
    // and it is the printed heading that has to be right.
    const title = await screen.findByText(/monitoring and recording of student behaviour/i);
    const header = title.closest('header') as HTMLElement;

    expect(within(header).getByText(/m1 ກ/)).toBeInTheDocument();
    // The paper form names the homeroom teacher, who is not the subject teacher
    // on any of the rows — the sheet belongs to the class, not to the lesson.
    expect(within(header).getByText(/ນຸ່ລິ/)).toBeInTheDocument();
  });

  it('puts several students back on one row, and says their shared behaviour once', async () => {
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    const row = (await screen.findByText('ທ້າວ ແດນມີ')).closest('tr') as HTMLElement;

    // Both names are on the one row: the API stores a record each, but the row is
    // what was written and what is read.
    expect(within(row).getByText('ທ້າວ ວິໄຊ')).toBeInTheDocument();
    // ...and the behaviour they share is stated once rather than repeated down
    // the cell, which is how the paper reads.
    expect(within(row).getAllByText('ວົນແຊວ')).toHaveLength(1);
    expect(within(row).getAllByText('ເຕືອນ 2 ຄັ້ງ')).toHaveLength(1);
  });

  it('keeps a row that names nobody — the class as a whole is a record too', async () => {
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    const note = await screen.findByText(/ໂດຍລວມແລ້ວນັກຮຽນຕັ້ງໃຈຮຽນ/);
    const row = note.closest('tr') as HTMLElement;
    expect(row).toBeInTheDocument();
    expect(within(row).queryByText(/ທ້າວ/)).not.toBeInTheDocument();
  });
});

/**
 * A homeroom teacher knows a child by what the class calls them, so both the
 * register and the picker that writes to it carry the nickname beside the
 * register name. Fixtures are overridden rather than changed in place, so the
 * rest of the file keeps asserting on bare register names.
 */
describe('behaviour register — nicknames', () => {
  const nicknamedRow = {
    ...sharedRow,
    students: [
      { ...sharedRow.students[0]!, studentNickname: 'ລິຕ້າ' },
      { ...sharedRow.students[1]!, studentNickname: null },
    ],
  };

  beforeEach(() =>
    stubReads({
      '/behavior-logs/monthly-sheet': { ...sheet, rows: [nicknamedRow] },
      '/behavior-logs/entry-context': {
        ...entryContext,
        roster: [{ ...ROSTER[0]!, studentNickname: 'ລິຕ້າ' }, ...ROSTER.slice(1)],
      },
    }),
  );
  afterEach(() => vi.restoreAllMocks());

  it('names students on the sheet by their nickname as well', async () => {
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    expect(await screen.findByText('ທ້າວ ແດນມີ (ລິຕ້າ)')).toBeInTheDocument();
    // A child with none on file is left alone, not given an empty pair of brackets.
    expect(screen.getByText('ທ້າວ ວິໄຊ')).toBeInTheDocument();
  });

  it('offers it in the student picker, which is where the teacher is guessing', async () => {
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    await userEvent.click(await screen.findByRole('button', { name: /add entry/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: /add a student/i }));

    // The roll number stays last: the label reads code — name (nickname) — roll.
    expect(
      await screen.findByRole('option', { name: 'S-0001 — ທ້າວ ແດນມີ (ລິຕ້າ) (1)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'S-0002 — ທ້າວ ວົນລັງສຸມ (2)' }),
    ).toBeInTheDocument();
  });
});

describe('behaviour register — writing a row', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('sends the lesson and one entry per student, and derives nothing else', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ groupId: 'grp-3', recorded: 2 });
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    await userEvent.click(await screen.findByRole('button', { name: /add entry/i }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(
      within(dialog).getByLabelText(/the class as a whole/i),
      'ມີການສັບປ່ຽນບ່ອນນັ່ງ',
    );

    await userEvent.click(within(dialog).getByRole('combobox', { name: /add a student/i }));
    await userEvent.click(await screen.findByRole('option', { name: /ທ້າວ ແດນມີ/ }));

    const studentRow = within(dialog).getByText(/ທ້າວ ແດນມີ/).closest('div') as HTMLElement;
    await userEvent.type(within(studentRow).getByLabelText(/behaviour/i), 'ວົນແຊວ');
    await userEvent.type(within(studentRow).getByLabelText(/deduction/i), 'ເຕືອນ 2 ຄັ້ງ');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe('/behavior-logs');
    expect(post.mock.calls[0]![1]).toMatchObject({
      teachingAssignmentId: lesson.teachingAssignmentId,
      classNote: 'ມີການສັບປ່ຽນບ່ອນນັ່ງ',
      entries: [{ studentId: 'stu-1', behavior: 'ວົນແຊວ', action: 'ເຕືອນ 2 ຄັ້ງ' }],
    });
    // Classroom, subject, teacher and semester are the API's to read off the
    // lesson; sending them would let a row disagree with the timetable.
    expect(post.mock.calls[0]![1]).not.toHaveProperty('classroomId');
    expect(post.mock.calls[0]![1]).not.toHaveProperty('subjectId');
  });

  it('files a row that only describes the class, with no student named', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ groupId: 'grp-3', recorded: 1 });
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    await userEvent.click(await screen.findByRole('button', { name: /add entry/i }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(/will record the class as a whole only/i),
    ).toBeInTheDocument();

    await userEvent.type(
      within(dialog).getByLabelText(/the class as a whole/i),
      'ນັກຮຽນຕັ້ງໃຈຮຽນດີ',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({
      classNote: 'ນັກຮຽນຕັ້ງໃຈຮຽນດີ',
      entries: [],
    });
  });

  it('refuses a row that says nothing at all', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ groupId: 'x', recorded: 0 });
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    await userEvent.click(await screen.findByRole('button', { name: /add entry/i }));
    const dialog = await screen.findByRole('dialog');

    expect(
      within(dialog).getByText(/either a note about the class or at least one student/i),
    ).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    // A blank line in the register is worse than no line: nothing is sent, and
    // the dialog stays open on the hint rather than closing on a silent no-op.
    expect(post).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  it('opens a new row on the viewed month, not on today', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ groupId: 'grp-3', recorded: 1 });
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();
    await viewMonth('2025', '11');

    await userEvent.click(await screen.findByRole('button', { name: /add entry/i }));
    const dialog = await screen.findByRole('dialog');

    // Defaulting to today would file the row into the current month's sheet
    // while the teacher is looking at November's, and say nothing about it.
    expect(within(dialog).getByLabelText(/^date$/i)).toHaveValue('2025-11-30');

    await userEvent.type(within(dialog).getByLabelText(/the class as a whole/i), 'ຕັ້ງໃຈຮຽນ');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({ date: '2025-11-30' });
  });
});

describe('behaviour register — correcting a row', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('locks the date and the lesson, and PUTs the whole row to its group', async () => {
    const put = vi.spyOn(apiClient, 'put').mockResolvedValue({ groupId: 'grp-1', recorded: 1 });
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    const row = (await screen.findByText('ທ້າວ ແດນມີ')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /^edit$/i }));

    const dialog = await screen.findByRole('dialog');
    // Every field on the records is copied off the lesson, so moving a row to a
    // different one is a withdrawal and a re-entry, not an edit.
    expect(within(dialog).getByLabelText(/^date$/i)).toBeDisabled();
    expect(within(dialog).queryByRole('combobox', { name: /lesson/i })).not.toBeInTheDocument();

    // Drops one of the two students, which is the case an in-place edit of the
    // records could not express.
    const listed = within(dialog).getByText(/ທ້າວ ວິໄຊ/).closest('div') as HTMLElement;
    await userEvent.click(within(listed).getByRole('button', { name: /^delete$/i }));

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put.mock.calls[0]![0]).toBe('/behavior-logs/grp-1');
    expect(put.mock.calls[0]![1]).toMatchObject({
      classNote: 'ມີການສັບປ່ຽນບ່ອນນັ່ງ',
      entries: [{ studentId: 'stu-1', behavior: 'ວົນແຊວ', action: 'ເຕືອນ 2 ຄັ້ງ' }],
    });
  });

  it('deletes the row as a row, by its group', async () => {
    const del = vi.spyOn(apiClient, 'del').mockResolvedValue(undefined as never);
    renderWithProviders(<MonthlySheet />);
    await chooseClassroom();

    const row = (await screen.findByText('ທ້າວ ແດນມີ')).closest('tr') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText(/delete this entry/i)).toBeInTheDocument();
    // The count is the row's, not the record's: the teacher is withdrawing one
    // line of the register, which happens to have two students on it.
    expect(screen.getByText(/2 students/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() => expect(del).toHaveBeenCalledWith('/behavior-logs/grp-1'));
  });
});
