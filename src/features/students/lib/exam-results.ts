import type { Gender, StudentStatus } from '@/types/enums';
import type { Headcount } from './district-report';

/**
 * ຜົນການສອບເສັງປະຈຳເດືອນ — the second table of ຮ່າງລາຍງານເມືອງ: per grade, how
 * many sat the month's tests and how they came out, ລ and ຍ, with each as a
 * share of the grade's whole roll.
 *
 * Read off ສະຫຼຸບປະຈຳເດືອນ (`GET /monthly-marks/class-month`), one sheet per
 * class, so the figures cannot disagree with the sheets the school already reads
 * out. The rows, as the office defined them (14 Oct 2026):
 *
 * - ສອບເສັງໄດ້ສົມບູນ — every subject of the grade at 5 or above;
 * - ສອບເສັງຫຼຸດຄາດໝາຍ — sat, but at least one subject below 5 (or unmarked);
 * - ເສັງໄດ້ທັງໝົດ — the month's average at 5 or above, so it also takes in a
 *   child who failed a subject but passed overall.
 *
 * ສົມບູນ + ຫຼຸດຄາດໝາຍ = ມີໜ້າສອບເສັງ, as on the office's sheet.
 */

export const EXAM_ROWS = ['students', 'sat', 'fullPass', 'belowTarget', 'passed'] as const;
export type ExamRow = (typeof EXAM_ROWS)[number];

/** Rows that carry a ຄິດເປັນ % — the first two are what the others are out of. */
export const EXAM_PERCENT_ROWS: readonly ExamRow[] = ['fullPass', 'belowTarget', 'passed'];

export type ExamFigures = Record<ExamRow, Headcount>;

/** Same as `PASSING_MARK` in the API's monthly-grading.ts. */
export const PASSING_MARK = 5;

/** One child's line of a ສະຫຼຸບປະຈຳເດືອນ sheet — only what the count reads. */
export interface ExamSheetRow {
  studentId: string;
  isEnrolled: boolean;
  /** Each subject's ລວມ out of 10, `null` when unmarked. */
  scores: (number | null)[];
  /** ກວດກາ per subject — a mark here is what "sat" means. */
  testScores: (number | null)[];
  /** The month's average at the pass mark; `null` while a subject is unmarked. */
  isPassing: boolean | null;
}

export interface ExamStudent {
  status: StudentStatus;
  gender: Gender | null | undefined;
  gradeLevelId: string | null;
}

const zero = (): Headcount => ({ total: 0, female: 0 });

export function emptyExamFigures(): ExamFigures {
  return Object.fromEntries(EXAM_ROWS.map((row) => [row, zero()])) as ExamFigures;
}

/**
 * Counts the sheets into the table.
 *
 * ຈ/ນ ນັກຮຽນທັງໝົດ is the same roll as ນ/ຮ ປະຈຸບັນ in the table above — an
 * `active` child, still in the class — so the two tables agree; a child who has
 * left, been suspended or declined the certificate is not counted at all.
 */
export function countExamResults(
  rows: ExamSheetRow[],
  students: Map<string, ExamStudent>,
  gradeLevelIds: string[],
): Map<string, ExamFigures> {
  const figures = new Map(gradeLevelIds.map((id) => [id, emptyExamFigures()]));
  for (const row of rows) {
    const student = students.get(row.studentId);
    if (!row.isEnrolled || !student || student.status !== 'active') continue;
    const grade = student.gradeLevelId ? figures.get(student.gradeLevelId) : undefined;
    if (!grade) continue;

    const add = (key: ExamRow) => {
      grade[key].total += 1;
      if (student.gender === 'female') grade[key].female += 1;
    };
    add('students');
    if (!row.testScores.some((score) => score !== null)) continue;
    add('sat');
    const allPassed =
      row.scores.length > 0 && row.scores.every((score) => score !== null && score >= PASSING_MARK);
    add(allPassed ? 'fullPass' : 'belowTarget');
    if (row.isPassing === true) add('passed');
  }
  return figures;
}

/** A row's share of the grade's whole roll, 0–1; `null` with nobody on the roll. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}
