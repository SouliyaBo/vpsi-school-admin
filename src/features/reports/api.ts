import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { ReportStatus } from '@/types/enums';

/**
 * `GET /reports` — one PDF the API has rendered, or is rendering.
 *
 * A report card with no `studentId` is a class pack: every card of the room in
 * one file. The names come with the row so the list reads without a lookup.
 */
export interface GeneratedReport {
  id: string;
  type: string;
  status: ReportStatus;
  studentId: string | null;
  classroomId: string | null;
  semesterId: string | null;
  params: { students?: number } & Record<string, unknown>;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  requestedBy: string;
  completedAt: string | null;
  createdAt: string;
  classroomName: string | null;
  gradeLevelCode: string | null;
  semesterNameLo: string | null;
  semesterNameEn: string | null;
}

export interface GeneratedReportParams {
  page?: number;
  limit?: number;
  classroomId?: string;
  semesterId?: string;
}

export const reportsApi = {
  list: (params: GeneratedReportParams = {}) =>
    get<PaginatedResponse<GeneratedReport>>('/reports', { params: cleanParams({ ...params }) }),

  /** One PDF for the class; refused with `report.noTermResults` until the term is computed. */
  queueClassPack: (classroomId: string, semesterId: string) =>
    post<{ queued: number; reports: { reportId: string }[] }>('/reports/report-cards/class', {
      classroomId,
      semesterId,
      combined: true,
    }),

  /** A signed link, good for a quarter of an hour. */
  downloadUrl: (id: string) => get<{ url: string }>(`/reports/${id}/download`),

  remove: (id: string) => del(`/reports/${id}`),
};

const isPending = (report: GeneratedReport) =>
  report.status === 'queued' || report.status === 'processing';

/**
 * Generated reports, newest first.
 *
 * Re-asks every few seconds while anything on the page is still being rendered,
 * and stops once nothing is — a class pack takes the worker a little while, and
 * the reader is sitting there waiting for the download button.
 */
export function useGeneratedReports(params: GeneratedReportParams, enabled = true) {
  return useQuery({
    queryKey: ['reports', 'generated', params],
    queryFn: () => reportsApi.list(params),
    enabled,
    placeholderData: (previous) => previous,
    refetchInterval: (query) => (query.state.data?.data.some(isPending) ? 3000 : false),
  });
}

export function useQueueClassPack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classroomId, semesterId }: { classroomId: string; semesterId: string }) =>
      reportsApi.queueClassPack(classroomId, semesterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', 'generated'] }),
  });
}

export function useDeleteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports', 'generated'] }),
  });
}

/**
 * Opens a finished PDF in a new tab.
 *
 * The tab is opened before the link is asked for and pointed at it after:
 * a browser lets a click open a window, but not a promise that settles later,
 * and Safari blocks the second as a pop-up.
 */
export async function openReport(id: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const { url } = await reportsApi.downloadUrl(id);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/**
 * ສະຫຼຸບຜົນການຮຽນປະຈຳເດືອນ — `GET /monthly-marks/standing`.
 *
 * Every band is the API's: ດີ is 7 or more in every subject (7 itself on the
 * 9-point subjects too), ຫຼຸດ is below a subject's pass line (5, or 4.5 of 9), and
 * the shares are over the students whose month is decided.
 */
export type StandingBand = 'top' | 'middle' | 'below' | 'incomplete';

export interface StandingPeriod {
  semesterId: string;
  semesterNumber: number;
  semesterNameLo: string;
  semesterNameEn: string | null;
  month: number;
}

export interface BandTally {
  students: number;
  top: number;
  middle: number;
  below: number;
  incomplete: number;
  decided: number;
  topPercent: number | null;
  middlePercent: number | null;
  belowPercent: number | null;
}

export interface SubjectTally {
  marked: number;
  failed: number;
  top: number;
  failedPercent: number | null;
  topPercent: number | null;
}

export interface StandingSubject {
  nameLo: string;
  nameEn: string | null;
  current: SubjectTally;
  previous: SubjectTally | null;
}

export interface StandingClassroom {
  id: string;
  name: string;
  gradeLevelCode: string | null;
  homeroomTeacherName: string | null;
  current: BandTally;
  previous: BandTally | null;
  subjects: (StandingSubject & { id: string; fullMark: number })[];
}

export interface StandingStudent {
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  studentNickname: string | null;
  rollNumber: number | null;
  classroomId: string;
  band: StandingBand;
  /** `null` with nothing to compare, or when the student was on no sheet then. */
  previousBand: StandingBand | null;
  average: number | null;
  lowest: number | null;
  subjectsMarked: number;
  subjectsExpected: number;
  failing: { subjectId: string; nameLo: string; nameEn: string | null; score: number; fullMark: number }[];
}

export interface MonthlyStanding {
  schoolYearId: string;
  periods: StandingPeriod[];
  current: StandingPeriod;
  previous: StandingPeriod | null;
  topMark: number;
  total: { current: BandTally; previous: BandTally | null };
  classrooms: StandingClassroom[];
  subjects: StandingSubject[];
  students: StandingStudent[];
}

export interface StandingParams {
  semesterId?: string;
  month?: number;
  compareSemesterId?: string;
  compareMonth?: number;
}

export const standingApi = {
  get: (params: StandingParams) =>
    get<MonthlyStanding>('/monthly-marks/standing', { params: cleanParams({ ...params }) }),
};

/** Under `monthly-marks`, so a saved mark refreshes the report like the class sheet. */
export function useMonthlyStanding(params: StandingParams) {
  return useQuery({
    queryKey: ['monthly-marks', 'standing', params],
    queryFn: () => standingApi.get(params),
    placeholderData: (previous) => previous,
  });
}
