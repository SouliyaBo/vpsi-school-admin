import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { qualifyClassName } from './api';
import { MonthlyReport, termMonths } from './components/MonthlyReport';
import { ReviewCompliance } from './components/ReviewCompliance';
import { ReviewDueBanner } from './components/ReviewDueBanner';
import { ReviewSheet } from './components/ReviewSheet';
import { HomeroomReviewsPage } from './pages/HomeroomReviewsPage';

/**
 * ການຕິດຕາມນັກຮຽນຂອງຄູປະຈຳຫ້ອງ, from the two sides that use it.
 *
 * What is worth testing here is not the arithmetic — that is unit-tested on the
 * API, where the rules live — but the three things this screen is responsible for:
 * that a review can be confirmed when *nothing* is wrong (the case the office
 * needs on file and the one a naive form makes impossible), that a guardian
 * contact cannot be recorded without saying how, and that the oversight grid is
 * not offered to an account that does not hold it.
 */

const classroom = {
  id: 'room-1',
  name: 'ມ.1/ກ',
  gradeLevelCode: 'm1',
  teacherId: 'tea-1',
  teacherCode: 'T-001',
  teacherName: 'ສົມເພັດ ພັນໂນລາດ',
  studentsOnRoll: 24,
};

const reviewDay = {
  date: '2026-09-23',
  windowStart: '2026-09-21',
  windowEnd: '2026-09-23',
  deadline: '2026-09-24T05:00:00.000Z',
};

const flaggedStudent = {
  studentId: 'stu-1',
  studentCode: '0801',
  studentNameLo: 'ທ້າວ ແດນມີ',
  studentNickname: 'ແດນ',
  rollNumber: 3,
  reasons: [{ kind: 'absence' as const, scope: 'window' as const, value: 2, threshold: 1 }],
  severity: 'watch' as const,
  evidence: {
    attendance: [
      {
        date: '2026-09-22',
        status: 'absent' as const,
        subjectNameLo: 'ຄະນິດສາດ',
        period: 2,
        reason: 'ໄປໂຮງໝໍກັບແມ່',
        minutesLate: null,
        inWindow: true,
      },
      {
        date: '2026-09-15',
        status: 'late' as const,
        subjectNameLo: 'ພາສາລາວ',
        period: 1,
        reason: null,
        minutesLate: 20,
        inWindow: false,
      },
    ],
    behavior: [
      {
        date: '2026-09-22',
        subjectNameLo: 'ຄະນິດສາດ',
        teacherName: 'ພອນທິບ ວົງພະຈັນ',
        behavior: 'ວົນແຊວໃນຫ້ອງ',
        action: 'ເຕືອນ 2 ຄັ້ງ',
        inWindow: true,
      },
    ],
    conduct: [
      {
        date: '2026-09-10',
        ruleCode: '2.3',
        ruleNameLo: 'ມາຮຽນຊ້າ',
        points: 5,
        note: null,
      },
    ],
    more: { attendance: 3, behavior: 0, conduct: 0 },
  },
  window: {
    absentUnexcused: 2,
    late: 0,
    absentExcused: 0,
    behaviorEntries: 0,
    behaviorWithAction: 0,
  },
  term: {
    absentUnexcused: 2,
    late: 1,
    absentExcused: 0,
    attendanceRate: 92,
    behaviorEntries: 0,
    behaviorWithAction: 0,
    conductRemaining: 100,
  },
};

const thresholds = {
  window: { absentDays: 1, lates: 2, behaviorEntries: 1 },
  term: {
    absentDays: 5,
    lates: 6,
    behaviorEntries: 3,
    attendanceRateBelow: 85,
    conductPointsBelow: 85,
  },
};

const cell = (date: string, status: 'confirmed' | 'late' | 'missing' | 'pending') => ({
  date,
  status,
  reviewedAt: status === 'confirmed' || status === 'late' ? `${date}T10:00:00.000Z` : null,
  hoursLate: 0,
  studentsFlagged: 0,
  studentsActioned: 0,
  guardiansContacted: 0,
});

const sheet = {
  classroom,
  semester: { id: 'sem-1', nameLo: 'ພາກຮຽນທີ 1', nameEn: 'Semester 1' },
  reviewDay,
  status: 'pending' as const,
  // Two days already missed and the current one — the case the banner points at.
  days: [
    cell('2026-09-16', 'missing'),
    cell('2026-09-18', 'missing'),
    cell('2026-09-23', 'pending'),
  ],
  thresholds,
  studentsOnRoll: 24,
  flagged: [flaggedStudent],
  review: null,
  previousReview: null,
};

