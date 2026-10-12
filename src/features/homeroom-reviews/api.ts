import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, get, post, put } from '@/lib/api-client';
import { saveBlob } from '@/lib/save-blob';
import { cleanParams } from '@/lib/utils';

/**
 * ການຕິດຕາມນັກຮຽນຂອງຄູປະຈຳຫ້ອງ — the ວັນພຸດ/ວັນສຸກ review.
 *
 * Two screens from one module, and they are deliberately different shapes. The
 * teacher's is a *sheet*: one room, one review day, a shortlist of children and
 * one button. The office's is a *grid*: every room against every review day, so
 * "who has stopped looking at their class" is one glance and not a report to
 * assemble by hand.
 *
 * Not `createCrudApi`: nothing here is a list of records being maintained. The
 * sheet is derived on read and the confirmation is an act, so each call is named
 * after what it does.
 */

export type HomeroomReviewAction =
  | 'none'
  | 'watching'
  | 'warned_student'
  | 'met_student'
  | 'contacted_guardian'
  | 'referred_discipline';

export type GuardianContactChannel = 'phone' | 'telegram' | 'in_person' | 'letter';

/** The one action that claims a guardian was reached — mirrors the API. */
export const CONTACTING_ACTIONS: HomeroomReviewAction[] = ['contacted_guardian'];

export const REVIEW_ACTIONS: HomeroomReviewAction[] = [
  'none',
  'watching',
  'warned_student',
  'met_student',
  'contacted_guardian',
  'referred_discipline',
];

export const CONTACT_CHANNELS: GuardianContactChannel[] = [
  'phone',
  'telegram',
  'in_person',
  'letter',
];

export type ReviewDayStatus = 'confirmed' | 'late' | 'missing' | 'pending';

export type AnomalyKind = 'absence' | 'late' | 'attendance_rate' | 'behavior' | 'conduct';
export type AnomalyScope = 'window' | 'term';

export interface AnomalyReason {
  kind: AnomalyKind;
  /** Raised by the days since the last review, or by the term to date. */
  scope: AnomalyScope;
  value: number;
  threshold: number;
}

/**
 * The rows behind a flag — what a badge cannot say.
 *
 * "ຂາດລວມ 9 ວັນ" tells a teacher something is wrong and nothing about what to
 * tell the guardian: which days, in whose lesson, written up for what. The API
 * sends them with the sheet so the answer is on this screen rather than three
 * menus away.
 */
export interface StudentEvidence {
  attendance: {
    date: string;
    status: 'absent' | 'late' | 'excused' | 'sick' | 'present';
    subjectNameLo: string | null;
    period: number;
    /** ເຫດຜົນ — what the teacher wrote when marking the roll; often empty. */
    reason: string | null;
    /** Minutes late; only meaningful when `status` is `late`. */
    minutesLate: number | null;
    /** Falls in the stretch since the last review — what is new this time. */
    inWindow: boolean;
  }[];
  behavior: {
    date: string;
    subjectNameLo: string | null;
    teacherName: string | null;
    behavior: string | null;
    action: string | null;
    inWindow: boolean;
  }[];
  conduct: {
    date: string;
    ruleCode: string;
    ruleNameLo: string;
    points: number;
    note: string | null;
  }[];
  /** Rows left out by the cap, per source. */
  more: { attendance: number; behavior: number; conduct: number };
}

/** A child on the shortlist, with the counts behind every reason. */
export interface FlaggedStudent {
  evidence: StudentEvidence;
  studentId: string;
  studentCode: string | null;
  studentNameLo: string | null;
  studentNickname: string | null;
  rollNumber: number | null;
  reasons: AnomalyReason[];
  /** `act` when the term has something to say, `watch` when only this week does. */
  severity: 'watch' | 'act';
  window: {
    absentUnexcused: number;
    late: number;
    absentExcused: number;
    behaviorEntries: number;
    behaviorWithAction: number;
  };
  term: {
    absentUnexcused: number;
    late: number;
    absentExcused: number;
    attendanceRate: number;
    behaviorEntries: number;
    behaviorWithAction: number;
    conductRemaining: number | null;
  };
}

export interface SheetClassroom {
  id: string;
  name: string;
  gradeLevelCode: string | null;
  teacherId: string | null;
  teacherCode: string | null;
  teacherName: string | null;
  studentsOnRoll: number;
}

