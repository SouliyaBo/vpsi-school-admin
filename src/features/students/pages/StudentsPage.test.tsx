import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { StudentsPage } from './StudentsPage';

/**
 * The create-student flow, which is the most involved form in the app: it posts
 * the student and their guardian list in one request, and the guardian list
 * carries two rules the API enforces (at least one guardian, exactly one
 * primary).
 *
 * The first test is a regression guard: the guardian editor used to render a
 * group-level `<FormMessage>` outside any `FormField`, which threw on mount and
 * took the whole dialog down with it.
 */

const student = {
  id: '507f1f77bcf86cd799439011',
  studentCode: 'S-0001',
  firstNameLo: 'ສົມຈິດ',
  lastNameLo: 'ວົງສາ',
  gender: 'male',
  dateOfBirth: '2010-05-02T00:00:00.000Z',
  status: 'active',
  guardians: [
    {
      guardianId: '507f1f77bcf86cd799439012',
      fullNameLo: 'ບຸນມີ ວົງສາ',
      phone: '2055512345',
      relationship: 'father',
      isPrimary: true,
      isEmergencyContact: true,
      canViewRecords: true,
    },
  ],
};

/** Flipped by the homeroom-teacher test below; everything else runs as the office. */
let seesEveryStudent = true;
/** `students:manage` — what lets the office reissue a register number. */
let canManageStudents = true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action: string) =>
    resource === 'students' && action === 'manage' ? canManageStudents : true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => seesEveryStudent,
}));

/** Fills the student's own required fields, leaving the guardian row alone. */
async function fillStudentFields(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/student code/i), 'S-0002');
  // The student's name inputs come before the guardian row's identically
  // labelled ones, so index rather than label disambiguates them.
  await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[0]!, 'ນາງ');
  await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[0]!, 'ຄຳ');
  fireEvent.change(within(dialog).getByLabelText(/date of birth/i), {
    target: { value: '2011-03-04' },
  });
}

/**
 * The page's reads, when a test only cares about the student list.
 *
 * `/enrollments/english-classes` answers with a bare array rather than a page —
 * it is the distinct room labels the filter offers, not a collection — so a
 * blanket `paginated()` for every URL would hand the filter an object to map
 * over.
 */
const count = (total: number, female: number) => ({ total, female, male: total - female });

/** What `GET /students/stats` answers — 30 children, two of them under 11. */
const listStats = {
  ...count(30, 14),
  under: count(2, 1),
  ages: Array.from({ length: 10 }, (_, index) => ({
    age: 11 + index,
    ...(index === 1 ? count(9, 5) : count(index < 7 ? 3 : 0, index < 7 ? 1 : 0)),
  })),
  over: count(0, 0),
  unknown: count(1, 0),
};

function stubPageReads(rows: unknown[] = [student], englishClasses: string[] = []) {
  return vi.spyOn(apiClient, 'get').mockImplementation((path: string) => {
    if (path === '/enrollments/english-classes') return Promise.resolve(englishClasses);
    if (path === '/students/stats') return Promise.resolve(listStats);
    return Promise.resolve(paginated(rows));
  });
}