const myRooms = [
  {
    classroom,
    reviewDay: reviewDay.date,
    status: 'pending' as const,
    // Newest first, as the API returns them.
    missingDays: ['2026-09-18', '2026-09-16'],
    lastReviewedAt: null,
    flagged: 1,
  },
];

const compliance = {
  startDate: '2026-09-01',
  endDate: '2026-09-28',
  asOf: '2026-09-28',
  semester: { id: 'sem-1', nameLo: 'ພາກຮຽນທີ 1', nameEn: 'Semester 1' },
  reviewDays: [reviewDay, { ...reviewDay, date: '2026-09-25', windowStart: '2026-09-24' }],
  rows: [
    {
      classroomId: classroom.id,
      classroomName: classroom.name,
      gradeLevelCode: 'm1',
      teacherId: 'tea-1',
      teacherCode: 'T-001',
      teacherName: 'ສົມເພັດ ພັນໂນລາດ',
      studentsOnRoll: 24,
      days: [
        {
          date: '2026-09-23',
          status: 'confirmed' as const,
          reviewedAt: '2026-09-23T10:00:00.000Z',
          hoursLate: 0,
          studentsFlagged: 3,
          studentsActioned: 2,
          guardiansContacted: 1,
        },
        {
          date: '2026-09-25',
          status: 'missing' as const,
          reviewedAt: null,
          hoursLate: 0,
          studentsFlagged: 0,
          studentsActioned: 0,
          guardiansContacted: 0,
        },
      ],
      due: 2,
      confirmed: 1,
      late: 0,
      missing: 1,
      pending: 0,
      reviewRate: 50,
      onTimeRate: 100,
      lastReviewedAt: '2026-09-23T10:00:00.000Z',
      studentsFlagged: 3,
      studentsActioned: 2,
      guardiansContacted: 1,
    },
  ],
  summary: {
    classrooms: 1,
    due: 2,
    confirmed: 1,
    late: 0,
    missing: 1,
    pending: 0,
    reviewRate: 50,
    classroomsBehind: 1,
    teachersBehind: 1,
    classroomsUnassigned: 0,
    guardiansContacted: 1,
  },
};

/** Swapped per test: the oversight tab is gated on `homeroom-reviews:manage`. */
let permits: (resource: string, action?: string) => boolean = () => true;

const saveBlob = vi.fn();
vi.mock('@/lib/save-blob', () => ({ saveBlob: (...args: unknown[]) => saveBlob(...args) }));

const monthlyReport = {
  classroom: { id: classroom.id, name: 'ມ.1/ກ', gradeLevelCode: 'm1', teacherName: null },
  semester: { id: 'sem-1', number: 1, nameLo: 'ພາກຮຽນທີ 1' },
  month: 10,
  monthNameLo: 'ຕຸລາ',
  from: '2026-10-01',
  to: '2026-10-31',
  overview: { students: 24, female: 11 },
  absence: {
    totalDays: 6,
    excusedDays: 2,
    unexcusedDays: 4,
    lateDays: 1,
    notable: [
      {
        studentId: 'stu-1',
        studentCode: '0801',
        studentNameLo: 'ທ້າວ ແດນມີ',
        days: 4,
        excused: 2,
        unexcused: 2,
        reasons: 'ໄປໂຮງໝໍກັບແມ່',
      },
    ],
    lates: [],
  },
  behavior: [],
  deductions: [],
  discipline: [],
  tests: {
    subjects: [{ id: 'm', nameLo: 'ຄະນິດສາດ', testMax: 6, target: 3 }],
    below: [],
    tested: 20,
  },
  guardianContacts: [],
};

vi.mock('@/features/auth/hooks', () => ({
  useCan: () => (resource: string, action?: string) => permits(resource, action),
  useCurrentUser: () => ({ username: 'admin', permissions: [] }),
  useSeesEveryStudent: () => true,
}));

function stubReads(overrides: Record<string, unknown> = {}): void {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url in overrides) return overrides[url] as never;
    if (url === '/homeroom-reviews/mine') return myRooms as never;
    if (url === '/homeroom-reviews/sheet') return sheet as never;
    if (url === '/homeroom-reviews/compliance') return compliance as never;
    if (url === '/homeroom-reviews/monthly-report') return monthlyReport as never;
    if (url === '/semesters/active') {
      return {
        id: 'sem-1',
        nameLo: 'ພາກຮຽນທີ 1',
        startDate: '2026-09-01',
        endDate: '2027-01-31',
      } as never;
    }
    return null as never;
  });
}

