import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { Subject } from '@/types/entities';
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
  passingPercentage?: number;
  /** Strands of the monthly mark sheet; an empty list marks the subject as one. */
  strands?: string[];
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

export function useSubjectOptions(search = '', gradeLevelId?: string) {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'subjects',
    subjectsApi.list,
    search,
    gradeLevelId ? { gradeLevelId } : {},
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
export function useSubjectsByGrade(gradeLevelId?: string) {
  return useQuery({
    queryKey: ['subjects', 'by-grade', gradeLevelId],
    queryFn: () =>
      subjectsApi.list({
        gradeLevelId,
        isActive: true,
        limit: 100,
        sortBy: 'code',
        sortOrder: 'asc',
      }),
    enabled: Boolean(gradeLevelId),
    staleTime: 60_000,
  });
}
