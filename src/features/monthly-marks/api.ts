import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';
import type { Grade } from '@/types/enums';

/**
 * ຄະແນນປະຈຳເດືອນ — the school's own mark sheet, out of 10.
 *
 * Not the weighted-component API (`/scores`): this is the paper form every
 * teacher keeps — ຂື້ນຫ້ອງ 1, ປື້ມ 1, ກິດຈະກຳ 2, ກວດກາ 6 a month — and it is read
 * as a hierarchy: month → ສະເລ່ຍ across strands → 3 ເດືອນ → ພາກຮຽນ → ໝົດປີ.
 *
 * Every figure above the four columns is derived by the API on read rather than
 * stored, so a corrected cell moves the term mark and the year with it. The
 * client's only arithmetic is the running ລວມ under the fingers of whoever is
 * typing, which has to update before a round trip could answer.
 */

export const MARK_COLUMNS = ['attendance', 'notebook', 'activity', 'test'] as const;
export type MarkColumn = (typeof MARK_COLUMNS)[number];

/** `null` is "not written yet", which is not a mark of zero. */
export type MonthCells = Record<MarkColumn, number | null>;

export interface StrandCell {
  /** `null` for a subject marked as a whole. */
  strand: string | null;
  cells: MonthCells;
  /** ລວມ, out of 10. */
  total: number | null;
  /**
   * ເຫດຜົນ — what the teacher wrote beside the marks, and what the letter home
   * prints under the subject. Absent from an older API.
   */
  remark?: string | null;
  isLocked: boolean;
}

interface StudentIdentity {
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  studentNickname: string | null;
  rollNumber: number | null;
  /** False for a student who has left; the school keeps them on the sheet. */
  isEnrolled: boolean;
}

export interface SubjectHeader {
  id: string;
  code: string;
  nameLo: string;
  nameEn: string | null;
  /** ຟີຊິກ / ເຄມີ / ຊີວະ — empty for a subject marked as a whole. */
  strands: string[];
  /** What the subject is out of — a month, its exam, its term: 10, or 9. */
  fullMark: number;
}

export interface ClassroomHeader {
  id: string;
  name: string;
  gradeLevelCode: string | null;
  /** Whose name heads the paper sheet, whoever is marking it. */
  homeroomTeacherName: string | null;
}

export interface SemesterHeader {
  id: string;
  number: number;
  nameLo: string;
  nameEn: string | null;
}

export interface MonthGridRow extends StudentIdentity {
  strands: StrandCell[];
}

/** `GET /monthly-marks/month` — what the entry form is drawn from. */
export interface MonthGrid {
  subject: SubjectHeader;
  classroom: ClassroomHeader;
  semester: SemesterHeader;
  /** The months this term collects, so the picker needs no copy of the rule. */
  months: number[];
  month: number;
  columnMax: Record<MarkColumn, number>;
  /**
   * The columns this subject is actually marked on.
   *
   * ພູມສາດ, ສຶກສາພົນລະເມືອງ and ປະຫວັດສາດ keep no ປື້ມ at ມ.1–ມ.3, ມ.5 and ມ.6,
   * so the form drops the cell rather than offering one the save refuses. Absent
   * from an older API, which marks every subject on all four.
   */
  columns?: MarkColumn[];
  canEdit: boolean;
  rows: MonthGridRow[];
}

export interface SheetMonth {
  month: number;
  strands: StrandCell[];
  /** ສະເລ່ຍ across the strands, or the single total. */
  score: number | null;
  isComplete: boolean;
}

export interface SheetRow extends StudentIdentity {
  months: SheetMonth[];
  threeMonth: number | null;
  threeMonthComplete: boolean;
  examScore: number | null;
  bonus: number | null;
  /** ພາກຮຽນ — `null` until the months and the exam are both in. */
  semesterMark: number | null;
  isPassing: boolean | null;
}

/** `GET /monthly-marks/semester` — the term as the paper lays it out. */
export interface SemesterSheet {
  subject: SubjectHeader;
  classroom: ClassroomHeader;
  semester: SemesterHeader;
  months: number[];
  columnMax: Record<MarkColumn, number>;
  canEdit: boolean;
  rows: SheetRow[];
  summary: {
    students: number;
    marked: number;
    passed: number;
    failed: number;
    /** Still waiting on a month or the exam. */
    incomplete: number;
    average: number | null;
  };
}

export interface AnnualRow extends StudentIdentity {
  /** ພາກຮຽນ I and II, in term order. */
  semesterMarks: (number | null)[];
  annual: number | null;
  isPassing: boolean | null;
}

