import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, patch, post, upload } from '@/lib/api-client';
import type { ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { LessonActivity, LessonPlan } from '@/types/entities';
import type { LessonPlanStatus } from '@/types/enums';

/**
 * Lesson plans are only half a CRUD resource, so `createCrudApi` is not used.
 *
 * The writes are a workflow — draft, submit, review, mark taught — and the
 * important read is not a list at all: `compliance` inverts the question from
 * "which plans exist" to "which are missing", which no list endpoint can answer.
 */

/** `missing` is not a stored status — it is the absence of a plan. */
export const MISSING = 'missing' as const;
export type ComplianceStatus = LessonPlanStatus | typeof MISSING;

export interface LessonPlanListParams extends ListParams {
  teacherId?: string;
  subjectId?: string;
  classroomId?: string;
  semesterId?: string;
  subjectGroupId?: string;
  /** Any date in the taught week; the API snaps it to the Monday. */
  weekStartDate?: string;
  status?: LessonPlanStatus;
  isLate?: 'true' | 'false';
}

export interface ComplianceParams extends Record<string, unknown> {
  /** Defaults to the active semester. */
  semesterId?: string;
  subjectGroupId?: string;
  teacherId?: string;
  fromWeek?: string;
  toWeek?: string;
}

export interface ComplianceCell {
  weekIndex: number;
  /** `yyyy-MM-dd` Monday — the same key the plan is stored under. */
  weekStartDate: string;
  status: ComplianceStatus;
  planId: string | null;
  isLate: boolean;
  /** What was actually uploaded against the plan. */
  attachmentCount: number;
  activityCount: number;
  completedActivityCount: number;
  dueDate: string;
  /** Nothing reached the reviewer and the deadline has passed. */
  isOverdue: boolean;
}

export interface ComplianceCounts {
  expected: number;
  /** Reached the reviewer: submitted, under review, returned or approved. */
  submitted: number;
  approved: number;
  /** Started but never sent — invisible to the reviewer, so counted apart. */
  draft: number;
  missing: number;
  late: number;
  overdue: number;
  withAttachments: number;
  /** 0–100, one decimal. */
  submissionRate: number;
}

export interface ComplianceRow {
  teachingAssignmentId: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  subjectId: string;
  subjectCode: string;
  subjectNameLo: string;
  subjectNameEn: string | null;
  classroomId: string;
  classroomName: string;
  subjectGroupId: string | null;
  cells: ComplianceCell[];
  summary: ComplianceCounts;
}

export interface ComplianceGroup {
  /** `null` is the bucket for subjects with no department yet. */
  subjectGroup: {
    id: string;
    code: string;
    nameLo: string;
    nameEn: string | null;
    headTeacherName: string | null;
  } | null;
  rows: ComplianceRow[];
  summary: ComplianceCounts;
}

export interface ComplianceMatrix {
  semester: {
    id: string;
    nameLo: string;
    nameEn: string | null;
    startDate: string;
    endDate: string;
  };
  weeks: { index: number; startDate: string; endDate: string }[];
  groups: ComplianceGroup[];
  summary: ComplianceCounts;
}

export interface LessonActivityInput {
  topic: string;
  date: string;
  durationMinutes?: number;
  objectives?: string;
  materials?: string[];
  teachingMethod?: string;
}

/**
 * `weekEndDate` and `dueDate` are absent by design — the API derives the week's
 * end from its Monday and the deadline from school policy, so neither is the
 * client's to send.
 */
export interface CreateLessonPlanInput {
  subjectId: string;
  classroomId: string;
  semesterId: string;
  title: string;
  description?: string;
  /** Any date in the taught week. */
  weekStartDate: string;
  activities?: LessonActivityInput[];
}

export type UpdateLessonPlanInput = Partial<
  Pick<CreateLessonPlanInput, 'title' | 'description' | 'weekStartDate' | 'activities'>
>;

export interface ReviewLessonPlanInput {
  decision: 'approved' | 'returned';
  /** Required when returning — the teacher needs to know what to fix. */
  comment?: string;
}

export interface MarkActivityInput {
  activityId: string;
  isCompleted: boolean;
  reflection?: string;
}

export interface AttachmentUrl {
  filename: string;
  url: string | null;
}

export const lessonPlansApi = {
  list: (params: LessonPlanListParams = {}) =>
    get<PaginatedResponse<LessonPlan>>('/lesson-plans', { params: cleanParams(params) }),

  byId: (id: string) => get<LessonPlan>(`/lesson-plans/${id}`),

  reviewQueue: (params: LessonPlanListParams = {}) =>
    get<PaginatedResponse<LessonPlan>>('/lesson-plans/review-queue', {
      params: cleanParams(params),
    }),

  compliance: (params: ComplianceParams = {}) =>
    get<ComplianceMatrix>('/lesson-plans/compliance', { params: cleanParams(params) }),

  attachments: (id: string) => get<AttachmentUrl[]>(`/lesson-plans/${id}/attachments`),

  create: (body: CreateLessonPlanInput) => post<LessonPlan>('/lesson-plans', body),
  update: (id: string, body: UpdateLessonPlanInput) =>
    patch<LessonPlan>(`/lesson-plans/${id}`, body),

  submit: (id: string) => post<LessonPlan>(`/lesson-plans/${id}/submit`),
  review: (id: string, body: ReviewLessonPlanInput) =>
    post<LessonPlan>(`/lesson-plans/${id}/review`, body),
  markActivity: (id: string, body: MarkActivityInput) =>
    patch<LessonPlan>(`/lesson-plans/${id}/activities`, body),

  addAttachment: (id: string, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<LessonPlan>(`/lesson-plans/${id}/attachments`, formData, onProgress);
  },

  remove: (id: string) => del<void>(`/lesson-plans/${id}`),
};

const KEY = 'lesson-plans';

/** Every read of this feature, so one write can invalidate all of them. */
function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: [KEY] });
}