describe('StudentsPage — create', () => {
  beforeEach(() => {
    stubPageReads();
    vi.spyOn(apiClient, 'post').mockResolvedValue(student);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the create dialog with one guardian row', async () => {
    renderWithProviders(<StudentsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/student code/i)).toBeInTheDocument();
    // The guardian editor is present and starts with a row marked primary.
    expect(within(dialog).getByRole('radio', { name: /primary/i })).toBeChecked();
  });

  it('will not submit while the guardian row has no guardian selected', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByText(/this field is required/i)).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('reports the group-level rule when every guardian row is removed', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /remove/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /at least one guardian is required/i,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('creates the student together with a brand-new guardian', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);

    // Switch the guardian row from "pick existing" to "create new".
    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    // Both the student and the guardian row have a "Phone" field; the guardian's
    // is the later one.
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(apiClient.post).mock.calls[0]!;
    expect(path).toBe('/students');
    expect(body).toMatchObject({
      studentCode: 'S-0002',
      firstNameLo: 'ນາງ',
      lastNameLo: 'ຄຳ',
      dateOfBirth: '2011-03-04',
      guardians: [
        {
          guardian: { firstNameLo: 'ບຸນມີ', lastNameLo: 'ຄຳ', phone: '2055512345' },
          relationship: 'father',
          isPrimary: true,
        },
      ],
    });
    // A "new guardian" row must not also send an (empty) guardianId.
    expect((body as { guardians: unknown[] }).guardians[0]).not.toHaveProperty('guardianId');
  });

  it('carries both nicknames through to the payload, and no title — it is derived', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    await userEvent.type(within(dialog).getByLabelText(/nickname \(lao\)/i), 'ລິຕ້າ');
    await userEvent.type(within(dialog).getByLabelText(/nickname \(english\)/i), 'RITA');

    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    const body = vi.mocked(apiClient.post).mock.calls[0]![1];
    expect(body).toMatchObject({ nickname: 'ລິຕ້າ', nicknameEn: 'RITA' });
    // The honorific is a virtual read off `gender`; posting one would let the
    // two disagree, which is the whole reason it stopped being a field.
    expect(body).not.toHaveProperty('title');
  });

  it('sends only the organisations given a join date, and none derived from gender', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /add student/i }));
    const dialog = await screen.findByRole('dialog');

    await fillStudentFields(dialog);
    // Youth union joined, women's union left blank — a female student is not a
    // member of it until the school says she is.
    await userEvent.type(within(dialog).getByLabelText(/youth union/i), '2024-09-01');

    await userEvent.click(within(dialog).getByRole('button', { name: /create new/i }));
    await userEvent.type(within(dialog).getAllByLabelText(/first name \(lao\)/i)[1]!, 'ບຸນມີ');
    await userEvent.type(within(dialog).getAllByLabelText(/last name \(lao\)/i)[1]!, 'ຄຳ');
    await userEvent.type(within(dialog).getAllByLabelText(/phone/i).at(-1)!, '2055512345');

    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(apiClient.post).toHaveBeenCalledTimes(1));
    expect(vi.mocked(apiClient.post).mock.calls[0]![1]).toMatchObject({
      organizations: [{ organization: 'youth', joinedDate: '2024-09-01' }],
    });
  });
});