beforeEach(() => {
  permits = () => true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the review sheet', () => {
  it('shows the flagged student with the reason, in the teacher’s words', async () => {
    stubReads();
    renderWithProviders(<ReviewSheet />);

    expect(await screen.findByText('ທ້າວ ແດນມີ')).toBeInTheDocument();
    expect(screen.getByText(/absent 2 day/i)).toBeInTheDocument();
    expect(screen.getByText(/1 to look at/i)).toBeInTheDocument();
  });

  it('confirms a review with no student lines at all', async () => {
    // The case the office actually needs on file: "I looked, the class is fine".
    stubReads({ '/homeroom-reviews/sheet': { ...sheet, flagged: [] } });
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'rev-1' } as never);

    renderWithProviders(<ReviewSheet />);

    await userEvent.click(await screen.findByRole('button', { name: /confirm review/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/homeroom-reviews', {
        classroomId: classroom.id,
        dueDate: reviewDay.date,
        students: [],
        note: undefined,
      }),
    );
  });

  it('refuses to send a guardian contact with no channel, and says why', async () => {
    stubReads();
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ id: 'rev-1' } as never);

    renderWithProviders(<ReviewSheet />);

    // Each row's controls are named after the child, which is how a screen reader
    // reads the table and how this addresses it.
    await userEvent.click(
      await screen.findByRole('combobox', { name: /action taken — ທ້າວ ແດນມີ/i }),
    );
    await userEvent.click(await screen.findByRole('option', { name: /contacted the guardian/i }));

    expect(await screen.findByText(/say how the guardian was contacted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm review/i })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the rows behind a flag, so the teacher need not leave the page', async () => {
    stubReads();
    renderWithProviders(<ReviewSheet />);

    // Collapsed to begin with: the badge is the summary, the detail is a click.
    expect(screen.queryByText('ວົນແຊວໃນຫ້ອງ')).toBeNull();

    await userEvent.click(await screen.findByRole('button', { name: /details — ທ້າວ ແດນມີ/i }));

    // The roll call, the register and the ledger, each with its own dates — the
    // 22nd appears twice, once as an absence and once as a register entry.
    expect(await screen.findAllByText(/22\/09\/2026/)).toHaveLength(2);
    expect(screen.getByText('ວົນແຊວໃນຫ້ອງ')).toBeInTheDocument();
    expect(screen.getByText(/action: ເຕືອນ 2 ຄັ້ງ/i)).toBeInTheDocument();
    // Why the roll call says what it says — an absence with a reason on file is
    // a different phone call from one without.
    expect(screen.getByText(/reason: ໄປໂຮງໝໍກັບແມ່/i)).toBeInTheDocument();
    expect(screen.getByText(/late \(20 min\)/i)).toBeInTheDocument();
    expect(screen.getByText(/2.3 ມາຮຽນຊ້າ/)).toBeInTheDocument();
    expect(screen.getByText('−5')).toBeInTheDocument();
    // What the cap left out is said rather than silently dropped.
    expect(screen.getByText(/and 3 more/i)).toBeInTheDocument();
  });

  it('opens every child at once, which is what a round of phone calls needs', async () => {
    stubReads();
    renderWithProviders(<ReviewSheet />);

    await userEvent.click(await screen.findByRole('button', { name: /expand all/i }));

    expect(await screen.findByText('ວົນແຊວໃນຫ້ອງ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /collapse all/i })).toBeInTheDocument();
  });

  it('offers every review day of the term, so a missed one can still be filed', async () => {
    stubReads();
    const get = vi.spyOn(apiClient, 'get');
    renderWithProviders(<ReviewSheet />);

    await userEvent.click(await screen.findByRole('combobox', { name: /review day/i }));
    // Each option says where that day stands, so "which one do I owe" needs no
    // second screen.
    expect(
      await screen.findByRole('option', { name: /16\/09\/2026 · not reviewed/i }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('option', { name: /18\/09\/2026 · not reviewed/i }));

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/homeroom-reviews/sheet', {
        params: { classroomId: 'room-1', dueDate: '2026-09-18' },
      }),
    );
  });

  it('tells a teacher with no homeroom that this page is not theirs', async () => {
    // A plain teacher: no homeroom of their own, and no oversight either.
    permits = (resource, action) => !(resource === 'homeroom-reviews' && action === 'manage');
    stubReads({ '/homeroom-reviews/mine': [] });
    renderWithProviders(<ReviewSheet />);

    expect(await screen.findByText(/not a homeroom teacher/i)).toBeInTheDocument();
  });

  it('lets the office pick any class instead of turning it away', async () => {
    // The office is nobody's homeroom teacher, which is why `mine` is empty — but
    // it reads every room, and used to be shown an empty state here.
    stubReads({ '/homeroom-reviews/mine': [] });
    renderWithProviders(<ReviewSheet />);

    // The label and the picker's own placeholder both say it.
    expect(await screen.findAllByText(/choose a class/i)).not.toHaveLength(0);
    expect(screen.getByText(/the office sees every class/i)).toBeInTheDocument();
    expect(screen.queryByText(/not a homeroom teacher/i)).toBeNull();
  });
});

