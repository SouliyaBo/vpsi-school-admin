import { describe, expect, it } from 'vitest';
import type { StandingStudent } from '../api';
import { bandChanges, parsePeriodKey, periodKey, shareChange } from './monthly-standing';

const student = (overrides: Partial<StandingStudent>): StandingStudent => ({
  studentId: 's',
  studentCode: '0001',
  studentNameLo: 'ນາງ ທົດສອບ',
  studentNickname: null,
  rollNumber: 1,
  classroomId: 'r1',
  band: 'top',
  previousBand: 'top',
  average: 8,
  lowest: 7,
  subjectsMarked: 8,
  subjectsExpected: 8,
  failing: [],
  ...overrides,
});

describe('bandChanges', () => {
  it('splits the students who moved into down and up', () => {
    const fell = student({ studentId: 'a', previousBand: 'top', band: 'middle' });
    const failed = student({ studentId: 'b', previousBand: 'middle', band: 'below' });
    const recovered = student({ studentId: 'c', previousBand: 'below', band: 'middle' });
    const same = student({ studentId: 'd' });

    const { down, up } = bandChanges([fell, failed, recovered, same]);

    expect(down.map((change) => change.student.studentId)).toEqual(['a', 'b']);
    expect(up).toEqual([{ student: recovered, from: 'below', to: 'middle' }]);
  });

  it('leaves out a month that is not finished, either side', () => {
    const { down, up } = bandChanges([
      student({ previousBand: 'incomplete', band: 'below' }),
      student({ previousBand: 'top', band: 'incomplete' }),
      student({ previousBand: null, band: 'below' }),
    ]);
    expect(down).toHaveLength(0);
    expect(up).toHaveLength(0);
  });
});

describe('shareChange', () => {
  it('is the difference in points, or nothing without both', () => {
    expect(shareChange(40, 35.5)).toBe(4.5);
    expect(shareChange(null, 35)).toBeNull();
  });
});

describe('periodKey', () => {
  it('round-trips a month of a term', () => {
    expect(parsePeriodKey(periodKey({ semesterId: 'sem2', month: 2 }))).toEqual({
      semesterId: 'sem2',
      month: 2,
    });
  });
});
