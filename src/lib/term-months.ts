/**
 * The calendar months a term spans, and the day bounds of one of them.
 *
 * Shared by the attendance summary and the behaviour tally, which offer the same
 * "whole term / one month / these dates" narrowing over the same semester dates.
 * A second implementation would be a second place for the UTC handling below to
 * be got wrong.
 */

/** One calendar month of a term, keyed `yyyy-MM` so two Septembers cannot collide. */
export interface TermMonth {
  key: string;
  year: number;
  month: number;
}

/**
 * The months a term spans, first to last.
 *
 * Read off the term's own dates rather than the settings' month rule, so a term
 * the office extended is offered in full. UTC accessors, because the bounds are
 * stored at UTC midnight and a local read west of UTC would lose the first day.
 */
export function monthsOf(
  startDate: string | undefined,
  endDate: string | undefined,
): TermMonth[] {
  if (!startDate || !endDate) return [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: TermMonth[] = [];
  for (
    let year = start.getUTCFullYear(), month = start.getUTCMonth() + 1;
    year < end.getUTCFullYear() ||
    (year === end.getUTCFullYear() && month <= end.getUTCMonth() + 1);
    month === 12 ? ((year += 1), (month = 1)) : (month += 1)
  ) {
    months.push({ key: `${year}-${String(month).padStart(2, '0')}`, year, month });
  }
  return months;
}

/** `yyyy-MM-dd` for a UTC date, which is how the API takes its bounds. */
export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A month as the two inclusive day bounds an endpoint takes.
 *
 * Day 0 of the next month is the last day of this one, read in UTC like the
 * bounds themselves — which is what keeps a 28-, 30- and 31-day month from
 * needing three cases.
 */
export function monthBounds(term: TermMonth): { from: string; to: string } {
  return {
    from: isoDay(term.year, term.month, 1),
    to: isoDay(term.year, term.month, new Date(Date.UTC(term.year, term.month, 0)).getUTCDate()),
  };
}
