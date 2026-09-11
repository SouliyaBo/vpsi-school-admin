import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, type ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { TeachingObservation } from '@/types/entities';
import type { TeachingObservationStatus } from '@/types/enums';

/**
 * ຕິດຕາມການສອນຂອງຄູ — the classroom-observation sheet.
 *
 * CRUD carries the sheet itself, but the two reads that matter are not lists:
 * `rubric` is the blank form, and `summary` inverts the question from "what was
 * filed" to "which teachers have been visited, and how are they doing" — which
 * is what the academic office actually opens the screen for.
 */

export interface ObservationCriterion {
  key: string;
  /** 1–6, the ordinal printed on the form. */
  order: number;
  labelLo: string;
  labelEn: string;
  /** The two descriptor lines the form prints in column two. */
  indicatorsLo: [string, string];
  indicatorsEn: [string, string];
}

export interface ObservationRubric {
  criteria: ObservationCriterion[];
  /** What one row is worth — 10. */
  criterionMaxScore: number;
  /** What a completed sheet is out of — 60. */
  maxTotal: number;
}

export interface ObservationScoreInput {
  criterion: string;
  /** `null` clears the row back to unmarked, which is not a mark of zero. */
  score?: number | null;
}

/**
 * `visitNumber` and `semesterId` are optional because the API fills them in —
 * the next visit of the term, and the term that is running.
 */
export interface CreateObservationInput {
  teacherId: string;
  /** Defaults to the signed-in teacher; naming another needs `manage`. */
  observerId?: string;
  subjectId: string;
  classroomId: string;
  semesterId?: string;
  observedAt: string;
  visitNumber?: number;
  scores?: ObservationScoreInput[];
  note?: string;
}

/** `teacherId` is absent: a sheet filed against the wrong colleague is withdrawn. */
export type UpdateObservationInput = Partial<
  Pick<
    CreateObservationInput,
    'observerId' | 'subjectId' | 'classroomId' | 'observedAt' | 'scores' | 'note'
  >
>;

export interface ObservationListParams extends ListParams {
  teacherId?: string;
  observerId?: string;
  subjectId?: string;
  subjectGroupId?: string;
  classroomId?: string;
  semesterId?: string;
  status?: TeachingObservationStatus;
  from?: string;
  to?: string;
}

export interface TeacherObservationSummary {
  teacherId: string;
  teacherCode: string;
  teacherNameLo: string;
  teacherNameEn: string | null;
  subjectGroupId: string | null;
  /** Filed sheets only — a draft is nobody's record but its observer's. */
  visitCount: number;
  acknowledgedCount: number;
  averageTotal: number | null;
  maxTotal: number;
  /** Mean per criterion, keyed by rubric key; `null` where never marked. */
  averageByCriterion: Record<string, number | null>;
  lastObservedAt: string | null;
}

export interface ObservationSummary {
  semester: { id: string; nameLo: string; nameEn: string | null };
  maxTotal: number;
  criteria: ObservationCriterion[];
  teachers: TeacherObservationSummary[];
}

const KEY = 'teaching-observations';
const PATH = '/teaching-observations';

const crud = createCrudApi<TeachingObservation, CreateObservationInput, UpdateObservationInput>(
  PATH,
);

export const observationsApi = {
  ...crud,

  rubric: () => get<ObservationRubric>(`${PATH}/rubric`),

  summary: (params: { semesterId?: string; subjectGroupId?: string } = {}) =>
    get<ObservationSummary>(`${PATH}/summary`, { params: cleanParams(params) }),

  submit: (id: string) => post<TeachingObservation>(`${PATH}/${id}/submit`),

  acknowledge: (id: string) => post<TeachingObservation>(`${PATH}/${id}/acknowledge`),
};

const hooks = createCrudHooks<TeachingObservation, CreateObservationInput, UpdateObservationInput>(
  KEY,
  observationsApi,
  { messages: { deleted: 'observation.withdrawn' } },
);

export const {
  useDetail: useObservation,
  useCreate: useCreateObservation,
  useUpdate: useUpdateObservation,
  useDelete: useWithdrawObservation,
} = hooks;

export function useObservations(params: ObservationListParams) {
  return hooks.useList(params);
}

/**
 * The blank form.
 *
 * `staleTime: Infinity` because the rubric is a constant on the API — six
 * criteria compiled into the build — so refetching it is pure noise, and every
 * sheet on the screen renders its rows from this one response.
 */
export function useObservationRubric() {
  return useQuery({
    queryKey: [KEY, 'rubric'],
    queryFn: observationsApi.rubric,
    staleTime: Infinity,
  });
}

/**
 * ສະຫຼຸບການຕິດຕາມ.
 *
 * `retry: false` because the endpoint 404s between terms, when there is no
 * active semester and none was named — an ordinary state, not a transient
 * failure worth three attempts.
 */
export function useObservationSummary(params: { semesterId?: string; subjectGroupId?: string }) {
  return useQuery({
    queryKey: [KEY, 'summary', params],
    queryFn: () => observationsApi.summary(params),
    placeholderData: (previous) => previous,
    retry: false,
  });
}

function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
  return queryClient.invalidateQueries({ queryKey: [KEY] });
}

export function useSubmitObservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => observationsApi.submit(id),
    meta: { successMessage: 'observation.submitted' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useAcknowledgeObservation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => observationsApi.acknowledge(id),
    meta: { successMessage: 'observation.acknowledged' },
    onSuccess: () => invalidateAll(queryClient),
  });
}

// ── Reading a sheet ─────────────────────────────────────────────────────────

/** The criterion label in the reader's language, falling back to the Lao form. */
export function criterionLabel(criterion: ObservationCriterion, locale: string): string {
  return locale.startsWith('en') && criterion.labelEn ? criterion.labelEn : criterion.labelLo;
}

export function criterionIndicators(
  criterion: ObservationCriterion,
  locale: string,
): readonly string[] {
  return locale.startsWith('en') && criterion.indicatorsEn?.length
    ? criterion.indicatorsEn
    : criterion.indicatorsLo;
}

/** A sheet's marks as a lookup, so a row can find its own without a scan. */
export function scoreMap(observation: TeachingObservation): Map<string, number | null> {
  return new Map(observation.scores.map((row) => [row.criterion, row.score ?? null]));
}

/** A draft is the only state anything may be written to. */
export function isEditable(observation: TeachingObservation): boolean {
  return observation.status === 'draft';
}

/**
 * Colour per status, decided once so the list, the badges and the sheet agree.
 *
 * `draft` reads as unfinished rather than as progress: until it is filed, the
 * teacher it is about cannot see it, so from the school's side nothing has
 * happened yet.
 */
export const OBSERVATION_TONES: Record<
  TeachingObservationStatus,
  'secondary' | 'info' | 'success'
> = {
  draft: 'secondary',
  submitted: 'info',
  acknowledged: 'success',
};

/**
 * How a total should read at a glance.
 *
 * The bands are the school's ordinary thirds of the sixty available — they are a
 * reading aid on a screen, never a grade, and nothing is stored from them.
 */
export function scoreTone(total: number, max: number): 'success' | 'warning' | 'danger' {
  if (max <= 0) return 'warning';
  const ratio = total / max;
  if (ratio >= 0.8) return 'success';
  if (ratio >= 0.6) return 'warning';
  return 'danger';
}