export function useLessonPlans(params: LessonPlanListParams) {
  return useQuery({
    queryKey: [KEY, 'list', params],
    queryFn: () => lessonPlansApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useLessonPlan(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    queryFn: () => lessonPlansApi.byId(id!),
    enabled: Boolean(id),
  });
}

export function useReviewQueue(params: LessonPlanListParams) {
  return useQuery({
    queryKey: [KEY, 'review-queue', params],
    queryFn: () => lessonPlansApi.reviewQueue(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The compliance matrix.
 *
 * `retry: false` because the endpoint 404s when there is no active semester and
 * none was named — an ordinary state between terms, not a transient failure.
 */
export function useCompliance(params: ComplianceParams, enabled = true) {
  return useQuery({
    queryKey: [KEY, 'compliance', params],
    queryFn: () => lessonPlansApi.compliance(params),
    placeholderData: (previous) => previous,
    enabled,
    retry: false,
  });
}

/** Signed download URLs, minted on read — so they are fetched only when opened. */
export function useLessonPlanAttachments(id: string | undefined) {
  return useQuery({
    queryKey: [KEY, 'attachments', id],
    queryFn: () => lessonPlansApi.attachments(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useCreateLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLessonPlanInput) => lessonPlansApi.create(body),
    meta: { successMessage: 'toast.created' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLessonPlanInput }) =>
      lessonPlansApi.update(id, body),
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useSubmitLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lessonPlansApi.submit(id),
    meta: { successMessage: 'lessonPlan.submitted' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useReviewLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReviewLessonPlanInput }) =>
      lessonPlansApi.review(id, body),
    meta: { successMessage: 'lessonPlan.reviewed' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useMarkActivity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MarkActivityInput }) =>
      lessonPlansApi.markActivity(id, body),
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      file,
      onProgress,
    }: {
      id: string;
      file: File;
      onProgress?: (percent: number) => void;
    }) => lessonPlansApi.addAttachment(id, file, onProgress),
    meta: { successMessage: 'lessonPlan.uploaded' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteLessonPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => lessonPlansApi.remove(id),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

/**
 * Cell colour, decided once so the matrix, the legend and the badges agree.
 *
 * `draft` deliberately shares the "not handed in" family rather than reading as
 * progress: a reviewer cannot see a draft, so from the school's point of view
 * nothing was submitted.
 */
export const COMPLIANCE_TONES: Record<
  ComplianceStatus,
  { cell: string; dot: string; badge: 'success' | 'info' | 'warning' | 'danger' | 'secondary' }
> = {
  approved: { cell: 'bg-success-subtle text-success', dot: 'bg-success', badge: 'success' },
  submitted: { cell: 'bg-info-subtle text-info', dot: 'bg-info', badge: 'info' },
  under_review: { cell: 'bg-info-subtle text-info', dot: 'bg-info', badge: 'warning' },
  returned: { cell: 'bg-danger-subtle text-danger', dot: 'bg-danger', badge: 'danger' },
  draft: { cell: 'bg-warning-subtle text-warning', dot: 'bg-warning', badge: 'secondary' },
  missing: {
    cell: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
    badge: 'secondary',
  },
};

/** The statuses a teacher may still edit — the API rejects the others. */
export function isEditable(status: LessonPlanStatus): boolean {
  return status === 'draft' || status === 'returned';
}

/** Whether a plan can be handed in from its current state. */
export function isSubmittable(plan: Pick<LessonPlan, 'status' | 'activities'>): boolean {
  return isEditable(plan.status) && plan.activities.length > 0;
}

/** How much of a plan was actually taught, for the progress readout. */
export function taughtCount(activities: LessonActivity[]): number {
  return activities.filter((activity) => activity.isCompleted).length;
}

// ── The monthly checklist ───────────────────────────────────────────────────

/**
 * The academic office's editable answer to "what is owed this month".
 *
 * Distinct from the compliance matrix, which derives the same question from the
 * timetable and cannot be argued with — a month is drafted from that timetable,
 * trimmed by hand (exam weeks, holidays), then published to the teachers who owe
 * lines on it.
 */
export interface LessonPlanMonthSummary {
  id: string;
  year: number;
  /** Calendar month, 1–12. */
  month: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
  note: string | null;
  semesterId: string;
  semesterNameLo: string;
  semesterNameEn: string | null;
}

export interface ChecklistTask {
  id: string;
  weekIndex: number;
  weekStartDate: string;
  weekEndDate: string;
  dueDate: string;
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  subjectId: string;
  subjectCode: string;
  subjectNameLo: string;
  subjectNameEn: string | null;
  classroomId: string;
  classroomName: string;
  subjectGroupId: string | null;
  /** `missing` is the absence of a plan, not a stored status. */
  status: ComplianceStatus;
  lessonPlanId: string | null;
  attachmentCount: number;
  isLate: boolean;
  isOverdue: boolean;
  submittedAt: string | null;
}

export interface MonthChecklist {
  month: LessonPlanMonthSummary;
  weeks: { index: number; startDate: string; endDate: string }[];
  tasks: ChecklistTask[];
  summary: {
    total: number;
    submitted: number;
    approved: number;
    outstanding: number;
    overdue: number;
    withFiles: number;
  };
}

export interface DraftMonthInput {
  year: number;
  month: number;
  /** Defaults to the active semester, as the compliance endpoint does. */
  semesterId?: string;
  subjectGroupIds?: string[];
}

export const checklistApi = {
  months: (params: { semesterId?: string; year?: number } = {}) =>
    get<LessonPlanMonthSummary[]>('/lesson-plan-months', { params: cleanParams(params) }),

  checklist: (id: string, params: { teacherId?: string; outstandingOnly?: boolean } = {}) =>
    get<MonthChecklist>(`/lesson-plan-months/${id}`, { params: cleanParams(params) }),

  draft: (body: DraftMonthInput) => post<MonthChecklist>('/lesson-plan-months/draft', body),

  setNote: (id: string, note: string) =>
    patch<MonthChecklist>(`/lesson-plan-months/${id}`, { note }),

  publish: (id: string) => post<MonthChecklist>(`/lesson-plan-months/${id}/publish`),

  removeTasks: (id: string, taskIds: string[]) =>
    post<MonthChecklist>(`/lesson-plan-months/${id}/remove-tasks`, { taskIds }),

  setTaskDueDate: (taskId: string, dueDate: string) =>
    patch<ChecklistTask>(`/lesson-plan-tasks/${taskId}`, { dueDate }),

  /** Creates the plan, attaches the file and submits it — all in one call. */
  upload: (taskId: string, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<ChecklistTask>(`/lesson-plan-tasks/${taskId}/upload`, formData, onProgress);
  },
};

const CHECKLIST_KEY = 'lesson-plan-months';

/**
 * Every read of the checklist *and* of the plans behind it.
 *
 * Handing a document in creates and submits a plan, so a checklist write moves
 * the compliance matrix and the review queue too.
 */
function invalidateChecklist(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: [CHECKLIST_KEY] });
  void queryClient.invalidateQueries({ queryKey: [KEY] });
}

export function useLessonPlanMonths(params: { semesterId?: string; year?: number } = {}) {
  return useQuery({
    queryKey: [CHECKLIST_KEY, 'list', params],
    queryFn: () => checklistApi.months(params),
  });
}

export function useMonthChecklist(
  id: string | undefined,
  params: { teacherId?: string; outstandingOnly?: boolean } = {},
) {
  return useQuery({
    queryKey: [CHECKLIST_KEY, 'detail', id, params],
    queryFn: () => checklistApi.checklist(id!, params),
    enabled: Boolean(id),
    placeholderData: (previous) => previous,
  });
}

export function useDraftMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftMonthInput) => checklistApi.draft(body),
    meta: { successMessage: 'lessonPlan.draftCreated' },
    onSuccess: () => invalidateChecklist(queryClient),
  });
}

export function useSetMonthNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => checklistApi.setNote(id, note),
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => invalidateChecklist(queryClient),
  });
}

export function usePublishMonth() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => checklistApi.publish(id),
    meta: { successMessage: 'lessonPlan.published' },
    onSuccess: () => invalidateChecklist(queryClient),
  });
}

export function useRemoveChecklistTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, taskIds }: { id: string; taskIds: string[] }) =>
      checklistApi.removeTasks(id, taskIds),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: () => invalidateChecklist(queryClient),
  });
}

export function useUploadChecklistFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taskId,
      file,
      onProgress,
    }: {
      taskId: string;
      file: File;
      onProgress?: (percent: number) => void;
    }) => checklistApi.upload(taskId, file, onProgress),
    meta: { successMessage: 'lessonPlan.handedIn' },
    onSuccess: () => invalidateChecklist(queryClient),
  });
}
