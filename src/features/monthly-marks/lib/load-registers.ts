import { attendancesApi } from '@/features/attendances/api';
import { conductDeductionsApi } from '@/features/conduct-deductions/api';
import type { ClassMonthSheet as ClassMonthData } from '../api';
import type { StudentRegisterExtras } from './class-month-workbook';

/**
 * The two columns the mark sheet borrows, read at the moment of export — by the
 * class summary and by the parent letter alike, so the two print the same figures.
 *
 * Fetched on the click rather than with the page: neither register is on screen
 * here, and a tab most people only read should not pull the discipline ledger
 * and the roll on every open. Both are per-class reads the API already serves —
 * nothing is counted on this side.
 *
 * Counted over different windows on purpose. ຄະແນນຄຸນສົມບັດ is a year's budget of
 * 100 that runs to the last day of the year, which is the only window the
 * discipline ledger has; ວັນຂາດ belongs to the month the sheet is headed with,
 * so the roll is asked for that month. A student the registers do not answer for — one who has left, and so is
 * off the roll both are built from — is left out rather than defaulted, and
 * their cells print empty.
 */
export async function loadRegisters(
  sheet: ClassMonthData,
  schoolYearId: string | undefined,
): Promise<Map<string, StudentRegisterExtras>> {
  const [conduct, attendance] = await Promise.all([
    schoolYearId
      ? conductDeductionsApi.classroomStanding(sheet.classroom.id, schoolYearId)
      : Promise.resolve([]),
    attendancesApi.classroomSummary(sheet.classroom.id, sheet.semester.id, sheet.month),
  ]);

  const absences = new Map(attendance.map((row) => [row.studentId, row]));
  const registers = new Map<string, StudentRegisterExtras>();

  for (const row of conduct) {
    const roll = absences.get(row.studentId);
    registers.set(row.studentId, {
      deducted: row.deducted,
      remaining: row.remaining,
      // ວັນຂາດ as the API already reads them: ຄອບ is excused and sick together,
      // and ບໍ່ຄອບ carries one day for every three late arrivals.
      excusedAbsences: roll?.absentExcused ?? 0,
      unexcusedAbsences: roll?.absentUnexcused ?? 0,
      daysRecorded: roll?.totalRecorded ?? 0,
    });
  }

  return registers;
}
