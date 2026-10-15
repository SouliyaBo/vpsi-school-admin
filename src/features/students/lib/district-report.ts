import type { Gender, StudentStatus } from '@/types/enums';

/**
 * ຮ່າງລາຍງານເມືອງ — the headcount table the school sends the district:
 * per grade, ລ (ລວມ, everybody) and ຍ (ຍິງ, girls), from the start of the year
 * through the movements to today's roll.
 *
 * The system knows today's roll and who has left, but not who arrived from
 * another school or who is repeating the grade — there is no earlier year on
 * file to compare with. So the movements are prefilled where the statuses say
 * something and left to the office where they do not, and `ຕົ້ນປີ` is worked
 * back from today's roll rather than counted: today's roll is the one row the
 * system is sure of, so it is the one the arithmetic must not move.
 *
 * The arithmetic is the office's own sheet's: ປະຈຸບັນ = ຕົ້ນປີ + ຍ້າຍເຂົ້າ
 * − ຍ້າຍອອກ − ປະລະ + ໂຈະການຮຽນ ມາຮຽນຄືນ + ຄ້າງຫ້ອງ. A child suspended
 * this year is counted under ປະລະ (the office's call, 14 Oct 2026).
 *
 * ບໍ່ເອົາໃບປະກາດ children stand outside that arithmetic — not in ຕົ້ນປີ, not
 * in ປະຈຸບັນ — and are added only in the closing ລວມທັງໝົດ, so the report
 * carries both figures (216 and 225 on the staff's sheet of 15 Oct 2026).
 */

export const MOVEMENT_ROWS = [
  'transferIn',
  'transferOut',
  'dropped',
  'suspended',
  'repeating',
] as const;
export type MovementRow = (typeof MOVEMENT_ROWS)[number];

/** +1 adds to the roll, −1 takes from it. */
export const MOVEMENT_SIGN: Record<MovementRow, 1 | -1> = {
  transferIn: 1,
  transferOut: -1,
  dropped: -1,
  // ໂຈະການຮຽນ ມາຮຽນຄືນ: children back from a suspension, so they rejoin the roll.
  suspended: 1,
  repeating: 1,
};

export interface Headcount {
  total: number;
  female: number;
}

export interface GradeColumn {
  gradeLevelId: string;
  /** `ມ.1` — the heading the sheet prints. */
  label: string;
  /** 1 for ມ.1 … 7 for ມ.7 — splits ມ.ຕົ້ນ from ມ.ປາຍ. */
  level: number;
}

/** ມ.ຕົ້ນ is ມ.1–ມ.4, ມ.ປາຍ ມ.5–ມ.7 — the Lao school system's split. */
export const LAST_LOWER_SECONDARY_LEVEL = 4;

/** Every figure for one grade. `current` is counted; the rest are movements. */
export interface GradeFigures {
  current: Headcount;
  movements: Record<MovementRow, Headcount>;
  /** ບໍ່ເອົາໃບປະກາດ — counted, but outside ຕົ້ນປີ and ປະຈຸບັນ. */
  noCertificate: Headcount;
}

export interface DistrictReportStudent {
  status: StudentStatus;
  gender: Gender | null | undefined;
  gradeLevelId: string | null;
  /** ວັນທີໂຈະການຮຽນ, ISO; only a `suspended` child has one. */
  suspendedAt?: string | null;
  /** What a `suspended` child was suspended from. */
  statusBeforeSuspension?: StudentStatus | null;
}

/** The span the report's movements fall in, as ISO dates; both ends count. */
export interface ReportYear {
  startDate: string;
  endDate: string;
}

const day = (iso: string) => iso.slice(0, 10);

interface SchoolYearDates {
  startDate: string;
  endDate: string;
}

/**
 * The span a movement must fall in to be this year's: from the day after the
 * previous school year ended, not from opening day — a child who stops coming
 * over the holidays is still on this year's ຕົ້ນປີ and leaves it under ປະລະ
 * (the office's call, 15 Oct 2026). With no earlier year on file, it is the
 * school year itself.
 */
