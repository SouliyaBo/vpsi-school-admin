import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { AnnualSheet } from './components/AnnualSheet';
import { ClassMonthSheet } from './components/ClassMonthSheet';
import { MonthGridForm } from './components/MonthGridForm';
import { SemesterSheet } from './components/SemesterSheet';
import { StudentMonthlyMarks } from './components/StudentMonthlyMarks';
import { classMonthFileName } from './lib/class-month-workbook';

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
    // The subject picker reads the class to learn which grade to list subjects
    // for, so the detail endpoint has to answer as well as the list.
    if (url === `/classrooms/${classroom.id}`) return classroom as never;
    if (url === '/monthly-marks/month') return monthGrid() as never;
    if (url === '/monthly-marks/semester') return semesterSheet() as never;
    return paginated([]) as never;
  });
}

/**
 * Picking the class and then the subject is what makes a sheet load.
 *
 * In that order: the subject list is drawn for the grade the class sits, so the
 * subject picker is disabled until there is a class to draw it from.
 */
async function chooseSheet() {
  await userEvent.click(await screen.findByRole('combobox', { name: /^class$/i }));
  await userEvent.click(await screen.findByRole('button', { name: /ມ\.1 ກ/ }));
  await userEvent.click(await screen.findByRole('combobox', { name: /subject/i }));
  await userEvent.click(await screen.findByRole('button', { name: /LAO-M1/ }));
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

/**
 * ສະຫຼຸບປະຈຳເດືອນ — ມ.4, where the school marks eight subjects rather than four.
 *
 * The figures are the API's; what is under test is that the screen shows all
 * eight columns whether or not they are marked, and that a student short of a
 * subject is not called ຕົກ on an average that is low for that reason.
 */
const upperClass = {
  id: 'cls-4',
  name: 'ກ',
  gradeLevelId: { id: 'g4', code: 'ມ.4' },
  gradeLevelCode: 'ມ.4',
  homeroomTeacherName: 'ນູລີ ສີສະຫວາດ',
  schoolYearId: activeYear.id,
  isActive: true,
};

const M4_SUBJECTS = [
  'ພາສາລາວ-ວັນນະຄະດີ',
  'ຄະນິດສາດ',
  'ສຶກສາພົນລະເມືອງ',
  'ຟີຊິກສາດ',
  'ເຄມີສາດ',
  'ຊີວະສາດ',
  'ພູມສາດ',
  'ປະຫວັດສາດ',
].map((nameLo, index) => ({ id: `m4-${index}`, code: `S${index}`, nameLo, nameEn: null }));

describe('monthly marks — the class summary for a month', () => {
  afterEach(() => vi.restoreAllMocks());

  async function chooseClass() {
    await userEvent.click(await screen.findByRole('combobox', { name: /^class$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /ມ\.4 ກ/ }));
  }

  /** ຄະແນນຄຸນສົມບັດ over the year, and ວັນຂາດ over the month, as the export reads them. */
  const conductStanding = [
    { studentId: 'stu-1', deducted: 5, remaining: 95, entries: 1, level: 'none', notify: [] },
  ];
  const monthAbsences = [
    { studentId: 'stu-1', present: 18, absent: 1, late: 0, excused: 1, sick: 1, totalRecorded: 21 },
  ];

  /**
   * The workbook a click on ດາວໂຫຼດ actually produces, read back as bytes.
   *
   * The download is a Blob handed to an anchor, so the only way to see what was
   * built is to intercept both: the object URL for the bytes and the click for
   * the name it would have been filed under.
   */
  async function exportWorkbook(): Promise<{ blob: Blob; bytes: Uint8Array; filenames: string[] }> {
    const created = vi.fn((_blob: Blob) => 'blob:sheet');
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: vi.fn() });
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });

    renderWithProviders(<ClassMonthSheet />);
    await chooseClass();
    await userEvent.click(await screen.findByRole('button', { name: /export excel/i }));
    await waitFor(() => expect(created).toHaveBeenCalled());

    const [blob] = created.mock.calls[0];
    // Read through FileReader because jsdom's Blob has no `arrayBuffer()`.
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    return { blob, bytes, filenames };
  }

  function stubMonth(rows: Record<string, unknown>[]): void {
    stubReads({
      '/classrooms': paginated([upperClass]),
      [`/classrooms/${upperClass.id}`]: upperClass,
      [`/conduct-deductions/summary/classroom/${upperClass.id}/school-year/${activeYear.id}`]:
        conductStanding,
      [`/attendances/summary/classroom/${upperClass.id}/semester/${semester.id}`]: monthAbsences,
      '/monthly-marks/class-month': {
        classroom: upperClass,
        semester,
        month: 9,
        months: [9, 10, 11],
        // ຈັດປະເພດ is banded by the API on the cuts the office keeps in
        // settings; the sheet carries them so a printed copy can say what
        // ເກັ່ງ meant that day.
        bands: { strongFrom: 7, weakBelow: 5 },
        subjects: M4_SUBJECTS,
        rows,
        summary: {
          students: rows.length,
          marked: rows.length,
          passed: 1,
          failed: 0,
          incomplete: rows.length - 1,
          average: 7.5,
        },
      },
    });
  }

  it('columns every subject the grade sits, marked or not', async () => {
    stubMonth([
      {
        studentId: 'stu-1',
        studentCode: '625',
        studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
        studentNickname: 'ໄມ້ຟ້າ',
        rollNumber: 1,
        isEnrolled: true,
        scores: [8, 7, 8, 7, 6.5, 7, 8, 8],
        total: 59.5,
        average: 7.44,
        isComplete: true,
        subjectsRecorded: 8,
        grade: 'B',
        classification: 'strong',
        rank: 1,
        isPassing: true,
      },
    ]);

    renderWithProviders(<ClassMonthSheet />);
    await chooseClass();

    // All eight, including the ones ມ.1 never sees.
    for (const { nameLo } of M4_SUBJECTS) {
      expect(await screen.findByRole('columnheader', { name: nameLo })).toBeInTheDocument();
    }

    const row = (await screen.findByText(/ຈຸທາມາດ/)).closest('tr') as HTMLElement;
    // 59.5 over the eight subjects ມ.4 sits.
    expect(within(row).getByText('59.50')).toBeInTheDocument();
    expect(within(row).getByText('7.44')).toBeInTheDocument();
    // 7.44 out of 10 — the school's B runs 7–8.4.
    expect(within(row).getByText('B')).toBeInTheDocument();
    expect(within(row).getByText(/passed/i)).toBeInTheDocument();
  });

  it('withholds ຜ່ານ/ຕົກ from a student still short of a subject', async () => {
    stubMonth([
      {
        studentId: 'stu-2',
        studentCode: '626',
        studentNameLo: 'ສີວິໄຊ ພົມມະຈັນ',
        studentNickname: null,
        rollNumber: 2,
        isEnrolled: true,
        // Five subjects at 8 is 40/8 = 5 — low because three are missing, not
        // because the student is failing them.
        scores: [8, 8, 8, 8, 8, null, null, null],
        total: 40,
        average: 5,
        isComplete: false,
        subjectsRecorded: 5,
        // Withheld while three subjects are unmarked, like ຜ່ານ/ຕົກ.
        grade: null,
        classification: null,
        rank: 2,
        isPassing: true,
      },
    ]);

    renderWithProviders(<ClassMonthSheet />);
    await chooseClass();

    const row = (await screen.findByText(/ສີວິໄຊ/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('5.00')).toBeInTheDocument();
    expect(within(row).getByText('5/8 marked')).toBeInTheDocument();
    expect(within(row).queryByText(/passed/i)).not.toBeInTheDocument();
    // No letter either: 5.00 is a D only because three subjects are missing.
    expect(within(row).queryByText(/^[A-F]$/)).not.toBeInTheDocument();
  });

  /**
   * The workbook the office files, built from the rows already on screen.
   *
   * Asserted as far as a real .xlsx and the name it is filed under: what is
   * inside it is `exceljs`'s job, and the figures were never this side's to
   * work out. The point of the test is that the button produces a spreadsheet
   * rather than an empty blob, and that it is named after the class and month
   * it holds — a folder of `monthly-summary.xlsx` would be unusable.
   */
  it('downloads the month as a spreadsheet named for the class', async () => {
    stubMonth([
      {
        studentId: 'stu-1',
        studentCode: '625',
        studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
        studentNickname: 'ໄມ້ຟ້າ',
        rollNumber: 1,
        isEnrolled: true,
        scores: [8, 7, 8, 7, 6.5, 7, 8, 4],
        total: 55.5,
        average: 6.94,
        isComplete: true,
        subjectsRecorded: 8,
        grade: 'C',
        classification: 'middling',
        rank: 1,
        isPassing: true,
      },
    ]);

    const { blob, bytes, filenames } = await exportWorkbook();

    // The two borrowed columns are counted over the windows the school reads
    // them over, which is the whole reason they are fetched here rather than
    // taken off a screen: the conduct balance by school year, and ວັນຂາດ by the
    // month the sheet is headed with.
    const reads = vi.mocked(apiClient.get).mock.calls;
    expect(
      reads.some(([url]) =>
        url.endsWith(
          `/conduct-deductions/summary/classroom/${upperClass.id}/school-year/${activeYear.id}`,
        ),
      ),
    ).toBe(true);
    const roll = reads.find(([url]) => url.startsWith('/attendances/summary/classroom'));
    // `cleanParams` renders every query value as a string; the DTO parses it back.
    expect(roll?.[1]).toMatchObject({ params: { month: '9' } });
    // A real workbook, not an empty or half-written blob: every .xlsx is a zip.
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    expect(blob.type).toContain('spreadsheetml');

    // The month in words and in figures, then the class — and the Lao whole,
    // vowel signs and all. The separator is a fullwidth solidus, which is a
    // filename character; a plain slash would not survive the download.
    expect(filenames).toEqual(['Monthly marks September (09)／ມ.4／ກ.xlsx']);
  });

  /**
   * The classes as the database actually holds them, which is not how the fixture
   * above holds them: `gradeLevelCode` is `m1` in Latin letters, and the
   * classroom's own name carries the grade in front of it. Naming the file off
   * those two fields filed ມ.1/ຂ as `…-m1-ມ-1-ຂ` — the grade twice, once in a
   * spelling the office never writes.
   */
  it('names the file off the class as the sheet heads it, not the fields under it', () => {
    const named = (classroom: { name: string; gradeLevelCode: string | null }) =>
      classMonthFileName(
        { classroom, month: 9 } as Parameters<typeof classMonthFileName>[0],
        'ສະຫຼຸບຄະແນນເດືອນກັນຍາ(09)',
      );

    // The grade already in the name, and the code beside it in Latin.
    expect(named({ name: 'ມ.1/ຂ', gradeLevelCode: 'm1' })).toBe(
      'ສະຫຼຸບຄະແນນເດືອນກັນຍາ(09)／ມ.1／ຂ.xlsx',
    );
    // A name that is only the section still gets its grade in front.
    expect(named({ name: 'ກ', gradeLevelCode: 'm4' })).toBe(
      'ສະຫຼຸບຄະແນນເດືອນກັນຍາ(09)／ມ.4／ກ.xlsx',
    );
    // A class with no grade on file is named for itself rather than for a gap.
    expect(named({ name: 'ມ.7/ກ', gradeLevelCode: null })).toBe(
      'ສະຫຼຸບຄະແນນເດືອນກັນຍາ(09)／ມ.7／ກ.xlsx',
    );
  });

  /**
   * The office's own house style, which is the whole reason the file is filed
   * rather than re-typed: the crest at the head, Lao in Phetsarath and figures
   * in Times New Roman, the narrow headings standing on end, and room under
   * the two names to actually sign.
   *
   * Asserted because every one of these is invisible until the workbook is
   * opened — a crest that quietly failed to load or a font that silently
   * reverted would come back as a printed sheet the school will not accept.
   */
  it('files the month in the house style — crest, the two faces, upright headings', async () => {
    stubMonth([
      {
        studentId: 'stu-1',
        studentCode: '625',
        studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
        studentNickname: 'ໄມ້ຟ້າ',
        rollNumber: 1,
        isEnrolled: true,
        scores: [8, 7, 8, 7, 6.5, 7, 8, 4],
        total: 55.5,
        average: 6.94,
        isComplete: true,
        subjectsRecorded: 8,
        grade: 'C',
        classification: 'middling',
        rank: 1,
        isPassing: true,
      },
    ]);

    const { bytes } = await exportWorkbook();
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const worksheet = workbook.worksheets[0];

    // The crest, anchored over the first column beside the heading.
    const [crest] = worksheet.getImages();
    expect(crest).toBeDefined();
    expect(crest.range.tl.nativeCol).toBe(0);
    expect(crest.range.tl.nativeRow).toBe(0);

    // ພາສາລາວ over a column of marks: Phetsarath, bold, and on its side. The
    // name column beside it is wide enough to read across, and stays that way.
    const subjectHeading = worksheet.getCell('E5');
    expect(subjectHeading.value).toBe(M4_SUBJECTS[0].nameLo);
    expect(subjectHeading.font).toMatchObject({ name: 'Phetsarath OT', bold: true });
    expect(subjectHeading.alignment?.textRotation).toBe(90);
    expect(worksheet.getCell('C5').alignment?.textRotation).toBeUndefined();
    // ຖືກຕັດ and ຄອບ stand up too, under headings that span their pairs.
    expect(worksheet.getCell('Q6').alignment?.textRotation).toBe(90);

    // The row itself: names in Phetsarath, every figure in Times New Roman.
    expect(worksheet.getCell('C7').font).toMatchObject({ name: 'Phetsarath OT' });
    expect(worksheet.getCell('E7').font).toMatchObject({ name: 'Times New Roman' });
    expect(worksheet.getCell('A7').font).toMatchObject({ name: 'Times New Roman' });

    // Somewhere to sign: the two names, then clear rows and a line under each.
    const names = worksheet.getRow(
      (worksheet.getRows(1, worksheet.rowCount) ?? []).findIndex(
        (row) => row.getCell(2).value === 'School director',
      ) + 1,
    );
    expect(names.getCell(2).font).toMatchObject({ name: 'Phetsarath OT', bold: true });
    for (let offset = 1; offset <= 3; offset += 1) {
      const room = worksheet.getRow(names.number + offset);
      expect(room.height).toBeGreaterThanOrEqual(20);
      expect(room.getCell(2).value).toBeNull();
    }
    expect(worksheet.getRow(names.number + 4).getCell(2).border?.bottom).toMatchObject({
      style: 'dotted',
    });
  });
});

