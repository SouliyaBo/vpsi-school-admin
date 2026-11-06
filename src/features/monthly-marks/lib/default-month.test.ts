import { describe, expect, it } from 'vitest';
import { markingMonth, monthInTerm } from './default-month';

const FIRST_TERM = [9, 10, 11];
const SECOND_TERM = [2, 3, 4];

/** The month a mark page opens on, on a given day, for a term's months. */
const opensOn = (date: string, months: number[]) =>
  monthInTerm(markingMonth(new Date(`${date}T08:00:00`)), months);

describe('the month a mark page opens on', () => {
  it('stays on the month behind until the 5th', () => {
    expect(opensOn('2026-10-01', FIRST_TERM)).toBe(9);
    expect(opensOn('2026-11-04', FIRST_TERM)).toBe(10);
    expect(opensOn('2026-11-05', FIRST_TERM)).toBe(11);
    expect(opensOn('2027-05-04', SECOND_TERM)).toBe(4);
  });

  it('reads the 1st of January as December', () => {
    expect(markingMonth(new Date('2027-01-03T08:00:00'))).toBe(12);
  });

  it('lands on the last month once the term has stopped collecting', () => {
    expect(opensOn('2026-12-03', FIRST_TERM)).toBe(11);
    expect(opensOn('2026-12-20', FIRST_TERM)).toBe(11);
    expect(opensOn('2027-01-20', FIRST_TERM)).toBe(11);
    expect(opensOn('2027-05-20', SECOND_TERM)).toBe(4);
  });

  it('lands on the first month when the term has not started collecting', () => {
    // August is not marked: the first days of September open on ກັນຍາ.
    expect(opensOn('2026-09-02', FIRST_TERM)).toBe(9);
    expect(opensOn('2027-02-03', SECOND_TERM)).toBe(2);
    expect(opensOn('2027-01-20', SECOND_TERM)).toBe(2);
  });

  it('leaves a month the term collects alone', () => {
    expect(monthInTerm(10, FIRST_TERM)).toBe(10);
    expect(monthInTerm(7, [])).toBe(7);
  });
});