describe('the banner', () => {
  it('asks for the review while the room is unconfirmed', async () => {
    stubReads();
    renderWithProviders(<ReviewDueBanner />);

    expect(await screen.findByText(/review not confirmed/i)).toBeInTheDocument();
  });

  it('links to the room and the oldest day owed, not merely to the page', async () => {
    // The first version linked to `/homeroom-reviews` alone, which from that page
    // is the page you are already on — the button did nothing at all.
    stubReads();
    renderWithProviders(<ReviewDueBanner />);

    const link = await screen.findByRole('link', { name: /open the review sheet/i });
    expect(link).toHaveAttribute('href', '/homeroom-reviews?classroomId=room-1&dueDate=2026-09-16');
  });

  it('says nothing once every room is confirmed', async () => {
    stubReads({
      '/homeroom-reviews/mine': [{ ...myRooms[0], status: 'confirmed', flagged: 0 }],
    });
    renderWithProviders(<ReviewDueBanner />);

    // Nothing at all: a banner that is always on screen is a banner nobody reads.
    await waitFor(() => expect(screen.queryByText(/waiting to be reviewed/i)).toBeNull());
    expect(screen.queryByRole('link', { name: /open the review sheet/i })).toBeNull();
  });
});

describe('the compliance grid', () => {
  it('names the room that is behind and how far', async () => {
    stubReads();
    renderWithProviders(<ReviewCompliance />);

    expect(await screen.findByText('ມ.1/ກ')).toBeInTheDocument();
    expect(screen.getByText('ສົມເພັດ ພັນໂນລາດ')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('is not offered to an account without `manage`', async () => {
    permits = (resource, action) => !(resource === 'homeroom-reviews' && action === 'manage');
    stubReads();
    renderWithProviders(<HomeroomReviewsPage />);

    expect(await screen.findByRole('tab', { name: /my class/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /school-wide/i })).not.toBeInTheDocument();
  });
});

describe('the monthly report', () => {
  it('fills in what the records hold and says which sections are empty', async () => {
    permits = (resource, action) => !(resource === 'homeroom-reviews' && action === 'manage');
    stubReads();
    renderWithProviders(<MonthlyReport />);

    expect(await screen.findByText('ທ້າວ ແດນມີ (0801)')).toBeInTheDocument();
    expect(screen.getByText('ໄປໂຮງໝໍກັບແມ່')).toBeInTheDocument();
    expect(screen.getByText(/24 students, 11 female/)).toBeInTheDocument();
    expect(screen.getAllByText('None').length).toBeGreaterThan(0);
    expect(screen.getByText(/to complete in word/i)).toBeInTheDocument();
  });

  it('downloads the Word form under the name the API gives it', async () => {
    permits = (resource, action) => !(resource === 'homeroom-reviews' && action === 'manage');
    stubReads();
    const blob = new Blob(['docx']);
    const download = vi.spyOn(apiClient.apiClient, 'get').mockResolvedValue({
      data: blob,
      headers: {
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('report.docx')}`,
      },
    } as never);
    renderWithProviders(<MonthlyReport />);

    await screen.findByText('ທ້າວ ແດນມີ (0801)');
    await userEvent.click(screen.getByRole('button', { name: /download word/i }));

    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'report.docx'));
    expect(download).toHaveBeenCalledWith(
      '/homeroom-reviews/monthly-report/docx',
      expect.objectContaining({ params: expect.objectContaining({ classroomId: classroom.id }) }),
    );
  });

  it('offers the months the term runs through, across the new year', () => {
    expect(termMonths('2026-09-01', '2027-01-31')).toEqual([9, 10, 11, 12, 1]);
  });
});

describe('qualifyClassName', () => {
  it('leaves a name that already carries its grade alone', () => {
    // The bug this replaced rendered `m1/ມ.1/ກ` on every coverage row.
    expect(qualifyClassName('ມ.1/ກ', 'm1')).toBe('ມ.1/ກ');
    expect(qualifyClassName('ມ.5', 'm5')).toBe('ມ.5');
  });

  it('prefixes a bare section name', () => {
    expect(qualifyClassName('ກ', 'm1')).toBe('m1/ກ');
  });

  it('leaves the name alone when there is no grade to add', () => {
    expect(qualifyClassName('ມ.1/ກ', null)).toBe('ມ.1/ກ');
  });
});
