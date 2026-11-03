import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import type { AttendanceSummary } from '@/features/attendances/api';
import type { GeneratedReport, MonthlyStanding, StandingStudent } from './api';
import { ReportsPage } from './pages/ReportsPage';

/**
 * ລາຍງານ.
 *
 * The figures are the API's and are tested there; what this page answers for is
 * who is shown what — the office every room, a homeroom teacher only theirs — and
 * that the class pack is asked for as one PDF.
 */

let office = true;

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (_resource: string, action?: string) =>
    office || !(action === 'manage' || action === 'delete'),
  useCurrentUser: () => ({ username: office ? 'admin' : 'teacher', personId: 'teacher-1' }),
  useSeesEveryStudent: () => office,
}));

const activeYear = { id: 'year1', nameLo: '2026-2027', nameEn: '2026-2027' };
const semester = {
  id: 'sem1',
  nameLo: 'ພາກຮຽນທີ 1',
  nameEn: 'Semester 1',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-12-31T00:00:00.000Z',
};
const room = (id: string, name: string, homeroom: string, currentCount: number) => ({
  id,
  name,
  gradeLevelId: { id: 'g1', code: 'm1', nameLo: 'ມ.1' },
  homeroomTeacherId: homeroom,
  currentCount,
  capacity: 45,
});
const ROOMS = [room('r1', 'ກ', 'teacher-1', 2), room('r2', 'ຂ', 'teacher-2', 1)];

const student = (overrides: Partial<AttendanceSummary>): AttendanceSummary => ({
  studentId: 's',
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  sick: 0,
  totalRecorded: 0,
  lateAsAbsent: 0,
  lateRemainder: 0,
  absentUnexcused: 0,
  absentExcused: 0,
  absentTotal: 0,
  latesPerAbsence: 3,
  attendanceRate: 0,
  ...overrides,
});

const pack = (overrides: Partial<GeneratedReport> = {}): GeneratedReport => ({
  id: 'rep1',
  type: 'report_card',
  status: 'completed',
  studentId: null,
  classroomId: 'r1',
  semesterId: 'sem1',
  params: { students: 32 },
  fileSizeBytes: 12345,
  errorMessage: null,
  requestedBy: 'u1',
  completedAt: '2026-10-29T03:00:00.000Z',
  createdAt: '2026-10-29T03:00:00.000Z',
  classroomName: 'ກ',
  gradeLevelCode: 'm1',
  semesterNameLo: 'ພາກຮຽນທີ 1',
  semesterNameEn: 'Semester 1',
  ...overrides,
});

const tally = (overrides: Partial<MonthlyStanding['total']['current']>) => ({
  students: 0,
  top: 0,
  middle: 0,
  below: 0,
  incomplete: 0,
  decided: 0,
  topPercent: null,
  middlePercent: null,
  belowPercent: null,
  ...overrides,
});

const standingStudent = (overrides: Partial<StandingStudent>): StandingStudent => ({
  studentId: 's1',
  studentCode: '0801',
  studentNameLo: 'ນາງ ທົດສອບ',
  studentNickname: null,
  rollNumber: 1,
  classroomId: 'r1',
  band: 'top',
  previousBand: 'top',
  average: 8.4,
  lowest: 7.2,
  subjectsMarked: 8,
  subjectsExpected: 8,
  failing: [],
  ...overrides,
});

const periods = [
  { semesterId: 'sem1', semesterNumber: 1, semesterNameLo: 'ພາກຮຽນທີ 1', semesterNameEn: 'Semester 1', month: 9 },
  { semesterId: 'sem1', semesterNumber: 1, semesterNameLo: 'ພາກຮຽນທີ 1', semesterNameEn: 'Semester 1', month: 10 },
];

