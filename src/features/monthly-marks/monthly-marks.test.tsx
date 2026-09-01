import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { AnnualSheet } from './components/AnnualSheet';
import { MonthGridForm } from './components/MonthGridForm';
import { SemesterSheet } from './components/SemesterSheet';

/**
 * ຄະແນນປະຈຳເດືອນ — the school's own sheet, out of 10.
 *
 * The figures under test are the ones the screen is responsible for: the running
 * ລວມ while a teacher types, and which marks it sends. Everything above ລວມ —
 * 3 ເດືອນ, ພາກຮຽນ, ໝົດປີ — is the API's, and the fixtures below carry the numbers
 * straight off the school's spreadsheet so a change of mind on this side shows up
 * as a mismatch with the paper rather than as a passing test.
 */

const activeYear = { id: 'sy-1', code: '2025-2026', nameLo: 'ປີ 2025-2026', isActive: true };
const semester = { id: 'sem-1', number: 1, nameLo: 'ພາກຮຽນ I', nameEn: 'Semester 1' };
const subject = { id: 'sub-1', code: 'LAO-M1', nameLo: 'ພາສາລາວ', nameEn: 'Lao', strands: [] };
const classroom = {
  id: 'cls-1',
  name: 'ກ',
  gradeLevelId: { id: 'g1', code: 'ມ.1' },
  gradeLevelCode: 'ມ.1',
  homeroomTeacherName: 'ນູລີ ສີສະຫວາດ',
  schoolYearId: activeYear.id,
  isActive: true,
};

const COLUMN_MAX = { attendance: 1, notebook: 1, activity: 2, test: 6 };

/** ເກວະລິນ and ສີວິໄຊ, as they appear on the ມ.1/ກ sheet. */
const gridRow = (overrides: Record<string, unknown> = {}) => ({
  studentId: 'stu-1',
  studentCode: '762',
  studentNameLo: 'ເກວະລິນ ອຸ່ນມີໄຊ',
  studentNickname: 'ເກວະລິນ',
  rollNumber: 1,
  isEnrolled: true,
  strands: [
    {
      strand: null,
      cells: { attendance: 1, notebook: 1, activity: 2, test: 3.9 },
      total: 7.9,
      isLocked: false,
    },
  ],
  ...overrides,
});

/** A row nobody has marked yet — most of the class, on the day the sheet opens. */
const blankRow = (cells: Record<string, number | null> = {}) =>
  gridRow({
    strands: [
      {
        strand: null,
        cells: { attendance: null, notebook: null, activity: null, test: null, ...cells },
        total: null,
        isLocked: false,
      },
    ],
  });

const monthGrid = (overrides: Record<string, unknown> = {}) => ({
  subject,
  classroom,
  semester,
  months: [9, 10, 11],
  month: 9,
  columnMax: COLUMN_MAX,
  canEdit: true,
  rows: [gridRow()],
  ...overrides,
});

const sheetRow = (overrides: Record<string, unknown> = {}) => ({
  studentId: 'stu-1',
  studentCode: '762',
  studentNameLo: 'ເກວະລິນ ອຸ່ນມີໄຊ',
  studentNickname: 'ເກວະລິນ',
  rollNumber: 1,
  isEnrolled: true,
  months: [
    { month: 9, strands: [], score: 7.9, isComplete: true },
    { month: 10, strands: [], score: 8.45, isComplete: true },
    { month: 11, strands: [], score: 8.3, isComplete: true },
  ],
  threeMonth: 8.22,
  threeMonthComplete: true,
  examScore: 8.4,
  bonus: null,
  semesterMark: 8.31,
  isPassing: true,
  ...overrides,
});

const semesterSheet = (rows: Record<string, unknown>[] = [sheetRow()]) => ({
  subject,
  classroom,
  semester,
  months: [9, 10, 11],
  columnMax: COLUMN_MAX,
  canEdit: true,
  rows,
  summary: {
    students: rows.length,
    marked: rows.length,
    passed: 1,
    failed: 0,
    incomplete: 0,
    average: 8.31,
  },
});

/** The same sheet as the office sees it: every figure rendered, none editable. */
const canOnlyRead = <T,>(sheet: T): T => ({ ...sheet, canEdit: false });

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'teacher', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/subjects') return paginated([subject]) as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === '/monthly-marks/month') return monthGrid() as never;
    if (url === '/monthly-marks/semester') return semesterSheet() as never;
    return paginated([]) as never;
  });
}

/** Picking the subject and the class is what makes a sheet load. */
async function chooseSheet() {
  await userEvent.click(await screen.findByRole('combobox', { name: /subject/i }));
  await userEvent.click(await screen.findByRole('button', { name: /LAO-M1/ }));
  await userEvent.click(await screen.findByRole('combobox', { name: /^class$/i }));
  await userEvent.click(await screen.findByRole('button', { name: /ມ\.1 ກ/ }));
}

