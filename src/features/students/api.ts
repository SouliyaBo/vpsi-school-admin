import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, put, upload } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { fullName } from '@/lib/utils';
import type { Sibling, Student } from '@/types/entities';
import type {
  Gender,
  GuardianRelationship,
  StudentOrganization,
  StudentStatus,
} from '@/types/enums';
import type { GuardianInput } from '@/features/guardians/api';
import type { SelectOption } from '@/components/common/fields';

/**
 * One entry of the guardian list on a student.
 *
 * Either link an existing guardian by id, or pass `guardian` to have the API
 * create one in the same transaction — the second path exists because during
 * enrolment the parent is usually not on file yet.
 */
export interface StudentGuardianInput {
  guardianId?: string;
  guardian?: GuardianInput;
  relationship: GuardianRelationship;
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  canViewRecords?: boolean;
}

/** One membership on the way in — the fact and `ວັນເຂົ້າ`, nothing else. */
export interface StudentOrganizationInput {
  organization: StudentOrganization;
  joinedDate: string;
}

export interface StudentInput {
  studentCode: string;
  firstNameLo: string;
  lastNameLo: string;
  firstNameEn?: string;
  lastNameEn?: string;
  nickname?: string;
  nicknameEn?: string;
  gender: Gender;
  dateOfBirth: string;
  birthLocationId?: string;
  birthAddressDetail?: string;
  nationality?: string;
  ethnicity?: string;
  nationalId?: string;
  phone?: string;
  contactPhone?: string;
  contactName?: string;
  villageId?: string;
  addressDetail?: string;
  admissionDate?: string;
  notes?: string;
  /** Defaults to `active` server-side; the form sends `new` for an unplaced intake. */
  status?: StudentStatus;
  /** At least one, and exactly one of them must be primary. */
  guardians: StudentGuardianInput[];
  /** At most one entry per organisation. Replaces the whole list when sent. */
  organizations?: StudentOrganizationInput[];
}

/**
 * PATCH takes any subset of the editable fields.
 *
 * `studentCode` is included: a child is often placed in a class before the
 * school can issue a real one, so the office enters a stand-in and replaces it
 * here. The API takes the change only from an account holding `students:manage`
 * and re-syncs the copies held on enrollments, exam registrations and term
 * results. `guardians` are replaced through their own endpoint.
 */
export type StudentUpdateInput = Partial<Omit<StudentInput, 'guardians'>>;

export const studentsApi = {
  ...createCrudApi<Student, StudentInput, StudentUpdateInput>('/students'),
  /** Students who share a guardian with this one. Derived, never stored. */
  siblings: (id: string) => get<Sibling[]>(`/students/${id}/siblings`),
  /** Replaces the whole guardian list — a PUT, not a merge. */
  setGuardians: (id: string, guardians: StudentGuardianInput[]) =>
    put<Student>(`/students/${id}/guardians`, { guardians }),
  uploadPhoto: (id: string, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return upload<Student>(`/students/${id}/photo`, formData, onProgress);
  },
};

export const students = createCrudHooks<Student, StudentInput, StudentUpdateInput>(
  'students',
  studentsApi,
);

/**
 * Keyed under `students` so editing a guardian list, which is what decides who
 * counts as a sibling, invalidates this alongside everything else.
 */
export function useStudentSiblings(id: string | undefined) {
  return useQuery({
    queryKey: ['students', 'siblings', id],
    queryFn: () => studentsApi.siblings(id!),
    enabled: Boolean(id),
  });
}

export function useSetStudentGuardians(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardians: StudentGuardianInput[]) => studentsApi.setGuardians(id!, guardians),
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['students'] });
      void queryClient.invalidateQueries({ queryKey: ['guardians'] });
    },
  });
}

/** Picker source for anything filed against a single student — e.g. their login. */
export function useStudentOptions(search: string) {
  const { i18n } = useTranslation();
  const query = useLookupQuery('students', studentsApi.list, search, {}, 25);

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((student) => ({
      value: student.id,
      label: `${student.studentCode} — ${fullName(student, i18n.language)}`,
    })),
  };
}

export function useUploadStudentPhoto(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) =>
      studentsApi.uploadPhoto(id!, file, onProgress),
    meta: { successMessage: 'toast.uploaded' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] }),
  });
}

// ── Read-only summaries shown on the student detail page ────────────────────

/** `GET /term-results/student/:studentId/semester/:semesterId`. */
export interface TermResultSubjectRow {
  subjectId: string;
  subjectNameLo: string;
  credits: number;
  percentage: number;
  grade: string;
  gradePoint: number;
  isPassed: boolean;
  isIncomplete: boolean;
}

export interface TermResult {
  id: string;
  studentCode: string;
  studentNameLo: string;
  subjects: TermResultSubjectRow[];
  average: number;
  gpa: number;
  grade: string;
  rank?: number | null;
  totalStudents?: number | null;
  isPublished?: boolean;
}

/**
 * Scoped to a semester, and 404s when nothing has been recorded yet — a normal
 * state for a newly enrolled student, so it is not retried and surfaces as an
 * empty panel rather than an error. The attendance half of the same page lives
 * in `features/attendances/api`, which owns that endpoint.
 */
export function useStudentTermResult(studentId: string | undefined, semesterId: string | undefined) {
  return useQuery({
    queryKey: ['term-results', 'student', studentId, semesterId],
    queryFn: () => get<TermResult>(`/term-results/student/${studentId}/semester/${semesterId}`),
    enabled: Boolean(studentId && semesterId),
    retry: false,
  });
}