describe('StudentsPage — list', () => {
  beforeEach(() => {
    stubPageReads([
      { ...student, nickname: 'ລິຕ້າ', nicknameEn: 'RITA' },
      // Most records will only ever have the Lao one.
      {
        ...student,
        id: '507f1f77bcf86cd799439013',
        studentCode: 'S-0002',
        nickname: 'ເອມີ້',
      },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the nickname beside the register name, which is how staff scan a roster', async () => {
    renderWithProviders(<StudentsPage />);

    // Rendered in English, so the English nickname wins where there is one…
    expect(await screen.findByText('(RITA)')).toBeInTheDocument();
    // …and the Lao one shows rather than nothing where there is not.
    expect(screen.getByText('(ເອມີ້)')).toBeInTheDocument();
    // The register name is still the primary text, not replaced by the nickname.
    expect(screen.getAllByText('ສົມຈິດ ວົງສາ')).toHaveLength(2);
  });
});

/**
 * ບັນຊີລາຍຊື່ນັກຮຽນ — the roster as a workbook, which is what the office hands
 * round and files.
 *
 * Two things are worth pinning and neither is visible in the file: that the
 * export asks for every page of the current filters rather than the page on
 * screen, and that it joins the homeroom teacher through the classroom — the
 * one column on the sheet that is on neither the student nor their placement.
 */
describe('StudentsPage — the roster export', () => {
  const classroom = {
    id: 'cls-1',
    name: 'ຂ',
    gradeLevelId: { id: 'g1', code: 'm1' },
    // Half the rooms hold a populated teacher and half a bare id, depending on
    // who created them; the export reads both through `refId`.
    homeroomTeacherId: 'tea-1',
    capacity: 30,
    currentCount: 2,
    isActive: true,
  };
  const teacher = { id: 'tea-1', teacherCode: 'T-1', firstNameLo: 'ນູລີ', lastNameLo: 'ສີສະຫວາດ' };
  const placed = {
    ...student,
    nickname: 'ລິຕ້າ',
    nicknameEn: 'RITA',
    firstNameEn: 'Somchit',
    lastNameEn: 'Vongsa',
    title: 'ທ້າວ',
    currentEnrollment: {
      enrollmentId: 'enr-1',
      classroomId: 'cls-1',
      classroomName: 'ມ.1/ຂ',
      gradeLevelId: 'g1',
      gradeLevelCode: 'm1',
      schoolYearId: 'sy-1',
      rollNumber: 4,
      enrolledAt: '2026-08-11T00:00:00.000Z',
      englishClass: 'EP-A',
    },
  };

  beforeEach(() => {
    vi.spyOn(apiClient, 'get').mockImplementation((path: string, config?: unknown) => {
      const params = (config as { params?: Record<string, unknown> } | undefined)?.params ?? {};
      if (path === '/enrollments/english-classes') return Promise.resolve(['EP-A']);
      if (path === '/students/stats') return Promise.resolve(listStats);
      if (path === '/classrooms') return Promise.resolve(paginated([classroom]));
      if (path === '/teachers') return Promise.resolve(paginated([teacher]));
      if (path === '/school-years/active')
        return Promise.resolve({ id: 'sy-1', code: '2025-2026' });
      // A second page of students, so the export has to ask for both.
      // `cleanParams` renders every query value as a string; the DTO parses it back.
      if (path === '/students' && Number(params.limit) === 100) {
        return Promise.resolve(
          Number(params.page) === 1
            ? paginated([placed], { page: 1, limit: 100, total: 101 })
            : paginated([{ ...placed, id: 'stu-2', studentCode: 'S-0002' }], {
                page: 2,
                limit: 100,
                total: 101,
              }),
        );
      }
      return Promise.resolve(paginated([placed]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports every page of the current filters, teacher and all', async () => {
    const created = vi.fn((_blob: Blob) => 'blob:roster');
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: vi.fn() });
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });

    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /export excel/i }));
    await waitFor(() => expect(created).toHaveBeenCalled());

    // Both pages were asked for, and the reader's own page was not carried in.
    const pages = vi
      .mocked(apiClient.get)
      .mock.calls.filter(([path]) => path === '/students')
      .map(([, config]) => (config as { params: Record<string, unknown> }).params)
      .filter((params) => Number(params.limit) === 100)
      .map((params) => Number(params.page));
    expect(pages).toEqual([1, 2]);

    const [blob] = created.mock.calls[0];
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });

    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const worksheet = workbook.worksheets[0];

    // The columns the office asked for, in the order it reads them.
    expect(worksheet.getRow(5).values).toEqual([
      undefined,
      'ລ/ດ',
      'ລ/ຕ',
      'Status',
      'ທ້າວ/ນາງ',
      'ຊື່',
      'ນາມສະກຸນ',
      'ຊື່ຫຼິ້ນ',
      'Student name',
      'Nickname',
      'Classroom',
      'English class',
      'Homeroom teacher',
    ]);
    expect(worksheet.getRow(6).values).toEqual([
      undefined,
      1,
      'S-0001',
      'Active',
      'ທ້າວ',
      'ສົມຈິດ',
      'ວົງສາ',
      'ລິຕ້າ',
      'Somchit Vongsa',
      'RITA',
      // The grade code is latin in the database and ມ.1 on every sheet the
      // school prints, and the room's own name already carries it.
      'ມ.1/ຂ',
      // ຫ້ອງພາກອັງກິດ is its own grouping — it prints beside the homeroom
      // rather than instead of it.
      'EP-A',
      'ນູລີ ສີສະຫວາດ',
    ]);
    // Both pages are in the file, numbered straight through.
    expect(worksheet.getCell('A7').value).toBe(2);
    expect(worksheet.getCell('B7').value).toBe('S-0002');

    expect(filenames).toEqual(['Student roster 2025-2026.xlsx']);
  });
});

