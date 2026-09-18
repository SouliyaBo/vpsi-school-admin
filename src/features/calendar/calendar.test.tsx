import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import type { SchoolDay } from '@/types/entities';
import { CalendarPage } from './pages/CalendarPage';

// The office fills this in, so the screen is asserted with the permission to.
vi.mock('@/features/auth/hooks', () => ({ useCan: () => () => true }));

/**
 * ປະຕິທິນໂຮງຮຽນ.
 *
 * What is under test is what the screen is answerable for, which is not the day
 * classification — that is the API's, and is asserted in `school-days.spec.ts`
 * against the school's own dates. Here it is that the office can put the printed
 * sheet beside the screen and see the same thing: the day a closure falls on is
 * painted as closed, the effect on the school day is stated in words rather than
 * left to a colour, and picking a type fills the effect in so nobody has to know
 * that a holiday closes the school and an exam period does not.
 */

const activeYear = {
  id: '507f1f77bcf86cd799439001',
  code: '2026-2027',
  nameLo: 'ສົກຮຽນ 2026-2027',
  startDate: '2026-08-17T00:00:00.000Z',
  endDate: '2027-06-10T00:00:00.000Z',
  isActive: true,
};

const holiday = {
  id: 'evt-holiday',
  titleLo: 'ພັກວັນຄູແຫ່ງຊາດ',
  titleEn: "Holiday for Teachers' Day",
  type: 'holiday' as const,
  dayEffect: 'closed' as const,
  startDate: '2026-10-07T00:00:00.000Z',
  endDate: '2026-10-07T00:00:00.000Z',
};

const examWeek = {
  id: 'evt-exam',
  titleLo: 'ສອບເສັງກາງພາກ (ພາຍໃນ)',
  titleEn: 'Internal Midterm Exams',
  type: 'exam' as const,
  dayEffect: 'no_classes' as const,
  startDate: '2026-12-08T00:00:00.000Z',
  endDate: '2026-12-15T00:00:00.000Z',
};

/** Two closures and one ordinary day — enough to tell the three states apart. */
const SCHOOL_DAYS: SchoolDay[] = [
  {
    date: '2026-10-06',
    state: 'teaching',
    isTeachingDay: true,
    isWorkingDay: true,
    isHalfDay: false,
    events: [],
  },
  {
    date: '2026-10-07',
    state: 'closed',
    isTeachingDay: false,
    isWorkingDay: false,
    isHalfDay: false,
    events: [holiday],
  },
  {
    date: '2026-12-08',
    state: 'no_classes',
    isTeachingDay: false,
    isWorkingDay: true,
    isHalfDay: false,
    events: [examWeek],
  },
];

function mockApi() {
  vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/school-years/active') return activeYear as never;
    if (url === '/calendar/school-days') return SCHOOL_DAYS as never;
    if (url === '/calendar') return paginated([holiday, examWeek]) as never;
    return paginated([]) as never;
  });
}

beforeEach(mockApi);
afterEach(() => vi.restoreAllMocks());

describe('the school calendar', () => {
  it('reads the school year rather than the calendar year', async () => {
    renderWithProviders(<CalendarPage />);

    // 17 Aug – 10 Jun, because the sheet runs across the turn of the year and a
    // January–December grid would cut the school year in half.
    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/calendar/school-days', {
        params: { from: '2026-08-17', to: '2027-06-10' },
      });
    });
  });

  it('counts the year in teaching days, days without classes, and closures', async () => {
    renderWithProviders(<CalendarPage />);

    // The three numbers every other menu counts against.
    expect(await screen.findByText('1 teaching days')).toBeInTheDocument();
    expect(screen.getByText('1 without classes')).toBeInTheDocument();
    expect(screen.getByText('1 closed')).toBeInTheDocument();
  });

  it('says in words what each event does to the school day', async () => {
    renderWithProviders(<CalendarPage />);

    // A colour says a day is unusual; only this says whether a lesson was owed.
    const closure = await screen.findByText('ພັກວັນຄູແຫ່ງຊາດ');
    expect(within(closure.closest('li')!).getByText('School closed')).toBeInTheDocument();

    const exams = screen.getByText('ສອບເສັງກາງພາກ (ພາຍໃນ)');
    expect(within(exams.closest('li')!).getByText('No classes')).toBeInTheDocument();
  });

  it('shows what a day is before offering to change it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    // A click is a look, not an edit: the day in words, then the event on it.
    await user.click(await screen.findByLabelText(/^2026-12-08/));

    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent('Tuesday 8 December 2026');
    // Once for the day, once for the event that made it so.
    expect(within(drawer).getAllByText('No classes')).toHaveLength(2);
    expect(within(drawer).getByText('ສອບເສັງກາງພາກ (ພາຍໃນ)')).toBeInTheDocument();
    expect(drawer).toHaveTextContent('08/12/2026 – 15/12/2026');
    expect(within(drawer).queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('opens the covering event for editing from the day', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    await user.click(await screen.findByLabelText(/^2026-12-08/));
    const drawer = await screen.findByRole('dialog');
    await user.click(within(drawer).getByRole('button', { name: 'Edit' }));

    // The exam period is eight days long; editing from any of them has to reach
    // the one event — the whole period, not the single day that was clicked.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit event');
    expect(within(dialog).getByLabelText(/Title \(Lao\)/)).toHaveValue('ສອບເສັງກາງພາກ (ພາຍໃນ)');
    expect(within(dialog).getByLabelText(/Start date/i)).toHaveValue('2026-12-08');
    expect(within(dialog).getByLabelText(/End date/i)).toHaveValue('2026-12-15');
  });

  it('starts a one-day event on an empty day from the day', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    await user.click(await screen.findByLabelText(/^2026-10-06$/));
    const drawer = await screen.findByRole('dialog');
    expect(drawer).toHaveTextContent('Teaching day');
    expect(drawer).toHaveTextContent('Nothing is filed on this day.');
    await user.click(within(drawer).getByRole('button', { name: 'Add an event on this day' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Add event');
    expect(within(dialog).getByLabelText(/Start date/i)).toHaveValue('2026-10-06');
    expect(within(dialog).getByLabelText(/End date/i)).toHaveValue('2026-10-06');
  });

  it('fills the effect in from the type, so it is one choice and not two', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CalendarPage />);

    await user.click(await screen.findByRole('button', { name: 'Add event' }));
    const dialog = await screen.findByRole('dialog');

    // An exam period does not close the school — the staff are in and the
    // timetable is suspended. Nobody filing one should have to know that.
    await user.click(within(dialog).getByRole('combobox', { name: /Type/ }));
    await user.click(await screen.findByRole('option', { name: 'Internal / mock exams' }));

    await waitFor(() => {
      expect(
        within(dialog).getByRole('combobox', { name: /Effect on the school day/ }),
      ).toHaveTextContent('No classes');
    });
  });
});