/**
 * ມ.1 sits four subjects, which is what ສະເລ່ຍ divides by on the student's card
 * exactly as it does on the class summary.
 */
const M1_SUBJECTS = ['ພາສາລາວ', 'ຄະນິດສາດ', 'ທຳມະຊາດ', 'ສັງຄົມ'].map((nameLo, index) => ({
  id: `m1-${index}`,
  code: `S${index}`,
  nameLo,
  nameEn: null,
}));

/** One month of the card: the marks across, then what the school reads out. */
const studentMonth = (month: number, overrides: Record<string, unknown> = {}) => ({
  month,
  scores: [7.9, 8, 7, 8],
  total: 30.9,
  average: 7.73,
  isComplete: true,
  subjectsRecorded: 4,
  grade: 'B',
  rank: 3,
  rankedStudents: 42,
  isPassing: true,
  ...overrides,
});

const studentSubjectRow = (index: number, overrides: Record<string, unknown> = {}) => ({
  subject: M1_SUBJECTS[index],
  monthScores: [7.9, 8.45, 8.3],
  threeMonth: 8.22,
  threeMonthComplete: true,
  examScore: 7.5,
  bonus: null,
  // (8.22 + 7.5) ÷ 2 — the term sheet's own arithmetic, not this side's.
  semesterMark: 7.86,
  isPassing: true,
  ...overrides,
});

