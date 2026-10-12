import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/hooks';
import { get, post, upload } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { fullName } from '@/lib/utils';
import type {
  PlaceOfBirth,
  Teacher,
  TeacherEducation,
  TeacherParent,
} from '@/types/entities';
import type { Gender, HousingType, MaritalStatus, TeacherStatus } from '@/types/enums';
import type { SelectOption } from '@/components/common/fields';

export interface TeacherInput {
  /** Omit to have the API mint one for the active school year — `T-2627-001`. */
  teacherCode?: string;
  title?: string;
  firstNameLo: string;
  lastNameLo: string;
  firstNameEn?: string;
  lastNameEn?: string;
  gender: Gender;
  dateOfBirth?: string;
  ethnicity?: string;
  placeOfBirth?: PlaceOfBirth;
  nationalId?: string;
  phone?: string;
  email?: string;
  villageId?: string;
  addressDetail?: string;
  qualification?: string;
  specialization?: string;
  education?: TeacherEducation;
  teachingSubjects?: string[];
  professionalLevel?: string;
  hireDate?: string;
  joinedOrgDate?: string;
  maritalStatus?: MaritalStatus;
  childrenCount?: number;
  housingType?: HousingType;
  livingWith?: string;
  siblings?: string;
  father?: TeacherParent;
  mother?: TeacherParent;
  isAcademicHead?: boolean;
  subjectGroupId?: string;
}

/**
 * PATCH also accepts `status`, which is not settable at creation time, and takes
 * `null` for the department — that is how a teacher is detached from a group.
 */
export type TeacherUpdateInput = Partial<TeacherInput> & {
  status?: TeacherStatus;
  subjectGroupId?: string | null;
};

export const teachersApi = {
  ...createCrudApi<Teacher, TeacherInput, TeacherUpdateInput>('/teachers'),
  uploadPhoto: (id: string, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<Teacher>(`/teachers/${id}/photo`, formData, onProgress);
  },
  /** Self-service: no id, and no `teachers:update`. See `useUploadMyPhoto`. */
  uploadMyPhoto: (file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<Teacher>('/teachers/me/photo', formData, onProgress);
  },
};

export const teachers = createCrudHooks<Teacher, TeacherInput, TeacherUpdateInput>(
  'teachers',
  teachersApi,
);

export function useUploadTeacherPhoto(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) =>
      teachersApi.uploadPhoto(id!, file, onProgress),
    meta: { successMessage: 'toast.uploaded' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

/**
 * The teacher record behind the signed-in account.
 *
 * Skipped — and so `undefined` — for an account that is not a teacher: an office
 * login or a guardian has no staff record to show a portrait from. `/teachers/me`
 * rather than `/teachers/:id` because a teacher may read and photograph their own
 * record without holding the office's `teachers:read`/`teachers:update`.
 *
 * `photoUrl` is a signed URL that expires after 15 minutes, so the record is kept
 * fresher than that — a stale one would render as a broken image.
 */
export function useMyTeacher() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: ['teachers', 'me'],
    queryFn: () => get<Teacher>('/teachers/me'),
    enabled: user?.personType === 'teacher' && Boolean(user.personId),
    staleTime: 5 * 60 * 1000,
  });
}

/** Replaces one's own portrait — the profile page's upload. */
export function useUploadMyPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) =>
      teachersApi.uploadMyPhoto(file, onProgress),
    meta: { successMessage: 'toast.uploaded' },
    // Covers `['teachers', 'me']` and any list the new photo should appear in.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

/**
 * The code the API would give the next teacher, for the create form to show.
 *
 * A preview rather than a reservation — two people creating at once see the
 * same number and the second save takes the next — so it is fetched fresh each
 * time the dialog opens rather than cached.
 */
export function useNextTeacherCode(enabled: boolean) {
  return useQuery({
    queryKey: ['teachers', 'next-code'],
    queryFn: () => get<{ teacherCode: string }>('/teachers/next-code'),
    enabled,
    gcTime: 0,
    staleTime: 0,
  });
}

export function useTeacherOptions(search: string) {
  const { i18n } = useTranslation();
  const query = useLookupQuery('teachers', teachersApi.list, search, { status: 'active' }, 25);

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((teacher) => ({
      value: teacher.id,
      label: `${teacher.teacherCode} — ${fullName(teacher, i18n.language)}`,
    })),
  };
}

// ── Departure (ການສົ່ງມອບການສອນ) ─────────────────────────────────────────────

/** One lesson a departing teacher still holds. */
export interface TeacherAssignmentHold {
  id: string;
  subjectNameLo: string;
  classroomName: string;
  gradeLevelCode: string | null;
  semesterNameLo: string;
  periods: number;
}

export interface TeacherHomeroomHold {
  id: string;
  name: string;
  gradeLevelCode: string | null;
  studentCount: number;
}

/**
 * The posts a teacher still holds — not the history they wrote.
 *
 * The distinction is the whole point: registers, marks and reviews keep the name
 * of whoever wrote them and need nothing done about them, while a timetable slot
 * and a ຄູປະຈຳຫ້ອງ post are jobs a school cannot leave empty. These are the ones
 * the office has to act on, so these are the ones the API reports.
 */
export interface TeacherCommitments {
  teacherId: string;
  status: TeacherStatus;
  /** Heads a department — reported, never moved by a handover. */
  isAcademicHead: boolean;
  /** Whether they can still sign in. */
  hasActiveAccount: boolean;
  assignments: TeacherAssignmentHold[];
  homerooms: TeacherHomeroomHold[];
  subjectGroups: { id: string; code: string; nameLo: string }[];
}

export interface TeacherHandoverInput {
  toTeacherId: string;
  /** All default to moving everything except a department headship. */
  assignments?: boolean;
  homerooms?: boolean;
  subjectGroups?: boolean;
  resign?: boolean;
  note?: string;
}

export interface TeacherHandoverResult {
  fromTeacherId: string;
  toTeacherId: string;
  assignmentsMoved: number;
  homeroomsMoved: number;
  subjectGroupsMoved: number;
  resigned: boolean;
}

export const teacherDepartureApi = {
  commitments: (id: string) => get<TeacherCommitments>(`/teachers/${id}/commitments`),
  handOver: (id: string, body: TeacherHandoverInput) =>
    post<TeacherHandoverResult>(`/teachers/${id}/handover`, body),
};

/**
 * What this teacher still holds.
 *
 * Read on demand rather than with the row: it is three queries on the API side and
 * the answer only matters on the two screens that act on it — the handover dialog,
 * and the edit form once a status other than `active` is chosen.
 */
export function useTeacherCommitments(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['teachers', 'commitments', id],
    queryFn: () => teacherDepartureApi.commitments(id!),
    enabled: enabled && Boolean(id),
    // Not held: the office moves posts one screen away from this one, and a stale
    // "still responsible for 4 lessons" is the kind of wrong that gets acted on.
    staleTime: 0,
  });
}

/**
 * Hands a teacher's posts to another, in one transaction on the API.
 *
 * Invalidates widely and deliberately: a handover rewrites the timetable, moves a
 * homeroom and changes a teacher's status, so the lists, the reports built on the
 * timetable and the rooms themselves are all out of date at once.
 */
export function useTeacherHandover(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeacherHandoverInput) => teacherDepartureApi.handOver(id!, body),
    onSuccess: () => {
      for (const key of [
        'teachers',
        'teaching-assignments',
        'classrooms',
        'coverage',
        'timeliness',
        'homeroom-reviews',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
