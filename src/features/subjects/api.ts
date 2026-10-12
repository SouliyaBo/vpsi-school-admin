import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { MonthlyColumnMax, Subject } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface SubjectInput {
  code: string;
  nameLo: string;
  nameEn?: string;
  gradeLevelId: string;
  /** The department. `null` on update detaches the subject from its group. */
  subjectGroupId?: string | null;
  type?: 'core' | 'elective' | 'extracurricular';
  credits?: number;
  hoursPerWeek?: number;
  /** Column order on the mark sheet, low first. */
  sortOrder?: number;
  passingPercentage?: number;
  /** Strands of the monthly mark sheet; an empty list marks the subject as one. */
  strands?: string[];
  /** The ສາຍວິຊາ this subject is marked under; `null` detaches it. */
  parentSubjectId?: string | null;
  /**
   * ຄະແນນເຕັມ of the monthly sheet's four columns, which must total 10.
   * `null` puts the subject back on the school's usual 1 / 1 / 2 / 6.
   */
  monthlyColumnMax?: MonthlyColumnMax | null;
}

export const subjectsApi = createCrudApi<Subject, SubjectInput>('/subjects');
export const subjects = createCrudHooks<Subject, SubjectInput>('subjects', subjectsApi);

/**
 * `MATH4 — Mathematics`. The code leads because two subjects of neighbouring
 * grades translate to the same name, and only the code tells them apart.
 */
export function subjectLabel(subject: Subject, locale: string): string {
  return `${subject.code} — ${localizedName(subject, locale)}`;
}

/**
 * Which of the two jobs a subject does — see `Subject.parentSubjectId` on the API.
 *
 * `taught` is the four ສາຍວິຊາ a teacher is assigned to and roll call is taken
 * against; `marked` is what a mark is recorded against, which from ມ.4 up is the
 * eight (or seven) subjects those split into. A picker almost always wants one
 * or the other: offering the union would let the office assign a teacher to
 * ຟີຊິກສາດ, which the timetable has no room for, or open a mark sheet on
 * ທຳມະຊາດ, which is not marked as a whole.
 */
export type SubjectRole = 'taught' | 'marked';

export function useSubjectOptions(search = '', gradeLevelId?: string, role?: SubjectRole) {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'subjects',
    subjectsApi.list,
    search,
    { ...(gradeLevelId ? { gradeLevelId } : {}), ...(role ? { role } : {}) },
    // The API's ceiling. A subject exists per grade level, so a school teaching
    // seven grades has seven rows for maths alone — at 50 the tail of the
    // alphabet fell off the unfiltered lists, unreachable without searching.
    100,
  );

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((subject) => ({
      value: subject.id,
      label: subjectLabel(subject, i18n.language),
    })),
  };
}

/**
 * A grade level's whole curriculum.
 *
 * Not a lookup: the caller ticks subjects off a complete list rather than
 * searching for one, so this returns whole records and takes no search term. A
 * grade teaches a dozen or so subjects, well inside one page.
 */
export function useSubjectsByGrade(gradeLevelId?: string, role?: SubjectRole) {
  return useQuery({
    queryKey: ['subjects', 'by-grade', gradeLevelId, role],
    queryFn: () =>
      subjectsApi.list({
        gradeLevelId,
        role,
        isActive: true,
        limit: 100,
        sortBy: 'code',
        sortOrder: 'asc',
      }),
    enabled: Boolean(gradeLevelId),
    staleTime: 60_000,
  });
}