/** `GET /monthly-marks/annual` — ໝົດປີ, derived from the two terms. */
export interface AnnualSheet {
  subject: SubjectHeader;
  classroom: ClassroomHeader;
  semesters: SemesterHeader[];
  rows: AnnualRow[];
}

/** One column of the monthly summary — a subject the grade is marked in. */
export interface MonthSubjectHeader {
  id: string;
  code: string;
  nameLo: string;
  nameEn: string | null;
  /** What the subject is out of: 10, or 9 for ພາສາລາວ and the social subjects. */
  fullMark: number;
  /** What ກວດກາ is out of: 6, or 5 for those same subjects. */
  testMax: number;
}

/** ຈັດປະເພດ — ເກັ່ງ / ກາງ / ອ່ອນ, banded by the API on the office's own cuts. */
export type MonthlyBand = 'strong' | 'middling' | 'weak';

/** Where the school cuts those bands, in the 10-point mark the sheet is written in. */
export interface MonthlyBandCuts {
  strongFrom: number;
  weakBelow: number;
}

export interface ClassMonthRow extends StudentIdentity {
  /** One mark per subject, in the order the columns are listed. */
  scores: (number | null)[];
  /** ກວດກາ alone, out of 6, per subject — the parent report's own line. */
  testScores: (number | null)[];
  /**
   * ເຫດຜົນ per subject, as the teacher wrote it on the entry form — what the
   * letter home prints under each subject. Absent from an older API, which kept
   * no remark at all and left the office to type one at every export.
   */
  remarks?: (string | null)[];
  /** The letter for each subject's ລວມ, banded by the API like the average's. */
  subjectGrades: (Grade | null)[];
  /** ລວມ — the marks as written, before they are divided. */
  total: number | null;
  /** ສະເລ່ຍ — ລວມ over the subjects the grade sits, not over the ones marked. */
  average: number | null;
  /** False while any subject of the grade is still unmarked. */
  isComplete: boolean;
  subjectsRecorded: number;
  /**
   * ເກຣດ — the school's band for the average, `null` until the month is
   * finished. An average divided by subjects that are not all marked would band
   * low for a reason that is not the student's marks.
   */
  grade: Grade | null;
  /**
   * ຈັດປະເພດ — the band the month puts the student in, `null` until it is
   * finished, for the same reason ເກຣດ is withheld.
   */
  classification: MonthlyBand | null;
  /** ລຳດັບ within the class; `null` for a student with nothing recorded. */
  rank: number | null;
  isPassing: boolean | null;
}

/** `GET /monthly-marks/class-month` — ສະຫຼຸບປະຈຳເດືອນ for a whole class. */
export interface ClassMonthSheet {
  classroom: ClassroomHeader;
  semester: SemesterHeader;
  month: number;
  months: number[];
  /** The ຈັດປະເພດ cuts this sheet was banded on, as settings had them. */
  bands: MonthlyBandCuts;
  subjects: MonthSubjectHeader[];
  rows: ClassMonthRow[];
  summary: {
    students: number;
    marked: number;
    passed: number;
    failed: number;
    incomplete: number;
    average: number | null;
  };
}

/** One month of one student, as the summary ranks it. */
export interface StudentMonthSummary {
  month: number;
  /** One mark per subject, in the order the columns are listed. */
  scores: (number | null)[];
  /** ກວດກາ alone, out of 6, per subject — the parent report's own line. Absent from an older API. */
  testScores?: (number | null)[];
  /** The letter for each subject's ລວມ, banded by the API like the average's. Absent from an older API. */
  subjectGrades?: (Grade | null)[];
  /** ລວມ — the marks as written, before they are divided. */
  total: number | null;
  /** ສະເລ່ຍ — ລວມ over the subjects the grade sits, not over the ones marked. */
  average: number | null;
  isComplete: boolean;
  subjectsRecorded: number;
  /** ເກຣດ, `null` until the month is finished. */
  grade: Grade | null;
  /** ລຳດັບ within the class that month. */
  rank: number | null;
  /** How many of the class were ranked — what ລຳດັບ is out of. */
  rankedStudents: number;
  isPassing: boolean | null;
}

/** One subject across the term, as the term sheet lays it out. */
export interface StudentSubjectRow {
  subject: MonthSubjectHeader;
  /** Aligned with `months`. */
  monthScores: (number | null)[];
  threeMonth: number | null;
  threeMonthComplete: boolean;
  examScore: number | null;
  bonus: number | null;
  semesterMark: number | null;
  /** The letter for ພາກຮຽນ, banded as a month's ລວມ is. Absent from an older API. */
  semesterGrade?: Grade | null;
  isPassing: boolean | null;
}

