import { describe, expect, it } from 'vitest';
import type { AttendanceSummary } from '@/features/attendances/api';
import { attendanceTotals, classAttendanceRow } from './attendance-summary';

const student = (overrides: Partial<AttendanceSummary> = {}): AttendanceSummary => ({
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

const room = { id: 'r1', label: 'ມ.1/ກ', headcount: 3 };

describe('classAttendanceRow', () => {
  it('adds up the students as the API counted them, without converting lates again', () => {
    // Three children late once each: one late apiece, no day absent between them.
    const row = classAttendanceRow(
      room,
      [1, 2, 3].map(() => student({ totalRecorded: 10, late: 1, lateRemainder: 1 })),
      15,
    );

    expect(row.lateRemainder).toBe(3);
    expect(row.absentUnexcused).toBe(0);
    expect(row.attendanceRate).toBe(100);
  });

  it('takes the rate over the class’s records, not the mean of the students’ rates', () => {
    const row = classAttendanceRow(
      room,
      [
        student({ totalRecorded: 90, absentUnexcused: 0 }),
        student({ totalRecorded: 10, absentUnexcused: 10, absentTotal: 10 }),
      ],
      15,
    );

    // (100 − 10) / 100, where the mean of 100% and 0% would say 50%.
    expect(row.attendanceRate).toBe(90);
  });

  it('counts the students at or over the threshold', () => {
    const row = classAttendanceRow(
      room,
      [student({ absentTotal: 15 }), student({ absentTotal: 14 }), student({ absentTotal: 30 })],
      15,
    );

    expect(row.overThreshold).toBe(2);
  });

  it('reads a class nobody has marked as zero, not as a perfect record', () => {
    const row = classAttendanceRow(room, [], 15);

    expect(row.totalRecorded).toBe(0);
    expect(row.attendanceRate).toBe(0);
    expect(row.headcount).toBe(3);
  });
});

describe('attendanceTotals', () => {
  it('sums the classes and takes the rate over the school', () => {
    const totals = attendanceTotals([
      classAttendanceRow(room, [student({ totalRecorded: 100, absentUnexcused: 2 })], 15),
      classAttendanceRow(
        { id: 'r2', label: 'ມ.1/ຂ', headcount: 4 },
        [student({ totalRecorded: 300, absentUnexcused: 30, absentTotal: 30 })],
        15,
      ),
    ]);

    expect(totals.headcount).toBe(7);
    expect(totals.totalRecorded).toBe(400);
    expect(totals.absentUnexcused).toBe(32);
    expect(totals.overThreshold).toBe(1);
    expect(totals.attendanceRate).toBe(92);
  });
});
