import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { renderWithProviders } from '@/test/utils';
import { TimelinessReport } from './TimelinessReport';
import type { RecordTimeliness } from './api';

/**
 * ຄວາມຕົງເວລາໃນການບັນທຶກ.
 *
 * The arithmetic is the API's and is asserted there, against the school's own
 * calendar. What is under test here is what the screen is answerable for, and on
 * a report that names staff that is mostly about not overstating things: that the
 * two logs are not given the same columns, that a write-up whose deadline has not
 * arrived is not counted against anybody, and that lateness measured in days is
 * not printed as a three-figure number of hours nobody divides in their head.
 */

const teacher = (over: Partial<RecordTimeliness['rows'][number]> = {}) => ({
  teacherId: 't1',
  teacherCode: 'T-2627-017',
  teacherName: 'ຊາຍແສງ ພັນວິໄຊ',
  owed: 12,
  recorded: 9,
  onTime: 3,
  late: 6,
  missing: 1,
  lateRate: 66.7,
  avgHoursLate: 57,
  worstHoursLate: 144.8,
  notYetDue: 2,
  lastRecordedAt: '2026-09-09T04:00:00.000Z',
  lateLessons: [
    {
      date: '2026-08-31',
      hoursLate: 144.8,
      classroomName: 'ມ.7/ຂ',
      gradeLevelCode: 'm7',
      subjectNameLo: 'ທຳມະຊາດ',
    },
  ],
  missingDates: ['2026-09-04'],
  ...over,
});

const report = (over: Partial<RecordTimeliness> = {}): RecordTimeliness => ({
  startDate: '2026-08-17',
  endDate: '2026-09-11',
  asOf: '2026-09-11',
  judgedThrough: '2026-09-09',
  rule: 'everyLessonDay',
  semester: { id: 'sem1', nameLo: 'ພາກຮຽນທີ 1', nameEn: 'Semester 1' },
  rows: [teacher()],
  summary: {
    owed: 200,
    recorded: 167,
    onTime: 132,
    late: 28,
    missing: 21,
    notYetDue: 7,
    lateRate: 17.5,
    avgHoursLate: 50,
    teachersLate: 10,
    unjudged: 0,
  },
  ...over,
});

function mockApi(payload: RecordTimeliness) {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/semesters/active') return { id: 'sem1', startDate: '2026-08-17' } as never;
    return payload as never;
  });
}

afterEach(() => vi.restoreAllMocks());

describe('the punctuality report', () => {
  beforeEach(() => mockApi(report()));

  it('defaults to the term to date rather than making the office pick dates', () => {
    renderWithProviders(<TimelinessReport kind="attendance" />);

    // No `from`/`to` — the API fills the term in, so opening the tab answers the
    // question that is asked almost every time.
    expect(apiClient.get).toHaveBeenCalledWith('/attendances/timeliness', { params: {} });
  });

  it('leads with the rate and says what it is a rate of', async () => {
    renderWithProviders(<TimelinessReport kind="attendance" />);

    expect(await screen.findByText('17.5%')).toBeInTheDocument();
    // 132 on time + 28 late — not the 200 owed, which would understate it.
    expect(screen.getByText('of 160 judged')).toBeInTheDocument();
  });

  it('keeps what is not yet due out of the verdict', async () => {
    renderWithProviders(<TimelinessReport kind="attendance" />);

    // A lesson taught this morning and written this afternoon is neither late nor
    // punctual yet, and is reported as its own number.
    expect(await screen.findByText('7 not yet due')).toBeInTheDocument();
  });

  it('says how far it can honestly judge', async () => {
    renderWithProviders(<TimelinessReport kind="attendance" />);

    expect(
      await screen.findByText(/Judged through 09\/09\/2026 only/),
    ).toBeInTheDocument();
  });

  it('reads lateness in days once it passes a day', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TimelinessReport kind="attendance" />);

    // 144.8 hours is six days, and nobody divides that in their head.
    expect(await screen.findByText('6 d 1 h')).toBeInTheDocument();

    await user.click(screen.getByText('ຊາຍແສງ ພັນວິໄຊ'));
    const detail = await screen.findByText('Lessons filed late');
    // The class already carries its grade, so `m7` is not pasted in front of it.
    expect(within(detail.closest('td')!).getByText('ມ.7/ຂ')).toBeInTheDocument();
    expect(within(detail.closest('td')!).queryByText(/m7/)).not.toBeInTheDocument();
  });

  it('shows the days nobody filed at all, next to the late ones', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TimelinessReport kind="attendance" />);

    await user.click(await screen.findByText('ຊາຍແສງ ພັນວິໄຊ'));
    expect(await screen.findByText('Days never filed')).toBeInTheDocument();
    expect(screen.getByText('04/09/2026')).toBeInTheDocument();
  });
});

describe('the behaviour register, which owes nothing', () => {
  it('drops the missing columns rather than showing them empty', async () => {
    mockApi(
      report({
        rule: 'entriesOnly',
        rows: [teacher({ owed: null, missing: null, missingDates: [] })],
        summary: { ...report().summary, owed: null, missing: null },
      }),
    );
    renderWithProviders(<TimelinessReport kind="behavior" />);

    // Scoped to the header row: "Late" is also a stat card above the table.
    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Late' })).toBeInTheDocument(),
    );
    // Nothing is owed, so a gap is not a thing that can exist — a column of
    // dashes would invite the office to chase one.
    expect(screen.queryByRole('columnheader', { name: 'Owed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Never filed' })).not.toBeInTheDocument();
    expect(screen.queryByText('of 200 owed')).not.toBeInTheDocument();
  });
});

describe('honesty about an unfilled calendar', () => {
  it('warns when the calendar could give no deadline', async () => {
    mockApi(report({ summary: { ...report().summary, unjudged: 14 } }));
    renderWithProviders(<TimelinessReport kind="attendance" />);

    expect(
      await screen.findByText(/14 lesson\(s\) could not be judged/),
    ).toBeInTheDocument();
  });
});