export interface ReviewStudentLine {
  studentId: string;
  studentCode: string | null;
  studentNameLo: string | null;
  reasons: AnomalyReason[];
  action: HomeroomReviewAction;
  contactChannel: GuardianContactChannel | null;
  note: string | null;
}

/** A review as filed, plus what it is worth against today's deadline. */
export interface FiledReview {
  id: string;
  classroomId: string;
  teacherId: string;
  dueDate: string;
  windowStart: string;
  windowEnd: string;
  reviewedAt: string;
  studentsOnRoll: number;
  studentsFlagged: number;
  students: ReviewStudentLine[];
  note: string | null;
  status: ReviewDayStatus;
  hoursLate: number;
}

export interface ReviewThresholds {
  window: { absentDays: number; lates: number; behaviorEntries: number };
  term: {
    absentDays: number;
    lates: number;
    behaviorEntries: number;
    attendanceRateBelow: number;
    conductPointsBelow: number;
  };
}

export interface HomeroomReviewSheet {
  classroom: SheetClassroom;
  semester: { id: string; nameLo: string; nameEn: string | null };
  /** `null` before the term's first review day. */
  reviewDay: {
    date: string;
    /** The stretch the sheet accounts for — since the previous review. */
    windowStart: string;
    windowEnd: string;
    /** ISO of noon on the next working day. */
    deadline: string | null;
  } | null;
  status: ReviewDayStatus;
  /**
   * Every review day the term has owed for this room, with where each stands —
   * what the day picker offers, so a day the office counts as missing can still
   * be opened and filed.
   */
  days: ReviewDayCell[];
  thresholds: ReviewThresholds;
  studentsOnRoll: number;
  flagged: FlaggedStudent[];
  review: FiledReview | null;
  previousReview: FiledReview | null;
}

/** One room on the teacher's own list of what is outstanding. */
export interface MyHomeroom {
  classroom: SheetClassroom;
  reviewDay: string | null;
  status: ReviewDayStatus;
  missingDays: string[];
  lastReviewedAt: string | null;
  flagged: number;
}

export interface ReviewDayCell {
  date: string;
  status: ReviewDayStatus;
  reviewedAt: string | null;
  hoursLate: number;
  studentsFlagged: number;
  studentsActioned: number;
  guardiansContacted: number;
}

export interface ComplianceRow {
  classroomId: string;
  classroomName: string;
  gradeLevelCode: string | null;
  teacherId: string | null;
  teacherCode: string | null;
  teacherName: string | null;
  studentsOnRoll: number;
  days: ReviewDayCell[];
  due: number;
  confirmed: number;
  late: number;
  missing: number;
  pending: number;
  reviewRate: number;
  onTimeRate: number;
  lastReviewedAt: string | null;
  studentsFlagged: number;
  studentsActioned: number;
  guardiansContacted: number;
}

export interface ReviewCompliance {
  startDate: string;
  endDate: string;
  asOf: string;
  semester: { id: string; nameLo: string; nameEn: string | null } | null;
  reviewDays: { date: string; windowStart: string; windowEnd: string; deadline: string | null }[];
  rows: ComplianceRow[];
  summary: {
    classrooms: number;
    due: number;
    confirmed: number;
    late: number;
    missing: number;
    pending: number;
    reviewRate: number;
    classroomsBehind: number;
    teachersBehind: number;
    classroomsUnassigned: number;
    guardiansContacted: number;
  };
}

export interface ConfirmReviewPayload {
  classroomId: string;
  dueDate?: string;
  students?: {
    studentId: string;
    action: HomeroomReviewAction;
    contactChannel?: GuardianContactChannel;
    note?: string;
  }[];
  note?: string;
}

export interface ComplianceParams extends Record<string, unknown> {
  from?: string;
  to?: string;
  semesterId?: string;
  classroomId?: string;
  teacherId?: string;
  outstandingOnly?: boolean;
}

// ── ຮ່າງບົດສະຫຼຸບຄູປະຈຳຫ້ອງ — the monthly report ────────────────────────────

interface ReportNamed {
  studentId: string;
  studentCode: string | null;
  studentNameLo: string;
}

/**
 * The homeroom teacher's monthly report, filled from the records.
 *
 * Read-only: every row is derived from the roll call, the register, the
 * discipline ledger, the reviews and the monthly marks. What the system does not
 * hold — ສະພາບລວມ, extra classes, outside activities, ຂໍ້ສະເໜີ — is written in
 * the Word export, which leaves blank rows for it.
 */