/**
 * `GET /students` narrows to the current roll when no status is given — `active`
 * together with `no_certificate`, since declining the certificate leaves a child
 * in their classroom — so the dropdown has to show that default rather than
 * "all", and asking for the whole register has to send `all` by name; a cleared
 * filter would silently mean the roll again.
 */
describe('StudentsPage — the status filter', () => {
  beforeEach(() => {
    stubPageReads();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Params of the most recent `/students` list request. */
  function lastListParams() {
    const calls = vi.mocked(apiClient.get).mock.calls.filter(([path]) => path === '/students');
    return (calls.at(-1)?.[1] as { params: Record<string, unknown> }).params;
  }

  /**
   * The toolbar's dropdowns carry no label of their own, so the status one is
   * addressed by what it currently reads — which is the point being tested.
   */
  function statusFilter(reads: string) {
    const box = screen.getAllByRole('combobox').find((el) => el.textContent === reads);
    expect(box, `no filter dropdown reads "${reads}"`).toBeDefined();
    return box!;
  }

  it('reads as the current roll, and sends no status of its own', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    // The trigger names what the server actually returns — the roll, not just
    // the children with a certificate ahead of them…
    statusFilter('Still studying (incl. no certificate)');
    // …and the default costs no query param, so it stays out of the URL and off
    // the "clear filters" count.
    expect(lastListParams()).not.toHaveProperty('status');
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('asks for the whole register by name when every status is picked', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Still studying (incl. no certificate)'));
    await userEvent.click(await screen.findByRole('option', { name: /every status/i }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'all' }));
  });

  it('still narrows to a single status', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Still studying (incl. no certificate)'));
    await userEvent.click(await screen.findByRole('option', { name: /graduated/i }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'graduated' }));
  });

  /**
   * Regression guard: setting one filter used to rewrite every filter key the
   * table declares, so the single-key patch coming out of a dropdown cleared
   * all the others — picking a gender wiped the status that was already set,
   * and the toolbar could never hold two filters at once.
   */
  it('keeps the filters already set when another one is picked', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Still studying (incl. no certificate)'));
    await userEvent.click(await screen.findByRole('option', { name: /graduated/i }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ status: 'graduated' }));

    await userEvent.click(statusFilter('Gender: All'));
    await userEvent.click(await screen.findByRole('option', { name: /^female$/i }));

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({ status: 'graduated', gender: 'female' }),
    );
  });
  it('filters by age, offering nothing younger than 11', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Age: All'));
    expect(screen.queryByRole('option', { name: '10 years' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('option', { name: '11 years' }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ age: '11' }));
  });

  it('heads the list with the headcount, by gender and by age', async () => {
    renderWithProviders(<StudentsPage />);

    expect(await screen.findByText('30')).toBeInTheDocument();
    expect(screen.getByText('All students')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^12 years 9/ })).toBeInTheDocument();
    expect(screen.getByText(/no date of birth: 1/i)).toBeInTheDocument();
  });

  it('lists the children of an age when it is clicked, and lets go on a second click', async () => {
    renderWithProviders(<StudentsPage />);
    const twelve = await screen.findByRole('button', { name: /^12 years 9/ });

    await userEvent.click(twelve);
    await waitFor(() => expect(lastListParams()).toMatchObject({ age: '12' }));
    expect(twelve).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(twelve);
    await waitFor(() => expect(lastListParams()).not.toHaveProperty('age'));
  });

  it('counts the same filters as the list, but never narrows the count by age', async () => {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /^Under 11 2/ }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ ageUnder: '11' }));

    const statsCalls = vi
      .mocked(apiClient.get)
      .mock.calls.filter(([path]) => path === '/students/stats')
      .map(([, config]) => (config as { params: Record<string, unknown> }).params);
    for (const params of statsCalls) {
      expect(params).not.toHaveProperty('ageUnder');
      expect(params).not.toHaveProperty('page');
    }
  });

  it('offers "under 11", which replaces an exact age rather than adding to it', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('ສົມຈິດ ວົງສາ');

    await userEvent.click(statusFilter('Age: All'));
    await userEvent.click(await screen.findByRole('option', { name: '12 years' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ age: '12' }));

    await userEvent.click(statusFilter('12 years'));
    await userEvent.click(await screen.findByRole('option', { name: 'Under 11' }));

    await waitFor(() => expect(lastListParams()).toMatchObject({ ageUnder: '11' }));
    expect(lastListParams()).not.toHaveProperty('age');
  });
});