const STANDING: MonthlyStanding = {
  schoolYearId: 'year1',
  periods,
  current: periods[1]!,
  previous: periods[0]!,
  topMark: 7,
  total: {
    current: tally({ students: 3, top: 1, middle: 1, below: 1, decided: 3, topPercent: 33.33, middlePercent: 33.33, belowPercent: 33.33 }),
    previous: tally({ students: 3, top: 2, below: 1, decided: 3, topPercent: 66.67, belowPercent: 33.33 }),
  },
  classrooms: [
    {
      id: 'r1',
      name: 'ກ',
      gradeLevelCode: 'm1',
      homeroomTeacherName: null,
      current: tally({ students: 2, top: 1, below: 1, decided: 2, topPercent: 50, middlePercent: 0, belowPercent: 50 }),
      previous: tally({ students: 2, top: 2, decided: 2, topPercent: 100, belowPercent: 0 }),
      subjects: [],
    },
    {
      id: 'r2',
      name: 'ຂ',
      gradeLevelCode: 'm1',
      homeroomTeacherName: null,
      current: tally({ students: 1, middle: 1, decided: 1, topPercent: 0, middlePercent: 100, belowPercent: 0 }),
      previous: tally({ students: 1, below: 1, decided: 1, topPercent: 0, belowPercent: 100 }),
      subjects: [],
    },
  ],
  subjects: [
    {
      nameLo: 'ຄະນິດສາດ',
      nameEn: 'Mathematics',
      current: { marked: 3, failed: 1, top: 1, failedPercent: 33.33, topPercent: 33.33 },
      previous: { marked: 3, failed: 1, top: 2, failedPercent: 33.33, topPercent: 66.67 },
    },
  ],
  students: [
    standingStudent({ studentId: 's1', studentNameLo: 'ນາງ ດີ' }),
    standingStudent({
      studentId: 's2',
      studentCode: '0802',
      studentNameLo: 'ທ້າວ ຫຼຸດ',
      band: 'below',
      previousBand: 'top',
      subjectsMarked: 5,
      failing: [{ subjectId: 'math', nameLo: 'ຄະນິດສາດ', nameEn: 'Mathematics', score: 4.96, fullMark: 10 }],
    }),
    standingStudent({
      studentId: 's3',
      studentCode: '0803',
      studentNameLo: 'ນາງ ກາງ',
      classroomId: 'r2',
      band: 'middle',
      previousBand: 'below',
    }),
  ],
};

let reports: GeneratedReport[] = [];

function stubReads() {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters/sem1') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/classrooms') return paginated(ROOMS) as never;
    if (url === '/attendances/summary/classroom/r1/semester/sem1') {
      return [
        student({ totalRecorded: 40, absentUnexcused: 2, absentTotal: 16, lateRemainder: 1 }),
        student({ totalRecorded: 40, absentTotal: 1, absentExcused: 1 }),
      ] as never;
    }
    if (url === '/attendances/summary/classroom/r2/semester/sem1') {
      return [student({ totalRecorded: 20, absentUnexcused: 10, absentTotal: 10 })] as never;
    }
    if (url === '/attendances/summary/semester/sem1/absences') return [] as never;
    if (url === '/reports') return paginated(reports) as never;
    if (url === '/monthly-marks/standing') return STANDING as never;
    return paginated([]) as never;
  });
}

beforeEach(() => {
  office = true;
  reports = [];
});
afterEach(() => vi.restoreAllMocks());

