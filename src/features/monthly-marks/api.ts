import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';

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
  entries: ({ studentId: string } & Partial<MonthCells>)[];
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
