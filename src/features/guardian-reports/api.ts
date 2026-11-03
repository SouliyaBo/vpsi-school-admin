import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import { stripEmpty } from '@/lib/payload';
import type {
  GuardianReport,
  GuardianReportDraft,
  GuardianReportSection,
  GuardianReportSnapshot,
} from '@/types/entities';

/**
 * ລາຍງານຫາຜູ້ປົກຄອງ — a month of one student, sent to a family as a link.
 *
 * No guardian has an account, so the link is the whole delivery: a token in its
 * `#fragment` and the last four digits of the guardian's phone. The token comes
 * back from `create` and `reissue` and from nowhere else — the server keeps only
 * its hash — so the screen that receives it is the only chance to copy it.
 *
 * Not `createCrudApi`: a sent report is not edited. It is revoked, or its link is
 * replaced.
 */

const PATH = '/guardian-reports';

export interface GuardianReportDraftParams {
  studentId: string;
  month: number;
  semesterId?: string;
}

export interface CreateGuardianReportInput extends GuardianReportDraftParams {
  guardianId: string;
  sections: GuardianReportSection[];
  /** With `behavior`: the register entries the teacher left ticked. */
  behaviorLogIds?: string[];
  message?: string;
}

/** What `create` and `reissue` return — the report, and its link's only copy. */
export interface IssuedGuardianReport {
  report: GuardianReport;
  token: string;
}

/** `POST /guardian-reports/open` — the guardian's side. */
export interface OpenedGuardianReport {
  schoolNameLo: string | null;
  expiresAt: string;
  report: GuardianReportSnapshot;
}

export const guardianReportsApi = {
  list: (studentId: string) => get<GuardianReport[]>(PATH, { params: { studentId } }),
  draft: (params: GuardianReportDraftParams) =>
    get<GuardianReportDraft>(`${PATH}/draft`, { params: stripEmpty(params) }),
  // `stripEmpty` because the API rejects an empty `message` it did not ask for.
  create: (body: CreateGuardianReportInput) => post<IssuedGuardianReport>(PATH, stripEmpty(body)),
  reissue: (id: string) => post<IssuedGuardianReport>(`${PATH}/${id}/reissue`),
  revoke: (id: string) => post<GuardianReport>(`${PATH}/${id}/revoke`),
  open: (token: string, pin: string) => post<OpenedGuardianReport>(`${PATH}/open`, { token, pin }),
};

/** The link a guardian is sent. The token rides in the fragment, which no server sees. */
export function guardianReportLink(token: string): string {
  return `${window.location.origin}/r#${token}`;
}

export function useGuardianReports(studentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['guardian-reports', studentId],
    queryFn: () => guardianReportsApi.list(studentId!),
    enabled: enabled && Boolean(studentId),
  });
}

/**
 * The preview the dialog is drawn from. Not cached past the dialog: it is the
 * month's figures as they stand, and the report sent is assembled again anyway.
 */
export function useGuardianReportDraft(params: GuardianReportDraftParams | null) {
  return useQuery({
    queryKey: ['guardian-report-draft', params],
    queryFn: () => guardianReportsApi.draft(params!),
    enabled: params !== null,
    staleTime: 0,
  });
}

function useInvalidateReports() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['guardian-reports'] });
}

export function useCreateGuardianReport() {
  const invalidate = useInvalidateReports();
  return useMutation({ mutationFn: guardianReportsApi.create, onSuccess: invalidate });
}

export function useReissueGuardianReport() {
  const invalidate = useInvalidateReports();
  return useMutation({ mutationFn: guardianReportsApi.reissue, onSuccess: invalidate });
}

export function useRevokeGuardianReport() {
  const invalidate = useInvalidateReports();
  return useMutation({ mutationFn: guardianReportsApi.revoke, onSuccess: invalidate });
}