describe('the reports page', () => {
  it('lists the office’s reports, and not the oversight ones to a teacher', async () => {
    stubReads();
    const { unmount } = renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('District report draft')).toBeInTheDocument();
    expect(screen.getByText('Teachers who have not marked the roll')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Monthly summary/ })).toHaveAttribute(
      'href',
      '/scores?tab=month',
    );
    unmount();

    office = false;
    renderWithProviders(<ReportsPage />);
    expect(await screen.findByText('Monthly summary')).toBeInTheDocument();
    expect(screen.queryByText('District report draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Teachers who have not marked the roll')).not.toBeInTheDocument();
  });

  it('adds the classes up for the office, with the rate over the school', async () => {
    stubReads();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=attendance' });

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // Header, two rooms, the total.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText('ມ.1/ກ')).toBeInTheDocument();
    // (80 − 2) / 80
    expect(within(rows[1]).getByText('97.50%')).toBeInTheDocument();
    // (100 − 12) / 100, not the mean of the two rooms' rates.
    expect(within(rows[3]).getByText('88.00%')).toBeInTheDocument();
    // One student of ມ.1/ກ is at 16 days.
    expect(within(rows[1]).getAllByText('1').length).toBeGreaterThan(0);
  });

  it('shows a homeroom teacher their own room only, and asks the absences for it alone', async () => {
    office = false;
    const get = stubReads();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=attendance' });

    const table = await screen.findByRole('table');
    expect(within(table).getByText('ມ.1/ກ')).toBeInTheDocument();
    expect(within(table).queryByText('ມ.1/ຂ')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/attendances/summary/semester/sem1/absences',
        expect.objectContaining({ params: expect.objectContaining({ classroomId: 'r1' }) }),
      ),
    );
    expect(get).not.toHaveBeenCalledWith(
      '/attendances/summary/classroom/r2/semester/sem1',
      expect.anything(),
    );
  });

  it('asks for the class’s report cards as one PDF', async () => {
    stubReads();
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ queued: 1, reports: [{ reportId: 'rep1' }] } as never);
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=cards' });

    await user.click(await screen.findByRole('combobox', { name: 'Class' }));
    await user.click(await screen.findByRole('button', { name: /m1 ກ/ }));
    await user.click(screen.getByRole('button', { name: /Create class report cards/ }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/reports/report-cards/class', {
        classroomId: 'r1',
        semesterId: 'sem1',
        combined: true,
      }),
    );
  });

  it('lists a finished class pack with a way to open it', async () => {
    reports = [pack(), pack({ id: 'rep2', status: 'failed', errorMessage: 'font missing' })];
    stubReads();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=history' });

    expect(await screen.findAllByText('ມ.1/ກ')).toHaveLength(2);
    expect(screen.getAllByText('Class report cards · 32 students')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(1);
    expect(screen.getByText('font missing')).toBeInTheDocument();
  });
});

describe('the monthly results tab', () => {
  it('shows each class against the month before, with the school total under it', async () => {
    stubReads();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=standing' });

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    // Header, two rooms, the total.
    expect(rows).toHaveLength(4);
    expect(within(rows[1]!).getByText('ມ.1/ກ')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText('50.00%')).toHaveLength(2);
    // The share of ດີ fell from 100% to 50%.
    expect(within(rows[1]!).getByText('Before 100.00%')).toBeInTheDocument();
    expect(within(rows[3]!).getAllByText('33.33%').length).toBeGreaterThan(0);
  });

  it('names who is below 5, the subject and the mark as written', async () => {
    stubReads();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=standing' });

    await user.click(await screen.findByRole('tab', { name: /Below 5 \(1\)/ }));
    const table = await screen.findByRole('table');
    expect(within(table).getByText('ທ້າວ ຫຼຸດ')).toBeInTheDocument();
    // 4.96 is below 5 — shown to two places so it does not read as 5.0.
    expect(within(table).getByText('4.96')).toBeInTheDocument();
    expect(within(table).getByText('5/8 subjects marked')).toBeInTheDocument();
    expect(within(table).queryByText('ນາງ ດີ')).not.toBeInTheDocument();
  });

  it('lists who moved down and who moved up', async () => {
    stubReads();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=standing' });

    await user.click(await screen.findByRole('tab', { name: 'Changed band' }));
    expect(await screen.findByText('Moved down (1)')).toBeInTheDocument();
    expect(screen.getByText('Moved up (1)')).toBeInTheDocument();
    expect(screen.getByText('ທ້າວ ຫຼຸດ')).toBeInTheDocument();
    expect(screen.getByText('ນາງ ກາງ')).toBeInTheDocument();
  });

  it('narrows to one class on screen', async () => {
    stubReads();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=standing' });

    await user.click(await screen.findByRole('combobox', { name: 'Class' }));
    await user.click(await screen.findByRole('option', { name: 'ມ.1/ຂ' }));

    const table = await screen.findByRole('table');
    // One room and no total.
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('ມ.1/ຂ')).toBeInTheDocument();
  });

  it('asks for the month picked, and lets the API choose the one before', async () => {
    const get = stubReads();
    const user = userEvent.setup();
    renderWithProviders(<ReportsPage />, { route: '/reports?tab=standing' });

    await user.click(await screen.findByRole('combobox', { name: 'Month' }));
    await user.click(await screen.findByRole('option', { name: /^September/ }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/monthly-marks/standing',
        expect.objectContaining({ params: { semesterId: 'sem1', month: '9' } }),
      ),
    );
  });
});