export function reportYear(active: SchoolYearDates, years: SchoolYearDates[]): ReportYear {
  const previousEnd = years
    .map((year) => day(year.endDate))
    .filter((end) => end < day(active.startDate))
    .sort()
    .at(-1);
  if (!previousEnd) return { startDate: active.startDate, endDate: active.endDate };
  const next = new Date(`${previousEnd}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { startDate: next.toISOString(), endDate: active.endDate };
}

/**
 * Whether a suspension is this year's. Undated ones are not: a child suspended
 * in an earlier year is still `suspended`, and only the date tells them apart.
 */
function suspendedThisYear(student: DistrictReportStudent, year: ReportYear | null): boolean {
  if (!student.suspendedAt) return false;
  if (!year) return true;
  const on = day(student.suspendedAt);
  return on >= day(year.startDate) && on <= day(year.endDate);
}

/** Suspended children with no date on file — left out of the count until dated. */
export function undatedSuspensions(students: DistrictReportStudent[]): number {
  return students.filter((student) => student.status === 'suspended' && !student.suspendedAt)
    .length;
}

const zero = (): Headcount => ({ total: 0, female: 0 });

/** Which row a status lands in; `null` for a status the table does not count. */
function rowFor(status: StudentStatus): 'current' | 'noCertificate' | MovementRow | null {
  switch (status) {
    case 'active':
      return 'current';
    case 'no_certificate':
      return 'noCertificate';
    case 'transferred':
      return 'transferOut';
    case 'dropped':
      return 'dropped';
    case 'suspended':
      // The office reports a suspended child under ປະລະ; the ໂຈະການຮຽນ
      // ມາຮຽນຄືນ row is for children who came back, which no status records,
      // so it is entered by hand. The office's call, 14 Oct 2026.
      return 'dropped';
    default:
      // `new` is not on the roll yet; `graduated` left at the end of a year.
      return null;
  }
}

/** Counts the roster into the table; a child with no grade is not counted. */
export function countDistrictReport(
  students: DistrictReportStudent[],
  grades: GradeColumn[],
  year: ReportYear | null = null,
): Map<string, GradeFigures> {
  const figures = new Map<string, GradeFigures>(
    grades.map((grade) => [
      grade.gradeLevelId,
      {
        current: zero(),
        noCertificate: zero(),
        movements: Object.fromEntries(MOVEMENT_ROWS.map((row) => [row, zero()])) as Record<
          MovementRow,
          Headcount
        >,
      },
    ]),
  );
  for (const student of students) {
    const grade = student.gradeLevelId ? figures.get(student.gradeLevelId) : undefined;
    const row = rowFor(student.status);
    if (!grade || !row) continue;
    if (student.status === 'suspended' && !suspendedThisYear(student, year)) continue;
    // A child who had already declined the certificate is not reported as a
    // suspension when they stop coming — the office's rule, 15 Oct 2026.
    if (student.status === 'suspended' && student.statusBeforeSuspension === 'no_certificate') {
      continue;
    }
    const cell = row === 'current' || row === 'noCertificate' ? grade[row] : grade.movements[row];
    cell.total += 1;
    if (student.gender === 'female') cell.female += 1;
  }
  return figures;
}

/** ຕົ້ນປີ, worked back from today's roll. */
export function startOfYear(figures: GradeFigures): Headcount {
  const start = { ...figures.current };
  for (const row of MOVEMENT_ROWS) {
    start.total -= MOVEMENT_SIGN[row] * figures.movements[row].total;
    start.female -= MOVEMENT_SIGN[row] * figures.movements[row].female;
  }
  return start;
}

/** ລວມທັງໝົດ: today's roll with the ບໍ່ເອົາໃບປະກາດ children added back. */
export function everyone(figures: GradeFigures): Headcount {
  return {
    total: figures.current.total + figures.noCertificate.total,
    female: figures.current.female + figures.noCertificate.female,
  };
}
