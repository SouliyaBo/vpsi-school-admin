import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { ComplianceMatrix } from './components/ComplianceMatrix';
import { MyPlans } from './components/MyPlans';

/**
 * Lesson-plan tracking.
 *
 * What is under test here is the inversion the feature exists for: the grid must
 * show a week nobody wrote a plan for. A list of plans cannot represent that, so
 * the assertions are about cells that have no record behind them — and about the
 * two things the form must never send, since the API derives both.
 */

const semester = {
  id: '507f1f77bcf86cd799439001',
  nameLo: 'ພາກຮຽນ 1',
  nameEn: 'Semester 1',
  number: 1,
  startDate: '2025-09-01T00:00:00.000Z',
  endDate: '2025-09-21T00:00:00.000Z',
  status: 'active',
  isActive: true,
};

const WEEKS = [
  { index: 1, startDate: '2025-09-01', endDate: '2025-09-07' },
  { index: 2, startDate: '2025-09-08', endDate: '2025-09-14' },
  { index: 3, startDate: '2025-09-15', endDate: '2025-09-21' },
];

const counts = (overrides: Record<string, number> = {}) => ({
  expected: 3,
  submitted: 1,
  approved: 1,
  draft: 0,
  missing: 2,
  late: 0,
  overdue: 1,
  withAttachments: 1,
  submissionRate: 33.3,
  ...overrides,
});

/** Approved in week 1 with a file, nothing at all in weeks 2 and 3. */
const behindRow = {
  teachingAssignmentId: '507f1f77bcf86cd799439051',
  teacherId: '507f1f77bcf86cd799439031',
  teacherCode: 'T-001',
  teacherName: 'ບຸນມີ ແກ້ວ',
  subjectId: '507f1f77bcf86cd799439011',
  subjectCode: 'CHEM-M4',
  subjectNameLo: 'ເຄມີສາດ',
  subjectNameEn: 'Chemistry',
  classroomId: '507f1f77bcf86cd799439021',
  classroomName: 'm4/ກ',
  subjectGroupId: '507f1f77bcf86cd799439041',
  cells: [
    {
      weekIndex: 1,
      weekStartDate: '2025-09-01',
      status: 'approved',
      planId: '507f1f77bcf86cd799439061',
      isLate: false,
      attachmentCount: 2,
      activityCount: 5,
      completedActivityCount: 5,
      dueDate: '2025-08-29T16:00:00.000Z',
      isOverdue: false,
    },
    {
      weekIndex: 2,
      weekStartDate: '2025-09-08',
      status: 'missing',
      planId: null,
      isLate: false,
      attachmentCount: 0,
      activityCount: 0,
      completedActivityCount: 0,
      dueDate: '2025-09-05T16:00:00.000Z',
      isOverdue: true,
    },
    {
      weekIndex: 3,
      weekStartDate: '2025-09-15',
      status: 'missing',
      planId: null,
      isLate: false,
      attachmentCount: 0,
      activityCount: 0,
      completedActivityCount: 0,
      dueDate: '2025-09-12T16:00:00.000Z',
      isOverdue: false,
    },
  ],
  summary: counts(),
};

const matrix = {
  semester,
  weeks: WEEKS,
  groups: [
    {
      subjectGroup: {
        id: '507f1f77bcf86cd799439041',
        code: 'science',
        nameLo: 'ສາຍວິທະຍາສາດ',
        nameEn: 'Science',
        headTeacherName: 'ສົມໃຈ ວົງສາ',
      },
      rows: [behindRow],
      summary: counts(),
    },
  ],
  summary: counts(),
};

const teacher = { id: '507f1f77bcf86cd799439031', username: 'boonmee', personType: 'teacher', personId: '507f1f77bcf86cd799439031' };

/**
 * The one lesson this teacher is timetabled to teach.
 *
 * The plan form offers only what is on this list, because the API refuses a plan
 * for anything else — so a fixture with no schedule leaves both pickers empty.
 */
const assignment = {
  id: '507f1f77bcf86cd799439051',
  teacherId: teacher.personId,
  subjectId: { id: '507f1f77bcf86cd799439011', code: 'CHEM-M4', nameLo: 'ເຄມີສາດ', nameEn: 'Chemistry' },
  classroomId: { id: '507f1f77bcf86cd799439021', name: 'ກ', gradeLevelId: { id: 'g1', code: 'm4' } },
  semesterId: semester.id,
  schedule: [],
  isActive: true,
};
const SCHEDULE_URL = `/teaching-assignments/teacher/${teacher.personId}/semester/${semester.id}`;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => teacher,
  useSeesEveryStudent: () => true,
}));

