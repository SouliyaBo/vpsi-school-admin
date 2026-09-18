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
  async function exportWorkbook(
    button: RegExp = /export excel/i,
    beforeDownload?: () => Promise<void>,
  ): Promise<{ blob: Blob; bytes: Uint8Array; filenames: string[] }> {
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
    await userEvent.click(await screen.findByRole('button', { name: button }));
    await beforeDownload?.();
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

  /**
   * ໃບລາຍງານຜູ້ປົກຄອງ — the office's letter home, one file per child.
   *
   * Checked against the school's own Excel form: the title, the name line, the
   * subjects standing on end, ກວດກາ above ລວມ with a letter under each, the
   * month's figures merged down the right, a ruled row for the teacher's
   * remark and the A–F scale as a note. Every figure and letter on it is the
   * API's, so what the test guards is that each lands in the right cell — and
   * that nobody else's marks are in the file, since it is sent to one family.
   */
  it("writes one student's letter home, and only theirs", async () => {
    const student = (overrides: Record<string, unknown>) => ({
      studentNickname: null,
      isEnrolled: true,
      // ກວດກາ out of 6 for five subjects; the last three not yet marked.
      testScores: [2.3, 2.8, 2.32, 2.8, 2.8, null, null, null],
      scores: [6.3, 6.8, 6.32, 6.8, 4.8, null, null, null],
      subjectGrades: ['C', 'C', 'C', 'C', 'D', null, null, null],
      total: 31.02,
      average: 3.88,
      isComplete: false,
      subjectsRecorded: 5,
      grade: null,
      classification: null,
      rank: 1,
      isPassing: false,
      ...overrides,
    });
    stubMonth([
      student({
        studentId: 'stu-1',
        studentCode: '625',
        studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
        rollNumber: 1,
      }),
      // A child who has left is on the summary, but gets no letter.
      student({
        studentId: 'stu-2',
        studentCode: '626',
        studentNameLo: 'ອອກແລ້ວ',
        rollNumber: 2,
        isEnrolled: false,
      }),
      student({
        studentId: 'stu-3',
        studentCode: '627',
        studentNameLo: 'ສີວິໄຊ ພົມມະຈັນ',
        rollNumber: 3,
        testScores: [5, 5, 5, 5, 5, 5, 5, 5],
        scores: [9, 8.5, 9, 8.5, 9, 8.5, 9, 8.5],
        subjectGrades: ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'],
        total: 70,
        average: 8.75,
        isComplete: true,
        subjectsRecorded: 8,
        grade: 'A',
        classification: 'strong',
        isPassing: true,
      }),
    ]);

    // The click opens the remark form first — the one thing on the letter the
    // system does not hold — and the file is built when it is confirmed.
    const { bytes, filenames } = await exportWorkbook(/parent report — ຈຸທາມາດ/i, async () => {
      const form = await screen.findByRole('dialog');
      await userEvent.type(
        within(form).getByLabelText(new RegExp(M4_SUBJECTS[0].nameLo)),
        'ອ່ານໄດ້ດີຂຶ້ນ',
      );
      await userEvent.type(
        within(form).getByLabelText(/overall remark/i),
        'ຕັ້ງໃຈຮຽນດີ ຄວນທົບທວນເຄມີເພີ່ມ',
      );
      await userEvent.click(within(form).getByRole('button', { name: /download report/i }));
    });
    expect(filenames).toEqual(['Parent report September (09)／ມ.4／ກ／ຈຸທາມາດ ສີທາປັນຍາ.xlsx']);
    // A child who has left the class has no letter to send.
    expect(screen.getByRole('button', { name: /parent report — ອອກແລ້ວ/i })).toBeDisabled();

    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const worksheet = workbook.worksheets[0];

    // The head: the title across the page, then the name line.
    expect(worksheet.getCell('A1').value).toBe(
      `Monthly results — September (09), school year ${activeYear.code}`,
    );
    expect(worksheet.getCell('A1').font).toMatchObject({ name: 'Phetsarath OT', bold: true });
    expect(worksheet.getCell('A2').value).toBe('Student: ຈຸທາມາດ ສີທາປັນຍາ');
    expect(worksheet.getCell('J2').value).toBe('Class: ມ.4/ກ   No. 1');

    // Eight subjects standing on end, then the four standing columns.
    expect(worksheet.getCell('B3').value).toBe(M4_SUBJECTS[0].nameLo);
    expect(worksheet.getCell('B3').alignment?.textRotation).toBe(90);
    expect(worksheet.getCell('I3').value).toBe(M4_SUBJECTS[7].nameLo);
    expect(worksheet.getCell('J3').value).toBe('Total');
    expect(worksheet.getCell('K3').value).toBe('Subjects');
    expect(worksheet.getCell('L3').value).toBe('Average');
    expect(worksheet.getCell('M3').value).toBe('Overall grade');

    // ກວດກາ above ລວມ, the letter under each, and an unmarked subject left blank.
    expect(worksheet.getCell('A4').value).toBe('Test mark (out of 6)');
    expect(worksheet.getCell('B4').value).toBe(2.3);
    expect(worksheet.getCell('B4').font).toMatchObject({ name: 'Times New Roman' });
    expect(worksheet.getCell('A5').value).toBe('Month total (out of 10)');
    expect(worksheet.getCell('B5').value).toBe(6.3);
    expect(worksheet.getCell('A6').value).toBe('Grade per subject');
    expect(worksheet.getCell('B6').value).toBe('C');
    expect(worksheet.getCell('F6').value).toBe('D');
    expect(worksheet.getCell('G4').value).toBeNull();
    expect(worksheet.getCell('G6').value).toBe('');
    // A ລວມ under the pass line prints red, and so does its letter.
    expect(worksheet.getCell('F5').font).toMatchObject({ color: { argb: 'FF9C0006' } });
    expect(worksheet.getCell('F6').font).toMatchObject({ color: { argb: 'FF9C0006' } });

    // The month's figures, merged down the three rows: ລວມ, then how far short
    // of a full month the child is instead of a count, ສະເລ່ຍ, and no letter yet.
    expect(worksheet.getCell('J4').value).toBe(31.02);
    expect(worksheet.getCell('J4').isMerged).toBe(true);
    expect(worksheet.getCell('K4').value).toBe('5/8 marked');
    expect(worksheet.getCell('L4').value).toBe(3.88);
    expect(worksheet.getCell('M4').value).toBe('');

    // The remark row, tall and ruled: what was typed sits under its subject,
    // the month's remark in the wide cell on the right, the rest left blank.
    expect(worksheet.getCell('A7').value).toBe("Homeroom teacher's remarks per subject");
    expect(worksheet.getRow(7).height).toBeGreaterThanOrEqual(90);
    expect(worksheet.getCell('B7').value).toBe('ອ່ານໄດ້ດີຂຶ້ນ');
    expect(worksheet.getCell('B7').font).toMatchObject({ name: 'Phetsarath OT' });
    expect(worksheet.getCell('C7').value).toBeNull();
    expect(worksheet.getCell('C7').border?.bottom).toMatchObject({ style: 'thin' });
    expect(worksheet.getCell('J7').value).toBe('ຕັ້ງໃຈຮຽນດີ ຄວນທົບທວນເຄມີເພີ່ມ');
    expect(worksheet.getCell('J7').isMerged).toBe(true);
    expect(worksheet.getCell('A9').value).toBe('Note:');
    expect(worksheet.getCell('A10').value).toBe('A = 8.5 - 10');
    expect(worksheet.getCell('A15').value).toBe('F = 0 - 3.4');

    // Nothing to sign: the letter is sent, not handed over.
    const words = JSON.stringify(worksheet.getSheetValues());
    expect(words).not.toContain('Parent / guardian');
    expect(words).not.toContain('Homeroom teacher"');

    // Nobody else's month is in the file: one letter, one page, no break.
    const titles = (worksheet.getRows(1, worksheet.rowCount) ?? []).filter(
      (row) => row.getCell(1).value === worksheet.getCell('A1').value,
    );
    expect(titles).toHaveLength(1);
    expect(words).not.toContain('ສີວິໄຊ');
    const { default: JSZip } = await import('jszip');
    const archive = await JSZip.loadAsync(bytes);
    const sheetXml = await archive.file('xl/worksheets/sheet1.xml')?.async('string');
    expect(sheetXml).not.toContain('<brk ');
  });

  /**
   * The whole class at month's end: a chosen set of letters, zipped one file
   * each — never one workbook, since each goes to a different family. The zip
   * has to hold exactly the students ticked, named as the row button would
   * name them, with the remark typed against a name inside that name's file.
   */
  it('zips a chosen set of letters, one file each, with their remarks', async () => {
    const student = (overrides: Record<string, unknown>) => ({
      studentNickname: null,
      isEnrolled: true,
      testScores: [5, 5, 5, 5, 5, 5, 5, 5],
      scores: [9, 8.5, 9, 8.5, 9, 8.5, 9, 8.5],
      subjectGrades: ['A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'],
      total: 70,
      average: 8.75,
      isComplete: true,
      subjectsRecorded: 8,
      grade: 'A',
      classification: 'strong',
      rank: 1,
      isPassing: true,
      ...overrides,
    });
    stubMonth([
      student({
        studentId: 'stu-1',
        studentCode: '625',
        studentNameLo: 'ຈຸທາມາດ ສີທາປັນຍາ',
        rollNumber: 1,
      }),
      student({
        studentId: 'stu-2',
        studentCode: '626',
        studentNameLo: 'ສີວິໄຊ ພົມມະຈັນ',
        rollNumber: 2,
      }),
      student({
        studentId: 'stu-3',
        studentCode: '627',
        studentNameLo: 'ເກວະລິນ ອຸ່ນມີໄຊ',
        rollNumber: 3,
      }),
      // Off the roll: not offered at all.
      student({
        studentId: 'stu-4',
        studentCode: '628',
        studentNameLo: 'ອອກແລ້ວ',
        rollNumber: 4,
        isEnrolled: false,
      }),
    ]);

    const { blob, bytes, filenames } = await exportWorkbook(
      /parent reports \(several\)/i,
      async () => {
        const form = await screen.findByRole('dialog');
        // Everyone who can have a letter starts ticked; the leaver is not listed.
        expect(within(form).queryByText('ອອກແລ້ວ')).not.toBeInTheDocument();
        expect(within(form).getByText('3/3 chosen')).toBeInTheDocument();
        // Untick one, write against another, and download the rest.
        await userEvent.click(within(form).getByRole('checkbox', { name: /ສີວິໄຊ ພົມມະຈັນ/ }));
        expect(within(form).getByText('2/3 chosen')).toBeInTheDocument();
        await userEvent.click(within(form).getByRole('button', { name: /remarks — ເກວະລິນ/i }));
        await userEvent.type(within(form).getByLabelText(/overall remark/i), 'ດີຫຼາຍ');
        await userEvent.click(within(form).getByRole('button', { name: /download 2 reports/i }));
      },
    );

    expect(filenames).toEqual(['Parent report September (09)／ມ.4／ກ.zip']);
    expect(blob.type).toBe('application/zip');

    const { default: JSZip } = await import('jszip');
    const archive = await JSZip.loadAsync(bytes);
    expect(Object.keys(archive.files).sort()).toEqual(
      [
        'Parent report September (09)／ມ.4／ກ／ຈຸທາມາດ ສີທາປັນຍາ.xlsx',
        'Parent report September (09)／ມ.4／ກ／ເກວະລິນ ອຸ່ນມີໄຊ.xlsx',
      ].sort(),
    );

    const { default: ExcelJS } = await import('exceljs');
    const letter = new ExcelJS.Workbook();
    await letter.xlsx.load(
      (await archive
        .file('Parent report September (09)／ມ.4／ກ／ເກວະລິນ ອຸ່ນມີໄຊ.xlsx')
        ?.async('arraybuffer')) as ArrayBuffer,
    );
    const worksheet = letter.worksheets[0];
    expect(worksheet.getCell('A2').value).toBe('Student: ເກວະລິນ ອຸ່ນມີໄຊ');
    expect(worksheet.getCell('J7').value).toBe('ດີຫຼາຍ');
    expect(JSON.stringify(worksheet.getSheetValues())).not.toContain('ຈຸທາມາດ');
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
  testScores: [4.9, 5, 4, 5],
  subjectGrades: ['B', 'B', 'B', 'B'],
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
  semesterGrade: 'B',
  isPassing: true,
  ...overrides,
});

describe("monthly marks — one student's card", () => {
  afterEach(() => vi.restoreAllMocks());

  /** ຄະແນນກົດລະບຽບ for the year — the ledger the block borrows two figures from. */
  const ledger = {
    studentId: 'stu-1',
    schoolYearId: activeYear.id,
    baseScore: 100,
    deducted: 5,
    remaining: 95,
    grade: 'excellent',
    level: 'none',
    notify: [],
    entries: [],
  };

  /** The roll for the window on screen: 17 present and 1 late of 20 days, 1 ຄອບ, 1 ບໍ່ຄອບ. */
  const roll = {
    studentId: 'stu-1',
    present: 17,
    late: 1,
    absent: 1,
    excused: 1,
    sick: 0,
    totalRecorded: 20,
    attendanceRate: 95,
  };

  function stubStudent(overrides: Record<string, unknown> = {}): void {
    stubReads({
      [`/conduct-deductions/student/stu-1/school-year/${activeYear.id}`]: ledger,
      [`/attendances/summary/student/stu-1/semester/${semester.id}`]: roll,
      '/monthly-marks/student': {
        classroom,
        semester,
        rollNumber: 1,
        isEnrolled: true,
        months: [9, 10, 11],
        subjects: M1_SUBJECTS,
        monthly: [studentMonth(9), studentMonth(10), studentMonth(11)],
        subjectRows: M1_SUBJECTS.map((_, index) => studentSubjectRow(index)),
        summary: {
          subjects: 4,
          monthsRecorded: 3,
          termTotal: 31.44,
          termSubjectsRecorded: 4,
          termAverage: 7.86,
          termComplete: true,
          termGrade: 'B',
        },
        ...overrides,
      },
    });
  }

  /**
   * The block is the parent report's: it opens on the latest month with marks,
   * heads itself the way the letter does, and stands the month's figures down
   * the right — the same four the workbook merges beside the mark rows.
   */
  it('opens on the latest marked month, laid out as the letter home', async () => {
    stubStudent({
      monthly: [
        studentMonth(9),
        studentMonth(10),
        studentMonth(11, {
          scores: [null, null, null, null],
          testScores: [null, null, null, null],
          subjectGrades: [null, null, null, null],
          total: null,
          average: null,
          isComplete: false,
          subjectsRecorded: 0,
          grade: null,
          rank: null,
          rankedStudents: 0,
          isPassing: null,
        }),
      ],
    });
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" studentName="ສີວິໄຊ" />);

    // ພະຈິກ has nothing yet, so ຕຸລາ is the month a parent is asking about.
    expect(
      await screen.findByRole('heading', { name: /October \(10\), school year 2025-2026/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('ສີວິໄຊ')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'October' })).toHaveAttribute('data-state', 'active');

    // Subjects across, not down.
    for (const name of ['ພາສາລາວ', 'ຄະນິດສາດ', 'ທຳມະຊາດ', 'ສັງຄົມ']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
    const test = screen.getByRole('row', { name: /Test mark/ });
    expect(within(test).getByText('4.90')).toBeInTheDocument();
    const total = screen.getByRole('row', { name: /Month total/ });
    expect(within(total).getByText('7.90')).toBeInTheDocument();
    // ລວມ · ຈຳນວນວິຊາ · ສະເລ່ຍ · ເກຣດ stand beside the first row. No ລຳດັບ:
    // the office asked for it to go (16 Sep 2026) — it is not read out here.
    expect(within(test).getByText('30.90')).toBeInTheDocument();
    expect(within(test).getByText('4')).toBeInTheDocument();
    expect(within(test).getByText('7.73')).toBeInTheDocument();
    expect(screen.queryByText('3/42')).not.toBeInTheDocument();
    // ຄະແນນກົດລະບຽບ beside them, as the class export prints it — the year's
    // figures, headed as one group over ຖືກຕັດ / ຍັງເຫຼືອ.
    expect(screen.getByRole('columnheader', { name: 'Conduct points' })).toBeInTheDocument();
    expect(within(test).getByText('5')).toBeInTheDocument();
    expect(within(test).getByText('95')).toBeInTheDocument();
    // ວັນມາຮຽນ for the month on screen: late counts as in the room, ຄອບ folds
    // in sick days, ບໍ່ຄອບ stands alone.
    expect(screen.getByRole('columnheader', { name: 'Attendance' })).toBeInTheDocument();
    expect(within(test).getByText('18/20')).toBeInTheDocument();
    const [, month] = vi.mocked(apiClient.get).mock.calls.find(
      ([url]) => url === `/attendances/summary/student/stu-1/semester/${semester.id}`,
    ) as [string, { params: { month: string } }];
    expect(month.params).toEqual({ month: '10' });
  });

  it('turns the same block to the whole term when asked', async () => {
    stubStudent();
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: 'Whole term' }));

    expect(
      screen.getByRole('heading', { name: /Semester 1 results, school year 2025-2026/ }),
    ).toBeInTheDocument();
    const september = screen.getByRole('row', { name: /September/ });
    expect(within(september).getAllByText('7.90')).toHaveLength(4);
    const threeMonth = screen.getByRole('row', { name: /3-month average/ });
    expect(within(threeMonth).getAllByText('8.22')).toHaveLength(4);
    const term = screen.getByRole('row', { name: /^Term mark/ });
    expect(within(term).getAllByText('7.86')).toHaveLength(4);
    // The term's own standing figures.
    expect(within(september).getByText('31.44')).toBeInTheDocument();
  });

  /**
   * A month short of a subject reads low for a reason that is not the student's
   * marks, so the card says so and withholds the letter — the same rule the
   * class summary applies, and the one a parent most needs stated.
   */
  it('names the unfinished month rather than banding it', async () => {
    stubStudent({
      monthly: [
        studentMonth(9),
        studentMonth(10),
        studentMonth(11, {
          scores: [7.9, 8, null, null],
          testScores: [4.9, 5, null, null],
          subjectGrades: ['B', 'B', null, null],
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

    // The latest month with anything in it is the unfinished one.
    expect(
      await screen.findByText(/November is still short of the 4 subjects/),
    ).toBeInTheDocument();
    const test = screen.getByRole('row', { name: /Test mark/ });
    expect(within(test).getByText('2/4 marked')).toBeInTheDocument();
    // ເກຣດ withheld: the standing cell is a dash, not an F for 3.98.
    expect(within(test).queryByText('F')).not.toBeInTheDocument();
  });

  it('says so rather than erroring when the register has not placed the student', async () => {
    stubStudent({ classroom: null, subjects: [], monthly: [], subjectRows: [] });
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);

    expect(await screen.findByText(/has not been placed in a class/i)).toBeInTheDocument();
  });

  /**
   * A phone does not get the letter's table — eight subjects across only fit
   * by scrolling, and a figure scrolled away from its heading is unreadable.
   * It gets the month's figures first and one line a subject, the mark and its
   * letter on the right; the same numbers, once each.
   */
  it('lists the subjects one to a line on a phone, with the month figures above', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('max-width'),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    stubStudent();
    renderWithProviders(<StudentMonthlyMarks studentId="stu-1" />);

    expect(await screen.findByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(4);
    const maths = items.find((item) => within(item).queryByText('ຄະນິດສາດ')) as HTMLElement;
    expect(within(maths).getByText('8.00')).toBeInTheDocument();
    expect(within(maths).getByText('B')).toBeInTheDocument();
    // ກວດກາ sits under the subject, out of its own maximum.
    expect(within(maths).getByText('5.00')).toBeInTheDocument();
    expect(within(maths).getByText('/6')).toBeInTheDocument();
    // The month's own figures — ສະເລ່ຍ, ລວມ — read once, above the list.
    expect(screen.getByText('7.73')).toBeInTheDocument();
    expect(screen.getByText('30.90')).toBeInTheDocument();
    expect(screen.getByText('95/100')).toBeInTheDocument();
    expect(screen.getByText('18/20')).toBeInTheDocument();
  });
});
