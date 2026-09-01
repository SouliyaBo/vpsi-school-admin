import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';
import { MAX_PAGE_SIZE, type PaginatedResponse } from '@/types/common';

/**
 * ຜົນການຮຽນປະຈຳພາກ — every subject a student took, in one record.
 *
 * The term result is *derived*: the API recomputes it from the marks on request
 * and stores the outcome, so nothing here is entered by hand. What the screen
 * offers is therefore the three verbs the office actually has — compute, read,
 * publish — rather than a form.
 *
 * Marks are stored out of 100 because that is what ranks a class and averages
 * across subjects; this school marks out of 10, so the screen divides. See
 * `toTenPoint`.
 */

export interface TermResultComponent {
  /** `null` for a line of the monthly sheet — ກັນຍາ and ສອບເສັງພາກ are columns. */
  componentId: string | null;
  nameLo: string;
  score: number | null;
  maxScore: number;
  weight: number;
  weightedScore: number;
}

export interface TermResultSubject {
  subjectId: string;
  subjectNameLo: string;
  credits: number;
  components: TermResultComponent[];
  /** Out of 100, whichever instrument the subject was marked with. */
  percentage: number;
  grade: string;
  gradePoint: number;
  isPassed: boolean;
  /** A month or the exam is still missing — the result cannot be published. */
  isIncomplete: boolean;
}

export interface TermResult {
  id: string;
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  semesterId: string;
  classroomId: string;
  subjects: TermResultSubject[];
  average: number;
  gpa: number;
  grade: string;
  rank: number | null;
  totalStudents: number | null;
  subjectsPassed: number;
  subjectsFailed: number;
  conductGrade: string | null;
  daysPresent: number;
  daysAbsent: number;
  daysLate: number;
  daysExcused: number;
  /** Computed from marks that are not all in yet; held back from publication. */
  isProvisional: boolean;
  /**
   * A mark has changed since this was computed, so the stored figure is already
   * out of date. Held back from publication until the class is recomputed.
   */
  isStale: boolean;
  /** When the first change since the last computation landed. */
  staleSince: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  /** When publication was last withdrawn because a recomputation moved figures. */
  unpublishedAt: string | null;
  computedAt: string | null;
}

export interface ComputeSummary {
  classroomId: string;
  semesterId: string;
  studentsProcessed: number;
  provisionalCount: number;
  /**
   * Published results the recomputation moved. They are no longer published and
   * have to be released again deliberately.
   */
  withdrawn: number;
  skipped: { studentId: string; reason: string }[];
}

export interface PublishSummary {
  published: number;
  /** Provisional and stale results together. */
  withheld: number;
  /** Of those, the ones a mark changed under since the last computation. */
  withheldStale: number;
}

export interface ClassTarget extends Record<string, unknown> {
  classroomId: string;
  semesterId: string;
}

export const termResultsApi = {
  list: (params: Record<string, unknown>) =>
    get<PaginatedResponse<TermResult>>('/term-results', { params: cleanParams(params) }),

  computeSync: (body: ClassTarget) => post<ComputeSummary>('/term-results/compute-sync', body),

  publish: (body: ClassTarget) => post<PublishSummary>('/term-results/publish', body),
};

/**
 * One classroom's results for a term, ranked.
 *
 * The whole class in one page: the sheet ranks and averages across it, so a
 * second page would be a sheet that adds up to the wrong thing. `MAX_PAGE_SIZE`
 * is the API's hard cap and asking past it is a 400 — the largest class here is
 * a third of it.
 */
export function useClassTermResults(target: Partial<ClassTarget>) {
  return useQuery({
    queryKey: ['term-results', 'class', target],
    queryFn: () =>
      termResultsApi.list({ ...target, limit: MAX_PAGE_SIZE, sortBy: 'rank', sortOrder: 'asc' }),
    enabled: Boolean(target.classroomId && target.semesterId),
  });
}

export function useComputeTermResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClassTarget) => termResultsApi.computeSync(body),
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['term-results'] }),
  });
}

export function usePublishTermResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClassTarget) => termResultsApi.publish(body),
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['term-results'] }),
  });
}

/** What this school's marks are out of; the API stores them as percentages. */
export const MARK_SCALE = 10;

/**
 * A stored percentage read back as the school's own mark.
 *
 * 83.1 was entered as 8.31 and is printed as 8.31; the percentage exists so a
 * class can be ranked and a GPA taken across subjects however they were marked.
 * The report card does the same thing server-side — see `toMarkScale` in the PDF
 * renderer.
 */
export function toTenPoint(percentage: number | null | undefined): number | null {
  if (percentage === null || percentage === undefined) return null;
  return Math.round(((percentage * MARK_SCALE) / 100) * 100) / 100;
}
