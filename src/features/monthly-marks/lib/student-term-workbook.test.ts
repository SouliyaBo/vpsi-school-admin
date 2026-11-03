import { describe, expect, it } from 'vitest';
import { termRegisters } from './student-term-workbook';

describe('termRegisters — the conduct and absence columns of the term sheet', () => {
  const ledger = (entries: [string, number][]) => ({
    baseScore: 100,
    entries: entries.map(([date, points]) => ({ date, points })),
  });

  it('counts a second term’s ເຫຼືອ against points lost in the first', () => {
    // The budget is the school year's, from September: what October took is
    // still gone in February.
    const result = termRegisters(
      [1, 2, 3],
      9,
      null,
      ledger([
        ['2025-10-06', 10],
        ['2026-02-17', 5],
      ]),
    );

    expect(result.months.map((line) => [line.deducted, line.remaining])).toEqual([
      [0, 90],
      [5, 85],
      [0, 85],
    ]);
    expect(result.term).toMatchObject({ deducted: 5, remaining: 85 });
  });

  it('leaves a register it could not read empty, rather than zero', () => {
    const result = termRegisters([9, 10], 9, [null, { total: 3, unexcused: 1 }], null);

    expect(result.months[0]).toEqual({
      absentTotal: null,
      absentUnexcused: null,
      deducted: null,
      remaining: null,
    });
    expect(result.months[1]).toMatchObject({ absentTotal: 3, absentUnexcused: 1 });
    // The sum is over the months that have a figure.
    expect(result.threeMonth).toMatchObject({ absentTotal: 3, deducted: null });
    expect(result.exam).toEqual({
      absentTotal: 0,
      absentUnexcused: 0,
      deducted: null,
      remaining: null,
    });
  });
});
