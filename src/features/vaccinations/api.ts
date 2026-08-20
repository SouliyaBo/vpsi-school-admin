import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, put } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, type ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { Student, Vaccination, VaccinationCampaign } from '@/types/entities';
import type { ConsentStatus, Vaccine, VaccinationStatus } from '@/types/enums';

/**
 * Vaccination campaigns and the per-student dose records.
 *
 * Campaigns are ordinary CRUD, so they use the shared factory. Three calls are
 * not: the picker (one classroom's students, each flagged eligible/selected), the
 * roll (the round's own list, with what is recorded for each), and the dose sheet
 * write — one request for the whole sheet, because campaign day produces one
 * document rather than one form per child.
 *
 * The roll is the list the office picked, not a sweep of everyone the eligibility
 * rule matches. The cost is that a newcomer is not on a round until someone adds
 * them; the gain is that no child appears on a sheet nobody chose.
 */

export interface CampaignInput {
  nameLo: string;
  vaccine: Vaccine;
  doseNumber: number;
  scheduledDate: string;
  schoolYearId: string;
  eligibility?: {
    gender?: string;
    gradeLevelIds?: string[];
    bornFrom?: string;
    bornTo?: string;
  };
  provider?: string;
  status?: string;
  notes?: string;
}

export interface CampaignListParams extends ListParams {
  schoolYearId?: string;
  vaccine?: Vaccine;
  status?: string;
}

const campaignsApi = createCrudApi<VaccinationCampaign, CampaignInput>('/vaccinations/campaigns');
export const campaigns = createCrudHooks('vaccination-campaigns', campaignsApi);

/** One student on a roll, with whatever is already recorded for them. */
export interface RollEntry {
  student: Student;
  /** `null` means nothing has been recorded — not that the dose was refused. */
  record: Vaccination | null;
  /** Where they sit this year, so a roll spanning classes can say which. */
  classroom: { id: string; name: string } | null;
}

/**
 * `GET /vaccinations/campaigns/:id/roll`.
 *
 * `classroomId` narrows the view without changing who is on the round.
 * `outstandingOnly` is the follow-up list — it works only because a refusal and
 * an absence are recorded outcomes rather than gaps.
 */
export function useCampaignRoll(
  campaignId: string | undefined,
  options: { outstandingOnly?: boolean; classroomId?: string } = {},
) {
  const { outstandingOnly = false, classroomId } = options;

  return useQuery({
    queryKey: ['vaccination-roll', campaignId, outstandingOnly, classroomId ?? null],
    queryFn: () =>
      get<RollEntry[]>(`/vaccinations/campaigns/${campaignId}/roll`, {
        params: cleanParams({
          outstandingOnly: outstandingOnly ? 'true' : undefined,
          classroomId,
        }),
      }),
    enabled: Boolean(campaignId),
  });
}

/** One name the picker offers, and whether it may be picked or dropped. */
export interface CampaignCandidate {
  student: Student;
  /** False for a name the round does not cover — shown, but not pickable. */
  eligible: boolean;
  selected: boolean;
  /** Set once a dose is recorded, after which the student cannot be dropped. */
  record: Vaccination | null;
}

/**
 * `GET /vaccinations/campaigns/:id/candidates` — one classroom at a time.
 *
 * Per classroom rather than the whole school, because that is the list the office
 * works from: a round is assembled class by class.
 */
export function useCampaignCandidates(
  campaignId: string | undefined,
  classroomId: string | undefined,
) {
  return useQuery({
    queryKey: ['vaccination-candidates', campaignId, classroomId],
    queryFn: () =>
      get<CampaignCandidate[]>(`/vaccinations/campaigns/${campaignId}/candidates`, {
        params: { classroomId },
      }),
    enabled: Boolean(campaignId) && Boolean(classroomId),
  });
}

/**
 * Replaces the round's roll.
 *
 * The whole list, not a delta: the picker holds the set it wants, and patching
 * entries one at a time would need a merge the API does not do.
 */
export function useSetCampaignStudents(campaignId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (studentIds: string[]) =>
      put<VaccinationCampaign>(`/vaccinations/campaigns/${campaignId}/students`, { studentIds }),
    meta: { successMessage: 'toast.saved' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vaccination-candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['vaccination-roll'] });
      await queryClient.invalidateQueries({ queryKey: ['vaccination-campaigns'] });
    },
  });
}

export interface DoseConsentInput {
  status: ConsentStatus;
  guardianId?: string;
  decidedAt?: string;
  method?: string;
}

export interface DoseInput {
  studentId: string;
  status: VaccinationStatus;
  administeredDate?: string;
  batchNumber?: string;
  provider?: string;
  consent?: DoseConsentInput;
  notes?: string;
}

/**
 * Records the whole sheet for one campaign.
 *
 * Invalidates the roll and every student's records: a saved sheet changes both
 * the follow-up list and each child's history.
 */
export function useRecordCampaignDoses(campaignId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (records: DoseInput[]) =>
      post<{ recorded: number }>(`/vaccinations/campaigns/${campaignId}/records`, { records }),
    meta: { successMessage: 'toast.saved' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vaccination-roll'] });
      await queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
    },
  });
}

export interface VaccinationListParams extends ListParams {
  studentId?: string;
  campaignId?: string;
  vaccine?: Vaccine;
  status?: VaccinationStatus;
}

/**
 * One student's dose history.
 *
 * Every call is audited server-side — looking up a child's vaccination record is
 * itself the sensitive act — so this is not fetched speculatively: the student
 * detail page asks for it only once its tab is opened.
 */
export function useStudentVaccinations(studentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['vaccinations', 'student', studentId],
    queryFn: () =>
      get<PaginatedResponse<Vaccination>>('/vaccinations', {
        params: cleanParams({ studentId, limit: 100 }),
      }),
    enabled: Boolean(studentId) && enabled,
  });
}

/** A dose given away from the school, so it names its own vaccine and dose. */
export interface StandaloneDoseInput extends DoseInput {
  vaccine: Vaccine;
  doseNumber: number;
}

export function useRecordStandaloneDose() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: StandaloneDoseInput) => post<Vaccination>('/vaccinations', body),
    meta: { successMessage: 'toast.created' },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
      await queryClient.invalidateQueries({ queryKey: ['vaccination-roll'] });
    },
  });
}
