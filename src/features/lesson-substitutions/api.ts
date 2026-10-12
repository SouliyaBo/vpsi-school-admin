import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/lib/api-client';
import type { ListParams } from '@/lib/crud';
import { stripEmpty } from '@/lib/payload';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { LessonSubstitution } from '@/types/entities';

/**
 * ການມອບໝາຍສອນແທນ — cover for a colleague's lesson.
 *
 * Self-service, and that is the whole design: the situation is a teacher off sick
 * at seven and a class at eight, so a claim the office had to approve would still
 * be unapproved when the register fell due. A teacher claims the lesson they are
 * standing in for, which lets them mark that day's roll and write its behaviour
 * register — and moves the coverage and punctuality reports onto them, so the
 * colleague who was away is not reported for paperwork they could not have done.
 *
 * Not `createCrudApi`: there is no update. Cover is claimed or it is withdrawn,
 * because an editable claim is one that could be quietly moved onto another day.
 */

const PATH = '/lesson-substitutions';

export interface LessonSubstitutionParams extends ListParams {
  teachingAssignmentId?: string;
  /** Claims where this teacher stood in. */
  substituteTeacherId?: string;
  /** Claims against this teacher's own timetabled lessons. */
  ownerTeacherId?: string;
  classroomId?: string;
  semesterId?: string;
  /** Inclusive `yyyy-MM-dd` bounds. */
  from?: string;
  to?: string;
}

export interface CreateLessonSubstitutionInput {
  teachingAssignmentId: string;
  date: string;
  /**
   * Omitted means "me", which is the ordinary case. Naming a colleague needs
   * `lesson-substitutions:manage` and is how the office files cover that was
   * arranged by phone.
   */
  substituteTeacherId?: string;
  reason?: string;
}

/**
 * Whether the caller may record this lesson, or claim cover for it.
 *
 * Asked of the server rather than worked out here, and the reason is the deadline:
 * the claim window closes when the lesson's paperwork falls due, which is noon of
 * the next *working* day — a calendar question, with the school's holidays and
 * closures in it. A second implementation in the browser would disagree on exactly
 * the days that matter.
 */
export interface LessonClaimability {
  /** The caller already holds the lesson, by timetable, by claim, or by office. */
  canRecord: boolean;
  /** A claim would be accepted right now. */
  canClaim: boolean;
  /** Why not — a `messageKey`, which the catalogue already translates. */
  blockedBy: string | null;
  /** When the claim window shuts, ISO; `null` when the calendar cannot say. */
  claimableUntil: string | null;
  /** Who already holds cover for this lesson-day. */
  claimedByTeacherId: string | null;
}

export const lessonSubstitutionsApi = {
  list: (params: LessonSubstitutionParams = {}) =>
    get<PaginatedResponse<LessonSubstitution>>(PATH, { params: cleanParams(params) }),
  claimability: (teachingAssignmentId: string, date: string) =>
    get<LessonClaimability>(`${PATH}/claimability`, { params: { teachingAssignmentId, date } }),
  // `stripEmpty` because the API validates with `forbidNonWhitelisted` and a blank
  // optional is not the same as an omitted one: `substituteTeacherId` left empty
  // has to mean "me", not "a teacher whose id is nothing".
  create: (body: CreateLessonSubstitutionInput) =>
    post<LessonSubstitution>(PATH, stripEmpty(body)),
  remove: (id: string) => del<void>(`${PATH}/${id}`),
};

export function useLessonSubstitutions(params: LessonSubstitutionParams) {
  return useQuery({
    queryKey: ['lesson-substitutions', params],
    queryFn: () => lessonSubstitutionsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The claim state of one lesson-day.
 *
 * `enabled` is the caller's, because the two screens that ask are also usable by
 * accounts with no grant on cover at all — a registrar reading the roll — and a
 * 403 on every lesson they click through is noise, not information.
 */
export function useLessonClaimability(
  teachingAssignmentId: string | undefined,
  date: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['lesson-claimability', teachingAssignmentId, date],
    queryFn: () => lessonSubstitutionsApi.claimability(teachingAssignmentId!, date),
    enabled: enabled && Boolean(teachingAssignmentId) && Boolean(date),
    // Not held: the answer changes the moment a colleague claims the same period,
    // and the button it decides is the one that writes to the register.
    staleTime: 0,
  });
}

/**
 * Claiming and withdrawing both invalidate more than themselves.
 *
 * A claim changes who may write the two logs, whose name is on the sheet, and
 * which teacher the coverage and punctuality reports expect the day from. All of
 * those are on screen while this is pressed, so all of them are refetched.
 */
function useInvalidateCover() {
  const queryClient = useQueryClient();
  return () => {
    // Coarse on purpose: `attendances` and `behavior-logs` each cover a sheet, a
    // log and several summaries, and a claim changes whose name is on all of them.
    for (const key of [
      'lesson-substitutions',
      'lesson-claimability',
      'attendances',
      'behavior-logs',
      'coverage',
      'timeliness',
    ]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useClaimLessonCover() {
  const invalidate = useInvalidateCover();
  return useMutation({
    mutationFn: lessonSubstitutionsApi.create,
    onSuccess: invalidate,
  });
}

export function useWithdrawLessonCover() {
  const invalidate = useInvalidateCover();
  return useMutation({
    mutationFn: lessonSubstitutionsApi.remove,
    onSuccess: invalidate,
  });
}
