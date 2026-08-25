import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { ClassResultSheet } from './components/ClassResultSheet';

/**
 * ໃບຄະແນນລວມ — the sheet that crosses every subject of a class.
 *
 * The screen's own responsibility is the reading: marks are stored out of 100 so
 * a class can be ranked, and this school marks out of 10, so every figure here is
 * a division that must not drift from the one the report card does server-side.
 * The rest — averages, ranks, who is held back — is the API's and is asserted as
 * passed through, not recomputed.
 */

const activeYear = { id: 'sy-1', code: '2025-2026', nameLo: 'ປີ 2025-2026', isActive: true };
const semester = { id: 'sem-1', number: 1, nameLo: 'ພາກຮຽນ I', nameEn: 'Semester 1' };
const classroom = {
  id: 'cls-1',
  name: 'ກ',
  gradeLevelId: { id: 'g1', code: 'ມ.1' },
  schoolYearId: activeYear.id,
  isActive: true,
};

const subjectResult = (overrides: Record<string, unknown> = {}) => ({
  subjectId: 'sub-1',
  subjectNameLo: 'ພາສາລາວ',
  credits: 4,
  components: [],
  percentage: 83.1,
  grade: 'A',
  gradePoint: 4,
  isPassed: true,
  isIncomplete: false,
  ...overrides,
});

const termResult = (overrides: Record<string, unknown> = {}) => ({
  id: 'tr-1',
  studentId: 'stu-1',
  studentCode: '762',
  studentNameLo: 'ເກວະລິນ ອຸ່ນມີໄຊ',
  semesterId: semester.id,
  classroomId: classroom.id,
  subjects: [
    subjectResult(),
    subjectResult({
      subjectId: 'sub-2',
      subjectNameLo: 'ຄະນິດສາດ',
      percentage: 48.9,
      grade: 'F',
      isPassed: false,
    }),
  ],
  average: 66,
  gpa: 2,
  grade: 'C',
  rank: 1,
  totalStudents: 2,
  subjectsPassed: 1,
  subjectsFailed: 1,
  conductGrade: 'very_good',
  daysPresent: 80,
  daysAbsent: 2,
  daysLate: 1,
  daysExcused: 0,
  isProvisional: false,
  isStale: false,
  staleSince: null,
  isPublished: false,
  publishedAt: null,
  unpublishedAt: null,
  computedAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => () => true,
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/semesters/active') return semester as never;
    if (url === '/semesters') return paginated([semester]) as never;
    if (url === '/classrooms') return paginated([classroom]) as never;
    if (url === '/term-results') return paginated([termResult()]) as never;
    return paginated([]) as never;
  });
}

/** The class sheet spans every subject, so only the class and the term are picked. */
async function chooseClass() {
  await userEvent.click(await screen.findByRole('combobox', { name: /^class$/i }));
  await userEvent.click(await screen.findByRole('button', { name: /ມ\.1 ກ/ }));
}

