import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, upload } from '@/lib/api-client';
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