type GetConfig = { params?: Record<string, unknown> };

/** Routes every GET to a fixture; `overrides` win. Returns nothing — see below. */
function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, _config?: GetConfig) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/lesson-plans/compliance') return matrix as never;
    // Not paginated — the endpoint answers with a bare array.
    if (url === SCHEDULE_URL) return [assignment] as never;
    return paginated([]) as never;
  });
}

describe('lesson-plan tracking — the matrix', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('renders a cell per week for every lesson the timetable expects', async () => {
    renderWithProviders(<ComplianceMatrix />);

    const row = (await screen.findByText('ບຸນມີ ແກ້ວ')).closest('tr') as HTMLElement;
    // Three weeks plus the lesson label and the row total.
    expect(within(row).getAllByTitle(/week|due|approved|not written/i).length).toBeGreaterThan(0);
    expect(row).toHaveTextContent('1/3');
  });

  it('shows the weeks with no plan as "not written" — the gap a list cannot report', async () => {
    renderWithProviders(<ComplianceMatrix />);
    await screen.findByText('ບຸນມີ ແກ້ວ');

    // Two of the three weeks have no record at all behind them.
    const missing = screen.getAllByTitle(/not written/i);
    expect(missing).toHaveLength(2);
  });

  it('leaves a missing cell unclickable, and an existing plan clickable', async () => {
    renderWithProviders(<ComplianceMatrix />);
    await screen.findByText('ບຸນມີ ແກ້ວ');

    // Nothing to open for a week that was never planned.
    for (const cell of screen.getAllByTitle(/not written/i)) {
      expect(cell.tagName).not.toBe('BUTTON');
    }
    expect(screen.getByTitle(/approved/i).tagName).toBe('BUTTON');
  });

  it('marks an overdue cell apart from one that is merely not due yet', async () => {
    renderWithProviders(<ComplianceMatrix />);
    await screen.findByText('ບຸນມີ ແກ້ວ');

    const cells = screen.getAllByTitle(/not written/i);
    // Week 2 is past its deadline; week 3 is not, and must not be flagged.
    expect(cells.filter((cell) => /overdue/i.test(cell.getAttribute('title') ?? ''))).toHaveLength(
      1,
    );
  });

  it('surfaces the department, its head and its shortfall', async () => {
    renderWithProviders(<ComplianceMatrix />);

    expect(await screen.findByText('Science')).toBeInTheDocument();
    expect(screen.getByText(/ສົມໃຈ ວົງສາ/)).toBeInTheDocument();
    expect(screen.getByText('1/3 (33.3%)')).toBeInTheDocument();
  });

  it('reports an upload separately from a submission', async () => {
    renderWithProviders(<ComplianceMatrix />);
    await screen.findByText('ບຸນມີ ແກ້ວ');

    // The approved week carries two files; the tile counts cells, not files.
    expect(screen.getByTitle(/2 files/i)).toBeInTheDocument();
    expect(screen.getByText('With files')).toBeInTheDocument();
  });

  it('says so plainly when the timetable expects nothing', async () => {
    stubReads({ '/lesson-plans/compliance': { ...matrix, groups: [] } });
    renderWithProviders(<ComplianceMatrix />);

    expect(await screen.findByText(/nothing to track yet/i)).toBeInTheDocument();
    expect(screen.getByText(/built from teaching assignments/i)).toBeInTheDocument();
  });

  it('narrows the request to the chosen department', async () => {
    stubReads({
      '/subject-groups': paginated([
        { id: '507f1f77bcf86cd799439041', nameLo: 'ສາຍວິທະຍາສາດ', nameEn: 'Science' },
      ]),
    });
    // Read the spy back off the module rather than capturing one first: a second
    // `spyOn` replaces the property, so an earlier handle records nothing.
    const get = vi.mocked(apiClient.get);
    renderWithProviders(<ComplianceMatrix />);
    await screen.findByText('ບຸນມີ ແກ້ວ');

    await userEvent.click(screen.getByRole('combobox', { name: /department/i }));
    await userEvent.click(await screen.findByRole('button', { name: 'Science' }));

    await waitFor(() => {
      const call = get.mock.calls.find(
        ([url, config]) =>
          url === '/lesson-plans/compliance' &&
          (config as GetConfig | undefined)?.params?.subjectGroupId === '507f1f77bcf86cd799439041',
      );
      expect(call).toBeDefined();
    });
  });
});