describe('class results — reading the sheet', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('reads stored percentages back as the marks the school entered', async () => {
    renderWithProviders(<ClassResultSheet />);
    await chooseClass();

    const row = (await screen.findByText(/ເກວະລິນ/)).closest('tr') as HTMLElement;
    // 83.1 stored is the 8.31 that was written on the monthly sheet…
    expect(within(row).getByText('8.31')).toBeInTheDocument();
    // …and the failing subject keeps its own line under 5.
    expect(within(row).getByText('4.89')).toHaveClass('text-danger');
    // The average is the same division, not a second calculation.
    expect(within(row).getByText('6.60')).toBeInTheDocument();
  });

  it('gives every subject a column, even one only some students took', async () => {
    stubReads({
      '/term-results': paginated([
        termResult(),
        termResult({
          id: 'tr-2',
          studentId: 'stu-2',
          studentCode: '765',
          studentNameLo: 'ສິຣິຕ້າ ຊານຸບານ',
          rank: 2,
          subjects: [
            subjectResult(),
            subjectResult({ subjectId: 'sub-3', subjectNameLo: 'ຟີຊິກ', percentage: 70 }),
          ],
        }),
      ]),
    });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();

    await screen.findByText(/ເກວະລິນ/);
    // Columns come from every row, so a subject the first student did not take
    // still gets one — with a dash where they have no mark.
    for (const subject of ['ພາສາລາວ', 'ຄະນິດສາດ', 'ຟີຊິກ']) {
      expect(screen.getByRole('columnheader', { name: subject })).toBeInTheDocument();
    }
    const first = (await screen.findByText(/ເກວະລິນ/)).closest('tr') as HTMLElement;
    expect(within(first).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('marks a subject that is still missing a month as one that will move', async () => {
    stubReads({
      '/term-results': paginated([
        termResult({
          isProvisional: true,
          subjects: [subjectResult({ isIncomplete: true, percentage: 75 })],
        }),
      ]),
    });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();

    const row = (await screen.findByText(/ເກວະລິນ/)).closest('tr') as HTMLElement;
    expect(within(row).getByText('7.50')).toHaveClass('italic');
    expect(within(row).getByText(/incomplete/i)).toBeInTheDocument();
  });
});

describe('class results — the office’s verbs', () => {
  beforeEach(() => stubReads());
  afterEach(() => vi.restoreAllMocks());

  it('computes the class from the marks on file', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      classroomId: classroom.id,
      semesterId: semester.id,
      studentsProcessed: 12,
      provisionalCount: 2,
      withdrawn: 0,
      skipped: [],
    });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();
    await userEvent.click(screen.getByRole('button', { name: /compute/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/term-results/compute-sync', {
        classroomId: classroom.id,
        semesterId: semester.id,
      }),
    );
    // The count is reported back, including what could not be computed — a
    // silent "done" would hide a class half of whose marks are missing.
    expect(await screen.findByText(/12 computed · 2 incomplete/i)).toBeInTheDocument();
  });

  it('says what publication will hold back before it publishes', async () => {
    stubReads({ '/term-results': paginated([termResult({ isProvisional: true })]) });
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ published: 0, withheld: 1, withheldStale: 0 });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();
    await screen.findByText(/ເກວະລິນ/);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(
      await screen.findByText(/1 incomplete and 0 out-of-date result\(s\) are held back/i),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^confirm$/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/term-results/publish', {
        classroomId: classroom.id,
        semesterId: semester.id,
      }),
    );
  });
});

/**
 * The two ways a stored result goes wrong without anybody touching it: a mark
 * changes underneath it, or a recomputation quietly rewrites what a family has
 * already been shown. Both are invisible by construction — the result is derived
 * and stored — so the screen has to say them out loud.
 */
describe('class results — results that have gone out of date', () => {
  afterEach(() => vi.restoreAllMocks());

  it('warns that marks moved after the class was computed, and names the row', async () => {
    stubReads({
      '/term-results': paginated([
        termResult({ isStale: true, staleSince: '2026-02-10T00:00:00.000Z', isPublished: true }),
      ]),
    });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();

    // The banner is the one an office reads before it publishes…
    expect(
      await screen.findByText(/have had marks change since they were computed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/10\/02\/2026/)).toBeInTheDocument();

    // …and the row says it too, ahead of "published", because what a family can
    // see right now is already wrong.
    const row = (await screen.findByText(/ເກວະລິນ/)).closest('tr') as HTMLElement;
    expect(within(row).getByText(/needs recompute/i)).toBeInTheDocument();
    expect(within(row).queryByText(/^published$/i)).not.toBeInTheDocument();
  });

  it('says how many results publication will hold back for being out of date', async () => {
    stubReads({
      '/term-results': paginated([termResult({ isStale: true, isPublished: true })]),
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ published: 0, withheld: 1, withheldStale: 1 });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();
    await screen.findByText(/ເກວະລິນ/);
    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(
      await screen.findByText(/0 incomplete and 1 out-of-date result\(s\) are held back/i),
    ).toBeInTheDocument();
  });

  it('reports the publications a recomputation withdrew', async () => {
    stubReads();
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      classroomId: classroom.id,
      semesterId: semester.id,
      studentsProcessed: 12,
      provisionalCount: 0,
      // Three families were shown a figure that has now moved: the school has to
      // release it again rather than let the change pass unannounced.
      withdrawn: 3,
      skipped: [],
    });

    renderWithProviders(<ClassResultSheet />);
    await chooseClass();
    await userEvent.click(screen.getByRole('button', { name: /compute/i }));

    expect(
      await screen.findByText(/3 withdrawn from publication because the figures moved/i),
    ).toBeInTheDocument();
  });
});
