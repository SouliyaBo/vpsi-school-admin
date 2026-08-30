import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, type ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { ConductDeduction, ConductRule } from '@/types/entities';
import type { ConductEscalationLevel, ConductGrade, ConductNotifyParty } from '@/types/enums';

/**
 * ການຕັດຄະແນນອຸປະນິໄສ — the discipline ledger.
 *
 * The rule sheet is ordinary master data and uses `createCrudApi`; the ledger
 * does not. Nothing here is a record the client edits: points are taken by
 * applying a rule to a list of children, and put back by withdrawing one row
 * with a reason. The reads are shaped for the two screens that exist — a class's
 * standing and one child's account — rather than one list endpoint bent twice.
 *
 * No balance is ever sent to the server. It is a sum of the ledger, computed
 * server-side on every read, which is the only way it can be trusted.
 */

// ── The rule sheet ──────────────────────────────────────────────────────────

export interface ConductRuleInput {
  code: string;
  points: number;
  nameLo: string;
  nameEn?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ConductRuleListParams extends ListParams {
  points?: number;
  /** Also returns rules the office has withdrawn. */
  includeWithdrawn?: boolean;
}

export const conductRulesApi = createCrudApi<ConductRule, ConductRuleInput>('/conduct-rules');

export const conductRules = createCrudHooks<ConductRule, ConductRuleInput>(
  'conduct-rules',
  conductRulesApi,
);

/**
 * The whole sheet in one page.
 *
 * `MAX_RULE_PAGE` is the API's own cap (`MAX_PAGE_SIZE`), and asking for more is
 * a 400 rather than a larger page — which on this screen would surface as "there
 * are no rules", the most misleading answer available. A published rule sheet is
 * a page of a document, well under the cap, so it is fetched whole and grouped
 * into its columns on the client.
 */
const MAX_RULE_PAGE = 100;

export function useConductRules(params: ConductRuleListParams = {}) {
  return conductRules.useList({ limit: MAX_RULE_PAGE, ...params });
}

// ── The ledger ──────────────────────────────────────────────────────────────

export interface RecordDeductionInput {
  classroomId: string;
  ruleId: string;
  /** `yyyy-MM-dd`; the API resolves the term from it. */
  date: string;
  studentIds: string[];
  note?: string;
}

/** Where one child stands after a write — the ledger's answer, not the client's. */
export interface DeductionOutcome {
  studentId: string;
  deducted: number;
  remaining: number;
  grade: ConductGrade;
  /**
   * `false` when the office has set this term's conduct mark by hand: the
   * deduction still counts, but the report card keeps the manual figure.
   */
  publishedToConductScore: boolean;
  level: ConductEscalationLevel;
  notify: ConductNotifyParty[];
}

/** One row of the class standing — every child on the roll, deducted or not. */
export interface ClassStandingRow {
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  /** What the class calls them — `null` when none is on file. */
  studentNickname: string | null;
  rollNumber: number | null;
  deducted: number;
  entries: number;
  /** `null` for a child with nothing against them. */
  lastDate: string | null;
  remaining: number;
  grade: ConductGrade;
  level: ConductEscalationLevel;
  notify: ConductNotifyParty[];
}

export interface StudentLedgerEntry {
  id: string;
  date: string;
  ruleId: string;
  ruleCode: string;
  ruleNameLo: string;
  points: number;
  note: string | null;
}

export interface StudentLedger {
  studentId: string;
  semesterId: string;
  baseScore: number;
  deducted: number;
  remaining: number;
  grade: ConductGrade;
  level: ConductEscalationLevel;
  notify: ConductNotifyParty[];
  entries: StudentLedgerEntry[];
}

/** The school's ໝາຍເຫດ ladder, served so the screen cannot restate it wrongly. */
export interface EscalationLadder {
  baseScore: number;
  rungs: { level: ConductEscalationLevel; minDeducted: number; notify: ConductNotifyParty[] }[];
}

export interface DeductionListParams extends ListParams {
  studentId?: string;
  classroomId?: string;
  semesterId?: string;
  ruleId?: string;
  from?: string;
  to?: string;
}

export const conductDeductionsApi = {
  list: (params: DeductionListParams = {}) =>
    get<PaginatedResponse<ConductDeduction>>('/conduct-deductions', {
      params: cleanParams(params),
    }),

  record: (body: RecordDeductionInput) =>
    post<{ recorded: number; students: DeductionOutcome[] }>('/conduct-deductions', body),

  revoke: (id: string, reason: string) =>
    del<DeductionOutcome>(`/conduct-deductions/${id}`, { data: { reason } }),

  classroomStanding: (classroomId: string, semesterId: string) =>
    get<ClassStandingRow[]>(
      `/conduct-deductions/summary/classroom/${classroomId}/semester/${semesterId}`,
    ),

  studentLedger: (studentId: string, semesterId: string) =>
    get<StudentLedger>(`/conduct-deductions/student/${studentId}/semester/${semesterId}`),

  ladder: () => get<EscalationLadder>('/conduct-deductions/ladder'),
};

export function useClassStanding(classroomId: string | undefined, semesterId: string | undefined) {
  return useQuery({
    queryKey: ['conduct-deductions', 'standing', classroomId, semesterId],
    queryFn: () => conductDeductionsApi.classroomStanding(classroomId!, semesterId!),
    enabled: Boolean(classroomId && semesterId),
  });
}

export function useStudentLedger(studentId: string | undefined, semesterId: string | undefined) {
  return useQuery({
    queryKey: ['conduct-deductions', 'ledger', studentId, semesterId],
    queryFn: () => conductDeductionsApi.studentLedger(studentId!, semesterId!),
    enabled: Boolean(studentId && semesterId),
  });
}

/** School policy, not session data — it changes when the sheet is reissued. */
export function useEscalationLadder() {
  return useQuery({
    queryKey: ['conduct-deductions', 'ladder'],
    queryFn: () => conductDeductionsApi.ladder(),
    staleTime: Infinity,
  });
}

export function useRecordDeduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordDeductionInput) => conductDeductionsApi.record(body),
    // Handled inline: a rejected date or a child who has left the room belongs
    // next to the field that named them, not in a toast that outlives the form.
    meta: { silentError: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conduct-deductions'] });
      // The term mark is republished from the ledger, so the conduct score and
      // anything derived from it are now stale.
      void queryClient.invalidateQueries({ queryKey: ['conduct-scores'] });
    },
  });
}

export function useRevokeDeduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      conductDeductionsApi.revoke(id, reason),
    meta: { successMessage: 'conductDeduction.revoked' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conduct-deductions'] });
      void queryClient.invalidateQueries({ queryKey: ['conduct-scores'] });
    },
  });
}

/**
 * How loud a rung should look.
 *
 * Deliberately not a gradient over the score: the ladder is what the school acts
 * on, so the colour follows the rung rather than the number, and two children on
 * the same rung look the same however they got there.
 */
export const ESCALATION_TONES: Record<
  ConductEscalationLevel,
  'success' | 'info' | 'warning' | 'danger'
> = {
  none: 'success',
  classroom: 'info',
  level1: 'warning',
  level2: 'warning',
  level3: 'danger',
  review: 'danger',
};