describe('StudentsPage — editing', () => {
  beforeEach(() => {
    stubPageReads();
    vi.spyOn(apiClient, 'patch').mockResolvedValue(student);
  });

  afterEach(() => {
    seesEveryStudent = true;
    canManageStudents = true;
    vi.restoreAllMocks();
  });

  async function openEditDialog() {
    renderWithProviders(<StudentsPage />);
    await userEvent.click(await screen.findByRole('button', { name: /actions/i }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /edit/i }));
    return screen.findByRole('dialog');
  }

  it('hides the status field, which is the office\u2019s call', async () => {
    seesEveryStudent = false;

    const dialog = await openEditDialog();
    // Everything else on the record is still editable…
    expect(within(dialog).getByLabelText(/student code/i)).toBeInTheDocument();
    // …but not the status, which drives enrolment and certificates.
    expect(within(dialog).queryByLabelText(/status/i)).not.toBeInTheDocument();
  });

  it('shows it to the office', async () => {
    const dialog = await openEditDialog();
    expect(within(dialog).getByLabelText(/status/i)).toBeInTheDocument();
  });

  /**
   * Regression guard: the edit form used to PATCH every field it held. Sending
   * back a field nobody touched races whoever edited it in the meantime, and the
   * API runs with `forbidNonWhitelisted`, so an unchanged `studentCode` used to
   * come back 400 no matter which field the office had actually touched.
   */
  it('patches only the field that changed, leaving an untouched code alone', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      ...student,
      status: 'graduated',
    });

    const dialog = await openEditDialog();

    await userEvent.click(within(dialog).getByRole('combobox', { name: /status/i }));
    await userEvent.click(await screen.findByRole('option', { name: /graduated/i }));
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    const [url, body] = patch.mock.calls[0]!;
    expect(url).toBe(`/students/${student.id}`);
    expect(body).toEqual({ status: 'graduated' });
  });

  /**
   * A child regularly joins a class before the school can issue a real code, so
   * the office enters a stand-in and replaces it once the papers are in.
   */
  it('lets the office reissue the student code', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      ...student,
      studentCode: 'S-0042',
    });

    const dialog = await openEditDialog();

    const code = within(dialog).getByLabelText(/student code/i);
    expect(code).toBeEnabled();
    await userEvent.clear(code);
    await userEvent.type(code, 'S-0042');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]![1]).toEqual({ studentCode: 'S-0042' });
  });

  /** Everyone else sees the code but cannot retype it — the API refuses it too. */
  it('keeps the code read-only without students:manage', async () => {
    canManageStudents = false;

    const dialog = await openEditDialog();
    expect(within(dialog).getByLabelText(/student code/i)).toBeDisabled();
  });
});