describe("monthly marks — one student's card", () => {
  afterEach(() => vi.restoreAllMocks());

  function stubStudent(overrides: Record<string, unknown> = {}): void {
    stubReads({
      '/monthly-marks/student': {
        classroom,
        semester,
        rollNumber: 1,
        isEnrolled: true,
        months: [9, 10, 11],
        subjects: M1_SUBJECTS,
        monthly: [studentMonth(9), studentMonth(10), studentMonth(11)],
        subjectRows: M1_SUBJECTS.map((_, index) => studentSubjectRow(index)),
        summary: { subjects: 4, monthsRecorded: 3, termAverage: 7.86, termComplete: true },
        ...overrides,
      },
    });
  }

  it('columns the term by month, and foots each one with ສະເລ່ຍ, ເກຣດ and ລຳດັບ', async () => {
    stubStudent();
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);

    // The months the term collects, not the calendar's twelve.
    for (const month of [/September/i, /October/i, /November/i]) {
      expect(await screen.findByRole('columnheader', { name: month })).toBeInTheDocument();
    }

    const row = (await screen.findByText('ຄະນິດສາດ')).closest('tr') as HTMLElement;
    expect(within(row).getAllByText('7.90').length).toBeGreaterThan(0);
    // The term columns come along, so the card ends where the term sheet does.
    expect(within(row).getByText('8.22')).toBeInTheDocument();
    expect(within(row).getByText('7.86')).toBeInTheDocument();

    // ລຳດັບ carries what it is out of: third of forty-two is not third of three.
    const rank = (await screen.findByText('Rank')).closest('tr') as HTMLElement;
    expect(within(rank).getAllByText('3/42')).toHaveLength(3);
  });

  /**
   * A month short of a subject reads low for a reason that is not the student's
   * marks, so the card says which month and withholds the letter — the same rule
   * the class summary applies, and the one a parent most needs stated.
   */
  it('names the unfinished month rather than banding it', async () => {
    stubStudent({
      monthly: [
        studentMonth(9),
        studentMonth(10),
        studentMonth(11, {
          scores: [7.9, 8, null, null],
          total: 15.9,
          average: 3.98,
          isComplete: false,
          subjectsRecorded: 2,
          grade: null,
          rank: null,
          rankedStudents: 40,
          isPassing: false,
        }),
      ],
    });
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);

    expect(
      await screen.findByText(/November is still short of the 4 subjects/),
    ).toBeInTheDocument();
    const grades = (await screen.findByText('Grade')).closest('tr') as HTMLElement;
    // Two months banded, the third left blank.
    expect(within(grades).getAllByText('B')).toHaveLength(2);
    expect(within(grades).getAllByText('—')).toHaveLength(1);
  });

  it('says so rather than erroring when the register has not placed the student', async () => {
    stubStudent({ classroom: null, subjects: [], monthly: [], subjectRows: [] });
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);

    expect(await screen.findByText(/has not been placed in a class/i)).toBeInTheDocument();
  });
});