/**
 * `GET /monthly-marks/student` — one child's term, both ways round.
 *
 * `classroom` is `null` for a student the register has not placed this year,
 * which is an ordinary state rather than an error: the rest comes back empty.
 */
export interface StudentMonthlySheet {
  classroom: ClassroomHeader | null;
  semester: SemesterHeader;
  rollNumber: number | null;
  isEnrolled: boolean;
  months: number[];
  subjects: MonthSubjectHeader[];
  monthly: StudentMonthSummary[];
  subjectRows: StudentSubjectRow[];
  summary: {
    subjects: number;
    monthsRecorded: number;
    /** ລວມ of the term marks as written. Absent from an older API. */
    termTotal?: number | null;
    /** How many subjects have a ພາກຮຽນ figure — what ຈຳນວນວິຊາ says. */
    termSubjectsRecorded?: number;
    /** ສະເລ່ຍ across the term marks. */
    termAverage: number | null;
    termComplete: boolean;
    /** ເກຣດ for the term, `null` until every subject has its ພາກຮຽນ. Absent from an older API. */
    termGrade?: Grade | null;
    /** False for a student who has left the room the marks were earned in. */
    onRoster?: boolean;
  };
}

export interface SaveMarksResult {
  saved: number;
  skipped: number;
  errors: { studentId: string; reason: string }[];
}

/** `Record` so `cleanParams` can walk it, as `ListParams` is. */
export interface SheetTarget extends Record<string, unknown> {
  subjectId: string;
  classroomId: string;
  semesterId?: string;
}

export interface SaveMonthGridInput extends SheetTarget {
  month: number;
  strand?: string;
  entries: ({ studentId: string; remark?: string | null } & Partial<MonthCells>)[];
  overrideReason?: string;
}

export interface SaveTermMarksInput extends SheetTarget {
  entries: { studentId: string; examScore?: number | null; bonus?: number | null }[];
  overrideReason?: string;
}

export const monthlyMarksApi = {
  monthGrid: (target: SheetTarget & { month: number }) =>
    get<MonthGrid>('/monthly-marks/month', { params: cleanParams(target) }),

  semesterSheet: (target: SheetTarget) =>
    get<SemesterSheet>('/monthly-marks/semester', { params: cleanParams(target) }),

  annualSheet: (target: Record<string, unknown>) =>
    get<AnnualSheet>('/monthly-marks/annual', { params: cleanParams(target) }),

  classMonth: (target: Record<string, unknown>) =>
    get<ClassMonthSheet>('/monthly-marks/class-month', { params: cleanParams(target) }),

  studentMonths: (target: Record<string, unknown>) =>
    get<StudentMonthlySheet>('/monthly-marks/student', { params: cleanParams(target) }),

  saveMonth: (body: SaveMonthGridInput) => post<SaveMarksResult>('/monthly-marks/month', body),

  saveTerm: (body: SaveTermMarksInput) => post<SaveMarksResult>('/monthly-marks/term', body),

  lockMonth: (body: SheetTarget & { month: number; strand?: string }) =>
    post<{ affected: number }>('/monthly-marks/month/lock', body),

  unlockMonth: (body: SheetTarget & { month: number; strand?: string; reason: string }) =>
    post<{ affected: number }>('/monthly-marks/month/unlock', body),
};

const ready = (target: Partial<SheetTarget>) => Boolean(target.subjectId && target.classroomId);

export function useMonthGrid(target: Partial<SheetTarget> & { month: number }) {
  return useQuery({
    queryKey: ['monthly-marks', 'month', target],
    queryFn: () => monthlyMarksApi.monthGrid(target as SheetTarget & { month: number }),
    enabled: ready(target),
  });
}

export function useSemesterSheet(target: Partial<SheetTarget>) {
  return useQuery({
    queryKey: ['monthly-marks', 'semester', target],
    queryFn: () => monthlyMarksApi.semesterSheet(target as SheetTarget),
    enabled: ready(target),
  });
}

export function useAnnualSheet(target: {
  subjectId?: string;
  classroomId?: string;
  schoolYearId?: string;
}) {
  return useQuery({
    queryKey: ['monthly-marks', 'annual', target],
    queryFn: () => monthlyMarksApi.annualSheet(target),
    enabled: Boolean(target.subjectId && target.classroomId),
  });
}

export function useClassMonth(target: {
  classroomId?: string;
  month: number;
  semesterId?: string;
}) {
  return useQuery({
    queryKey: ['monthly-marks', 'class-month', target],
    queryFn: () => monthlyMarksApi.classMonth(target),
    enabled: Boolean(target.classroomId),
  });
}

/**
 * One student's months, for their own page.
 *
 * `enabled` so the tab pays for itself only when it is opened — the read costs
 * the whole class's marks, since ລຳດັບ cannot be worked out from one row.
 */