export interface MonthlyReport {
  classroom: {
    id: string;
    name: string;
    gradeLevelCode: string | null;
    teacherName: string | null;
  };
  semester: { id: string; number: number; nameLo: string | null };
  month: number;
  monthNameLo: string;
  from: string;
  to: string;
  overview: { students: number; female: number };
  absence: {
    totalDays: number;
    excusedDays: number;
    unexcusedDays: number;
    lateDays: number;
    notable: (ReportNamed & {
      days: number;
      excused: number;
      unexcused: number;
      reasons: string;
    })[];
    lates: (ReportNamed & { lates: number; days: number; reasons: string })[];
  };
  behavior: (ReportNamed & { entries: number; behaviors: string })[];
  deductions: (ReportNamed & { points: number; reasons: string })[];
  discipline: (ReportNamed & { levelLabel: string; handledAt: string; reason: string })[];
  tests: {
    subjects: { id: string; nameLo: string; testMax: number; target: number }[];
    below: (ReportNamed & { scores: (number | null)[] })[];
    tested: number;
  };
  guardianContacts: (ReportNamed & { date: string; content: string })[];
  year: number;
  /** The teacher's own four sections — what no other screen records. */
  entry: MonthlyReportEntry;
  submission: MonthlyReportSubmission;
  /** The figures are the copy taken when it was sent, not today's. */
  isSnapshot: boolean;
  /** The room's current roll — who the teacher's rows may name. */
  roster: ReportNamed[];
}

export interface MonthlyReportEntry {
  overview: string | null;
  extraClasses: {
    studentId: string;
    studentNameLo: string | null;
    subject: string;
    teacherName: string | null;
  }[];
  outsideActivities: {
    studentId: string;
    studentNameLo: string | null;
    date: string | null;
    detail: string;
  }[];
  suggestions: string | null;
}

/** On time, late, not sent and overdue, or not sent with time left — mirrors the API. */
export type MonthlyReportStatus = 'submitted' | 'late' | 'missing' | 'pending';

export interface MonthlyReportSubmission {
  status: MonthlyReportStatus;
  /** The 5th of the next month, as a calendar date. */
  dueDate: string;
  opensAt: string;
  canSubmit: boolean;
  firstSubmittedAt: string | null;
  lastSubmittedAt: string | null;
  daysLate: number;
  hasDraft: boolean;
}

export type SaveMonthlyReportPayload = MonthlyReportParams & {
  overview?: string;
  extraClasses: { studentId: string; subject: string; teacherName?: string }[];
  outsideActivities: { studentId: string; date?: string; detail: string }[];
  suggestions?: string;
};

export interface MonthlyReportCompliance {
  semester: { id: string; nameLo: string | null };
  months: { year: number; month: number; monthNameLo: string; dueDate: string }[];
  rows: {
    classroomId: string;
    classroomName: string;
    gradeLevelCode: string | null;
    teacherName: string | null;
    cells: {
      year: number;
      month: number;
      status: MonthlyReportStatus;
      dueDate: string;
      firstSubmittedAt: string | null;
      daysLate: number;
    }[];
  }[];
  summary: Record<MonthlyReportStatus, number>;
}

export type MonthlyReportParams = {
  classroomId: string;
  month: number;
  semesterId?: string;
};

/** Saves the Word file under the name the API gives it. */
async function downloadMonthlyReport(params: MonthlyReportParams): Promise<void> {
  const response = await apiClient.get<Blob>('/homeroom-reviews/monthly-report/docx', {
    params: cleanParams(params),
    responseType: 'blob',
  });
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  saveBlob(
    response.data,
    match ? decodeURIComponent(match[1]) : `homeroom-report-${params.month}.docx`,
  );
}

export const homeroomReviewsApi = {
  monthlyReport: (params: MonthlyReportParams) =>
    get<MonthlyReport>('/homeroom-reviews/monthly-report', { params: cleanParams(params) }),
  downloadMonthlyReport,
  saveMonthlyReport: (payload: SaveMonthlyReportPayload) =>
    put<MonthlyReport>('/homeroom-reviews/monthly-report', payload),
  submitMonthlyReport: (payload: SaveMonthlyReportPayload) =>
    post<MonthlyReport>('/homeroom-reviews/monthly-report/submit', payload),
  monthlyReportCompliance: (semesterId?: string) =>
    get<MonthlyReportCompliance>('/homeroom-reviews/monthly-report/compliance', {
      params: cleanParams({ semesterId }),
    }),
  sheet: (classroomId: string, dueDate?: string) =>
    get<HomeroomReviewSheet>('/homeroom-reviews/sheet', {
      params: cleanParams({ classroomId, dueDate }),
    }),
  mine: () => get<MyHomeroom[]>('/homeroom-reviews/mine'),
  compliance: (params: ComplianceParams = {}) =>
    get<ReviewCompliance>('/homeroom-reviews/compliance', { params: cleanParams(params) }),
  confirm: (payload: ConfirmReviewPayload) => post<FiledReview>('/homeroom-reviews', payload),
  amend: (id: string, payload: Omit<ConfirmReviewPayload, 'classroomId' | 'dueDate'>) =>
    put<FiledReview>(`/homeroom-reviews/${id}`, payload),
};

