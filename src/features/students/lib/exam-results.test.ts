import { describe, expect, it } from 'vitest';
import { countExamResults, share, type ExamSheetRow, type ExamStudent } from './exam-results';

const student = (gender: 'male' | 'female', status: ExamStudent['status'] = 'active') => ({
  status,
  gender,
  gradeLevelId: 'm2',
});

const row = (
  studentId: string,
  scores: (number | null)[],
  isPassing: boolean | null,
  sat = true,
): ExamSheetRow => ({
  studentId,
  isEnrolled: true,
  scores,
  testScores: scores.map((score) => (sat && score !== null ? 3 : null)),
  isPassing,
});

describe('countExamResults', () => {
  it('sorts each child into the office’s rows', () => {
    const students = new Map<string, ExamStudent>([
      ['all-pass', student('female')],
      ['one-fail-passes', student('male')],
      ['fails', student('female')],
      ['absent', student('male')],
      ['incomplete', student('male')],
      ['suspended', student('male', 'suspended')],
    ]);
    const figures = countExamResults(
      [
        row('all-pass', [6, 7, 5, 8], true),
        // 4.5 in one subject, but the average clears 5: below target, yet passed.
        row('one-fail-passes', [4.5, 7, 6, 8], true),
        row('fails', [3, 4, 5, 2], false),
        row('absent', [null, null, null, null], null, false),
        // Half marked: sat, not yet a full pass, not yet passed either.
        row('incomplete', [6, null, 7, 8], null),
        row('suspended', [9, 9, 9, 9], true),
      ],
      students,
      ['m2'],
    ).get('m2')!;

    expect(figures.students).toEqual({ total: 5, female: 2 });
    expect(figures.sat).toEqual({ total: 4, female: 2 });
    expect(figures.fullPass).toEqual({ total: 1, female: 1 });
    expect(figures.belowTarget).toEqual({ total: 3, female: 1 });
    expect(figures.passed).toEqual({ total: 2, female: 1 });
  });

  it('leaves out a child who has left the class', () => {
    const figures = countExamResults(
      [{ ...row('gone', [6, 6, 6, 6], true), isEnrolled: false }],
      new Map([['gone', student('male')]]),
      ['m2'],
    ).get('m2')!;
    expect(figures.students.total).toBe(0);
  });
});

describe('share', () => {
  it('is out of the whole roll, and nothing when there is no roll', () => {
    expect(share(43, 44)).toBeCloseTo(0.9773, 4);
    expect(share(0, 0)).toBeNull();
  });
});