describe('lesson-plan tracking — a teacher’s own plans', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks the API only for its own plans', async () => {
    stubReads();
    const get = vi.mocked(apiClient.get);
    renderWithProviders(<MyPlans />);

    await waitFor(() => {
      const call = get.mock.calls.find(([url]) => url === '/lesson-plans');
      expect((call?.[1] as GetConfig | undefined)?.params?.teacherId).toBe('507f1f77bcf86cd799439031');
    });
  });

  it('never sends a deadline or a week end — the API derives both', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'plan-new' });
    stubReads();
    renderWithProviders(<MyPlans />);

    await userEvent.click(await screen.findByRole('button', { name: /add lesson plan/i }));

    await userEvent.type(screen.getByLabelText(/^title/i), 'ແຜນອາທິດ 2');
    // `fireEvent` rather than typing: `<input type="date">` takes a whole value,
    // and keystroke-by-keystroke entry leaves it partial and invalid.
    // Deliberately a Wednesday — the API snaps it back to that week's Monday, so
    // the form has no business computing the week itself.
    fireEvent.change(screen.getByLabelText(/^week/i), { target: { value: '2025-09-10' } });

    await userEvent.click(screen.getByRole('combobox', { name: /semester/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Semester 1/ }));
    // Only the timetabled lesson is on offer, as a plain select.
    await userEvent.click(screen.getByRole('combobox', { name: /subject/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Chemistry/ }));
    await userEvent.click(screen.getByRole('combobox', { name: /classroom/i }));
    await userEvent.click(await screen.findByRole('option', { name: /m4/ }));

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const body = post.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ weekStartDate: '2025-09-10', semesterId: semester.id });
    expect(body).not.toHaveProperty('dueDate');
    expect(body).not.toHaveProperty('weekEndDate');
  });

  /**
   * The dropdown that could not be scrolled past its first page held all 70
   * subjects, capped at 50 by the lookup — while the API accepts exactly the
   * handful the teacher is timetabled for. Offering only those is what makes the
   * list short enough to have no page to be stuck on.
   */
  it('offers only the subjects the teacher is timetabled to teach', async () => {
    stubReads({
      '/subjects': paginated([
        { id: '507f1f77bcf86cd799439011', code: 'CHEM-M4', nameLo: 'ເຄມີສາດ', nameEn: 'Chemistry' },
        { id: '507f1f77bcf86cd799439012', code: 'BIO-M1', nameLo: 'ຊີວະສາດ', nameEn: 'Biology' },
      ]),
    });
    renderWithProviders(<MyPlans />);

    await userEvent.click(await screen.findByRole('button', { name: /add lesson plan/i }));
    await userEvent.click(screen.getByRole('combobox', { name: /subject/i }));

    expect(await screen.findByRole('option', { name: /Chemistry/ })).toBeInTheDocument();
    // On the catalogue but not on this teacher's timetable, so not selectable.
    expect(screen.queryByRole('option', { name: /Biology/ })).not.toBeInTheDocument();
  });

  /**
   * An attachment is keyed to a plan id, which does not exist while the form is
   * open — so a document picked during creation has to survive the save and be
   * posted against the id that comes back. Getting this wrong loses the file
   * silently, with the plan saved and nothing to show it was ever chosen.
   */
  it('posts a document chosen during creation against the new plan’s id', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'plan-new' });
    const upload = vi.spyOn(apiClient, 'upload').mockResolvedValue({ id: 'plan-new' });
    stubReads();
    renderWithProviders(<MyPlans />);

    await userEvent.click(await screen.findByRole('button', { name: /add lesson plan/i }));

    await userEvent.type(screen.getByLabelText(/^title/i), 'ແຜນອາທິດ 2');
    fireEvent.change(screen.getByLabelText(/^week/i), { target: { value: '2025-09-10' } });
    await userEvent.click(screen.getByRole('combobox', { name: /semester/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Semester 1/ }));
    // Only the timetabled lesson is on offer, as a plain select.
    await userEvent.click(screen.getByRole('combobox', { name: /subject/i }));
    await userEvent.click(await screen.findByRole('option', { name: /Chemistry/ }));
    await userEvent.click(screen.getByRole('combobox', { name: /classroom/i }));
    await userEvent.click(await screen.findByRole('option', { name: /m4/ }));

    const document_ = new File(['plan'], 'week2.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    // The dialog is portalled, so the input is outside the render container.
    await userEvent.upload(document.querySelector('input[type="file"]')!, document_);
    // Staged, not sent: nothing exists to attach it to yet.
    expect(screen.getByText('week2.docx')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]![0]).toBe('/lesson-plans/plan-new/attachments');
    expect((upload.mock.calls[0]![1] as FormData).get('file')).toBe(document_);
  });
});