export function useMonthlyReport(params: Partial<MonthlyReportParams>) {
  return useQuery({
    queryKey: ['homeroom-reviews', 'monthly-report', params],
    queryFn: () => homeroomReviewsApi.monthlyReport(params as MonthlyReportParams),
    enabled: Boolean(params.classroomId && params.month),
  });
}

/** Saves the draft, or sends it; either way the screen shows what the API returns. */
export function useSaveMonthlyReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submit, ...payload }: SaveMonthlyReportPayload & { submit: boolean }) =>
      submit
        ? homeroomReviewsApi.submitMonthlyReport(payload)
        : homeroomReviewsApi.saveMonthlyReport(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['homeroom-reviews', 'monthly-report'] });
    },
  });
}

export function useMonthlyReportCompliance(semesterId?: string) {
  return useQuery({
    queryKey: ['homeroom-reviews', 'monthly-report', 'compliance', semesterId ?? null],
    queryFn: () => homeroomReviewsApi.monthlyReportCompliance(semesterId),
  });
}

export function useDownloadMonthlyReport() {
  return useMutation({ mutationFn: homeroomReviewsApi.downloadMonthlyReport });
}

/** The teacher's own rooms — an office account gets an empty list, not the school. */
export function useMyHomerooms() {
  return useQuery({
    queryKey: ['homeroom-reviews', 'mine'],
    queryFn: homeroomReviewsApi.mine,
  });
}

export function useReviewSheet(classroomId: string | undefined, dueDate?: string) {
  return useQuery({
    queryKey: ['homeroom-reviews', 'sheet', classroomId, dueDate ?? null],
    queryFn: () => homeroomReviewsApi.sheet(classroomId!, dueDate),
    enabled: Boolean(classroomId),
  });
}

export function useReviewCompliance(params: ComplianceParams) {
  return useQuery({
    queryKey: ['homeroom-reviews', 'compliance', params],
    queryFn: () => homeroomReviewsApi.compliance(params),
    // Keeps the previous window on screen while the next loads, so paging back
    // through the term does not blank the grid on every click.
    placeholderData: (previous) => previous,
  });
}

/**
 * Confirming, and amending, invalidate the same three reads.
 *
 * The sheet, the teacher's own list and the office's grid are three views of one
 * fact, so a confirmation that refreshed only the sheet would leave the banner
 * still asking for a review that has just been filed.
 */
export function useConfirmReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: homeroomReviewsApi.confirm,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homeroom-reviews'] }),
  });
}

export function useAmendReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: { id: string } & Omit<ConfirmReviewPayload, 'classroomId' | 'dueDate'>) =>
      homeroomReviewsApi.amend(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['homeroom-reviews'] }),
  });
}

/**
 * `ມ.1/ກ` — the class, as the school writes it.
 *
 * A room's own `name` at this school already carries its grade (`ມ.1/ກ`, `ມ.5`),
 * and the grade's `code` is latin (`m1`), so prefixing unconditionally produces
 * `m1/ມ.1/ກ` — which is what the coverage and punctuality screens were showing.
 * The digits are the test: they are the one part the two spellings share.
 */
export function roomLabel(
  room:
    | Pick<SheetClassroom, 'name' | 'gradeLevelCode'>
    | Pick<ComplianceRow, 'classroomName' | 'gradeLevelCode'>,
): string {
  const name = 'name' in room ? room.name : room.classroomName;
  return qualifyClassName(name, room.gradeLevelCode);
}

/** Shared with the coverage and punctuality reports, which label the same rooms. */
export function qualifyClassName(name: string, gradeLevelCode: string | null): string {
  if (!gradeLevelCode) return name;
  const digits = gradeLevelCode.replace(/\D/g, '');
  if (digits && name.includes(digits)) return name;
  return `${gradeLevelCode}/${name}`;
}