export function useStudentMonths(
  studentId: string | undefined,
  semesterId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ['monthly-marks', 'student', studentId, semesterId],
    queryFn: () => monthlyMarksApi.studentMonths({ studentId, semesterId }),
    enabled: Boolean(studentId) && enabled,
  });
}

/** Every write invalidates the whole feature: a cell moves the term and the year. */
function useMarkMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    meta: successMessage ? { successMessage } : { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monthly-marks'] }),
  });
}

export function useSaveMonthGrid() {
  return useMarkMutation((body: SaveMonthGridInput) => monthlyMarksApi.saveMonth(body));
}

export function useSaveTermMarks() {
  return useMarkMutation((body: SaveTermMarksInput) => monthlyMarksApi.saveTerm(body));
}

export function useLockMonth() {
  return useMarkMutation(
    (body: SheetTarget & { month: number; strand?: string }) => monthlyMarksApi.lockMonth(body),
    'toast.updated',
  );
}

export function useUnlockMonth() {
  return useMarkMutation(
    (body: SheetTarget & { month: number; strand?: string; reason: string }) =>
      monthlyMarksApi.unlockMonth(body),
    'toast.updated',
  );
}

/**
 * ລວມ as the teacher types, before any round trip.
 *
 * A blank cell counts as zero — the paper does the same — but a row with nothing
 * written at all has no total, which is what keeps "not marked yet" visible.
 */
export function localTotal(cells: MonthCells): number | null {
  const written = MARK_COLUMNS.filter((column) => cells[column] !== null);
  if (written.length === 0) return null;
  return Math.round(written.reduce((sum, column) => sum + (cells[column] ?? 0), 0) * 100) / 100;
}

/** What a month, an exam and a term are out of, unless the subject says 9. */
export const MARK_MAX = 10;

/**
 * ຜ່ານ for a mark out of `fullMark` — half of it: 5 of 10, 4.5 of 9.
 *
 * The office's ruling for the 9-point subjects (20 Oct 2026): their pass and
 * grade are a share of 9. An average across subjects is judged on 10.
 */
export function passingMarkFor(fullMark: number = MARK_MAX): number {
  return fullMark / 2;
}

/** Whether a mark is under its subject's pass line — what the sheets shade red. */
export function isBelowPass(mark: number | null, fullMark: number = MARK_MAX): boolean {
  return mark !== null && mark < passingMarkFor(fullMark);
}

/**
 * A mark in whole tenths, half up: 9.45 → 95, 4.44 → 44.
 *
 * Marks are typed to the hundredth, so the figure is first settled to its
 * hundredths and only then halved into tenths — in plain floating point 9.45 is
 * 9.4499999…, and rounding that directly would take the half down.
 */
function toTenths(mark: number): number {
  return Math.round(Math.round(mark * 100) / 10);
}

/**
 * ລວມ as the sheet is read out — one decimal place, not the arithmetic figure.
 *
 * The office writes a month's total to one place, half up: 9.45 goes up to 9.5,
 * 4.44 down to 4.4 (their ruling of 20 Oct 2026; before that it was a whole
 * mark). This rounds on the way to the screen only. The cells keep the two
 * places they were typed with, and `localTotal` and every figure the API derives
 * from it — ສະເລ່ຍ, 3 ເດືອນ, ພາກຮຽນ, ໝົດປີ — keep their decimals, because
 * rounding on the way *in* is what once cost a student the pass mark; the note at
 * the top of the API's `monthly-grading.ts` has the case.
 */
export function displayTotal(total: number | null): number | null {
  return total === null ? null : toTenths(total) / 10;
}

/** `displayTotal` as text, so a 9 still reads 9.0 beside a 9.5. */
export function formatTotal(total: number | null): string | null {
  return displayTotal(total)?.toFixed(1) ?? null;
}

/**
 * ລວມ across a month's subjects, as the sheet adds it up.
 *
 * The subject columns print to one place, so this adds the printed marks rather
 * than rounding their exact sum: a row printing 9.5 + 9.5 + 8.5 + 8.5 has to
 * come to 36.0, not the 35.90 its hundredths made. ສະເລ່ຍ stays the API's,
 * worked out from the exact figures — which is why it is not always this divided
 * by the number of subjects, and why ເກຣດ, ລຳດັບ and ຜ່ານ/ຕົກ do not move.
 */
export function displaySubjectTotal(scores: (number | null)[]): number | null {
  const written = scores.filter((score): score is number => score !== null);
  if (written.length === 0) return null;
  return written.reduce((sum, score) => sum + toTenths(score), 0) / 10;
}