/** The form opens on a month of the term; tests that assert one pick it. */
async function chooseMonth(name: RegExp) {
  await userEvent.click(screen.getByRole('combobox', { name: /^month$/i }));
  await userEvent.click(await screen.findByRole('option', { name }));
}

describe('monthly marks — the entry form', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('totals the four columns as they are typed, before any round trip', async () => {
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    // The sheet's own numbers: 1 + 1 + 2 + 3.9.
    expect(within(row).getByText('7.9')).toBeInTheDocument();

    const test = within(row).getByLabelText(/Test$/);
    await userEvent.clear(test);
    await userEvent.type(test, '4.45');

    // ລວມ answers under the fingers of whoever is typing — 8.45, not 8.
    expect(await within(row).findByText('8.45')).toBeInTheDocument();
  });

  it('opens on a month the term actually collects', async () => {
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();
    await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/);

    // The school breaks for exams in ທັນວາ and ມັງກອນ, so the form cannot simply
    // open on today's month — whatever the clock says, it lands on one of the
    // three months this term is marked in.
    const month = screen.getByRole('combobox', { name: /^month$/i });
    expect(month.textContent).toMatch(/September|October|November/);
  });

  it('sends only the rows that changed, with every column of them', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ saved: 1, skipped: 0, errors: [] });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();
    await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/);
    await chooseMonth(/September/);

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    const notebook = within(row).getByLabelText(/Notebook$/);
    await userEvent.clear(notebook);
    await userEvent.type(notebook, '0.5');

    await userEvent.click(screen.getByRole('button', { name: /save 1 change/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![0]).toBe('/monthly-marks/month');
    expect(post.mock.calls[0]![1]).toMatchObject({
      subjectId: subject.id,
      classroomId: classroom.id,
      semesterId: semester.id,
      month: 9,
      // The whole row goes, not just the cell that moved: a column sent as null
      // is what clears a mark back to unwritten.
      entries: [{ studentId: 'stu-1', attendance: 1, notebook: 0.5, activity: 2, test: 3.9 }],
    });
    console.log('PAYLOAD', JSON.stringify(post.mock.calls[0]![1]));
  });

  it('will not save when nothing has been touched', async () => {
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();
    await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/);

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('opens an unmarked row on full marks, so only the losses get typed', async () => {
    stubReads({ '/monthly-marks/month': monthGrid({ rows: [blankRow()] }) });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    // Full marks of each column, not four blanks: 1 · 1 · 2 · 6.
    expect(within(row).getByLabelText(/Attendance$/)).toHaveValue(1);
    expect(within(row).getByLabelText(/Notebook$/)).toHaveValue(1);
    expect(within(row).getByLabelText(/Activity$/)).toHaveValue(2);
    expect(within(row).getByLabelText(/Test$/)).toHaveValue(6);
    expect(within(row).getByText('10')).toBeInTheDocument();

    // And it says so, because nothing of this is on the server yet.
    expect(screen.getByText(/start on full marks/i)).toBeInTheDocument();
  });

  it('sends the full marks it filled in, alongside the corrections', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ saved: 1, skipped: 0, errors: [] });
    stubReads({ '/monthly-marks/month': monthGrid({ rows: [blankRow()] }) });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    const test = within(row).getByLabelText(/Test$/);
    await userEvent.clear(test);
    await userEvent.type(test, '4.5');

    await userEvent.click(screen.getByRole('button', { name: /save 1 change/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0]![1]).toMatchObject({
      entries: [{ studentId: 'stu-1', attendance: 1, notebook: 1, activity: 2, test: 4.5 }],
    });
  });

  it('puts the sheet back to what is saved when the prefill is not wanted', async () => {
    stubReads({ '/monthly-marks/month': monthGrid({ rows: [blankRow()] }) });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    await userEvent.click(screen.getByRole('button', { name: /clear unsaved/i }));

    expect(within(row).getByLabelText(/Test$/)).toHaveValue(null);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('leaves a half-marked row alone until the teacher asks for the blanks', async () => {
    stubReads({ '/monthly-marks/month': monthGrid({ rows: [blankRow({ attendance: 0 })] }) });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    // Someone was in the middle of this row — a stand-in here would read as a
    // mark they had already given, and ຂື້ນຫ້ອງ 0 was deliberate.
    expect(within(row).getByLabelText(/Test$/)).toHaveValue(null);

    await userEvent.click(screen.getByRole('button', { name: /fill full marks/i }));

    expect(within(row).getByLabelText(/Attendance$/)).toHaveValue(0);
    expect(within(row).getByLabelText(/Test$/)).toHaveValue(6);
  });

  it('fills in nothing on a sheet that cannot be written to', async () => {
    stubReads({
      '/monthly-marks/month': monthGrid({ canEdit: false, rows: [blankRow()] }),
    });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    expect(within(row).getByLabelText(/Test$/)).toHaveValue(null);
    expect(screen.queryByText(/start on full marks/i)).not.toBeInTheDocument();
  });

  it('holds a teacher to their own classes, and says why', async () => {
    stubReads({ '/monthly-marks/month': monthGrid({ canEdit: false }) });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    expect(within(row).getByLabelText(/Test$/)).toBeDisabled();
    expect(screen.getByText(/do not teach this subject/i)).toBeInTheDocument();
  });

  it('locks a submitted month rather than letting it drift', async () => {
    stubReads({
      '/monthly-marks/month': monthGrid({
        rows: [
          gridRow({
            strands: [
              {
                strand: null,
                cells: { attendance: 1, notebook: 1, activity: 2, test: 3.9 },
                total: 7.9,
                isLocked: true,
              },
            ],
          }),
        ],
      }),
    });
    renderWithProviders(<MonthGridForm />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    expect(within(row).getByLabelText(/Test$/)).toBeDisabled();
    expect(screen.getByText(/submitted/i)).toBeInTheDocument();
  });
});

describe('monthly marks — the term sheet', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('shows the term as the paper reads it, without recomputing anything', async () => {
    renderWithProviders(<SemesterSheet />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    // Months un-rounded, then the API's three-month average and term mark.
    expect(within(row).getByText('8.45')).toBeInTheDocument();
    expect(within(row).getByText('8.22')).toBeInTheDocument();
    expect(within(row).getByText('8.31')).toBeInTheDocument();
  });

  it('calls out a mark below the pass line', async () => {
    stubReads({
      // Read-only, as a registrar sees it: the exam column is a figure rather
      // than an input, which is what a mark below 5 is called out in.
      '/monthly-marks/semester': canOnlyRead(
        semesterSheet([
          sheetRow({
            studentId: 'stu-3',
            studentNameLo: 'ສີວິໄຊ ພັນຍຸລາດ',
            threeMonth: 5.98,
            examScore: 4.1,
            semesterMark: 5.04,
            isPassing: true,
          }),
        ]),
      ),
    });
    renderWithProviders(<SemesterSheet />);
    await chooseSheet();

    const row = (await screen.findByText(/ສີວິໄຊ/)).closest('tr') as HTMLElement;
    // 4.10 is under 5 and is shown as such; the term mark it feeds is not.
    expect(within(row).getByText('4.10')).toHaveClass('text-danger');
    expect(within(row).getByText('5.04')).not.toHaveClass('text-danger');
  });

  it('keeps a student who has left on the sheet', async () => {
    stubReads({
      '/monthly-marks/semester': semesterSheet([
        sheetRow({
          studentId: 'stu-4',
          studentNameLo: 'ສັນຍາຮັກ ວົງສາ',
          isEnrolled: false,
          examScore: 0,
          semesterMark: 3.84,
          isPassing: false,
        }),
      ]),
    });
    renderWithProviders(<SemesterSheet />);
    await chooseSheet();

    // The school records their remaining months as zero rather than dropping
    // them, and the screen has to reconcile with the paper.
    const row = (await screen.findByText(/ສັນຍາຮັກ/)).closest('tr') as HTMLElement;
    expect(row.className).toContain('opacity-60');
    expect(within(row).getByText('3.84')).toBeInTheDocument();
  });

  it('takes the exam mark here, where the office enters it', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ saved: 1, skipped: 0, errors: [] });
    renderWithProviders(<SemesterSheet />);
    await chooseSheet();

    const row = (await screen.findByText(/ເກວະລິນ ອຸ່ນມີໄຊ/)).closest('tr') as HTMLElement;
    const exam = within(row).getByLabelText(/Exam$/);
    await userEvent.clear(exam);
    await userEvent.type(exam, '9');

    await userEvent.click(screen.getByRole('button', { name: /save 1 change/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/monthly-marks/term', {
        subjectId: subject.id,
        classroomId: classroom.id,
        semesterId: semester.id,
        entries: [{ studentId: 'stu-1', examScore: 9, bonus: null }],
      }),
    );
  });
});

describe('monthly marks — the year', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows both terms, their mean, and the outcome', async () => {
    stubReads({
      '/monthly-marks/annual': {
        subject,
        classroom,
        semesters: [
          semester,
          { id: 'sem-2', number: 2, nameLo: 'ພາກຮຽນ II', nameEn: 'Semester 2' },
        ],
        rows: [
          {
            studentId: 'stu-1',
            studentCode: '625',
            studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
            studentNickname: 'ໄມ້ຟ້າ',
            rollNumber: 1,
            isEnrolled: true,
            semesterMarks: [8.62, 8.38],
            annual: 8.5,
            isPassing: true,
          },
        ],
      },
    });

    renderWithProviders(<AnnualSheet />);
    await chooseSheet();

    const row = (await screen.findByText(/ຈຸທາມາດ/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('8.62')).toBeInTheDocument();
    expect(within(row).getByText('8.38')).toBeInTheDocument();
    // (8.62 + 8.38) / 2 — the figure the school hands on.
    expect(within(row).getByText('8.50')).toBeInTheDocument();
    expect(within(row).getByText(/passed/i)).toBeInTheDocument();
  });
});
