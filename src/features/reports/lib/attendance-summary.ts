import type { AttendanceSummary } from '@/features/attendances/api';

/**
 * ສະຫຼຸບການມາຮຽນທັງໂຮງຮຽນ — one row per class, added up from the per-student
 * summaries the API already counts.
 *
 * The API applies the school's rule per student (every three lates are a day
 * absent, excused + sick are one column), so a class is only ever the sum of its
 * students' figures. Adding the raw lates of a class and converting them once
 * would turn three children late once each into a day absent that none of them
 * has — which is why nothing here converts anything.
 */
export interface ClassAttendanceRow {
  classroomId: string;
  /** ມ.1/ກ, as the sheet heads the class. */
  label: string;
  /** Students on the roll, whether or not anything was recorded for them. */
  headcount: number;
  /** Rows the roll holds for the class over the window. */
  totalRecorded: number;
  /** Lates not yet made into an absence. */
  lateRemainder: number;
  absentExcused: number;
  absentUnexcused: number;
  absentTotal: number;
  /** Students whose ລວມວັນຂາດ reached the threshold. */
  overThreshold: number;
  /** The same rate the student rows carry, over the whole class; 0 with nothing recorded. */
  attendanceRate: number;
}

export type AttendanceTotals = Omit<ClassAttendanceRow, 'classroomId' | 'label'>;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** What was recorded, less the days the school counts as missed without reason. */
function rate(totalRecorded: number, absentUnexcused: number): number {
  return totalRecorded > 0
    ? round2(((totalRecorded - absentUnexcused) / totalRecorded) * 100)
    : 0;
}

export function classAttendanceRow(
  classroom: { id: string; label: string; headcount: number },
  students: AttendanceSummary[],
  threshold: number,
): ClassAttendanceRow {
  const sum = (pick: (row: AttendanceSummary) => number) =>
    students.reduce((total, row) => total + pick(row), 0);

  const totalRecorded = sum((row) => row.totalRecorded);
  const absentUnexcused = sum((row) => row.absentUnexcused);

  return {
    classroomId: classroom.id,
    label: classroom.label,
    headcount: classroom.headcount,
    totalRecorded,
    lateRemainder: sum((row) => row.lateRemainder),
    absentExcused: sum((row) => row.absentExcused),
    absentUnexcused,
    absentTotal: sum((row) => row.absentTotal),
    overThreshold: students.filter((row) => row.absentTotal >= threshold).length,
    attendanceRate: rate(totalRecorded, absentUnexcused),
  };
}

/** The ລວມ row under the classes — sums, with the rate taken over the school, not averaged. */
export function attendanceTotals(rows: ClassAttendanceRow[]): AttendanceTotals {
  const sum = (pick: (row: ClassAttendanceRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  const totalRecorded = sum((row) => row.totalRecorded);
  const absentUnexcused = sum((row) => row.absentUnexcused);

  return {
    headcount: sum((row) => row.headcount),
    totalRecorded,
    lateRemainder: sum((row) => row.lateRemainder),
    absentExcused: sum((row) => row.absentExcused),
    absentUnexcused,
    absentTotal: sum((row) => row.absentTotal),
    overThreshold: sum((row) => row.overThreshold),
    attendanceRate: rate(totalRecorded, absentUnexcused),
  };
}
