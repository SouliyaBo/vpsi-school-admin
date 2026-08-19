import { useCurrentUser } from '@/features/auth/hooks';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { refId, refObject } from '@/lib/utils';
import type { Classroom, GradeLevel, Teacher } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface ClassroomInput {
  schoolYearId: string;
  gradeLevelId: string;
  name: string;
  homeroomTeacherId?: string;
  capacity?: number;
  room?: string;
}

/**
 * What a PATCH may carry.
 *
 * `schoolYearId` and `gradeLevelId` are missing on purpose: a classroom belongs
 * to one year and one grade for its whole life, and the API's update DTO does
 * not accept them. It rejects unknown properties outright rather than ignoring
 * them, so sending the two back — as a form holding every field naturally does
 * — fails the whole save.
 *
 * `homeroomTeacherId` accepts `null`, which is how the teacher is cleared;
 * omitting it leaves whoever is already assigned in place.
 */
export interface ClassroomUpdateInput {
  name?: string;
  homeroomTeacherId?: string | null;
  capacity?: number;
  room?: string;
  isActive?: boolean;
}

export const classroomsApi = createCrudApi<Classroom, ClassroomInput, ClassroomUpdateInput>(
  '/classrooms',
);
export const classrooms = createCrudHooks<Classroom, ClassroomInput, ClassroomUpdateInput>(
  'classrooms',
  classroomsApi,
);

/**
 * `m4 A` — a section name is only unique within its grade, so the grade code is
 * part of the label everywhere a classroom is shown.
 */
export function classroomLabel(classroom: Classroom): string {
  const grade = refObject<GradeLevel>(classroom.gradeLevelId);
  return grade ? `${grade.code} ${classroom.name}` : classroom.name;
}

/**
 * Classroom picker options.
 *
 * `onlyMine` narrows the list to the rooms the signed-in teacher is homeroom
 * teacher of, which is the only place the API lets them put a student. Filtered
 * here rather than through `?homeroomTeacherId=` because that server-side filter
 * misses any room whose teacher was set through the admin — those rows hold the
 * id as a string, and the query casts to an ObjectId. A school year's worth of
 * rooms is a couple of dozen, so the filtering costs nothing.
 */
export function useClassroomOptions(search = '', schoolYearId?: string, onlyMine = false) {
  const user = useCurrentUser();
  const query = useLookupQuery(
    'classrooms',
    classroomsApi.list,
    search,
    schoolYearId ? { schoolYearId } : {},
    50,
  );

  const rooms = query.data?.data.filter(
    (classroom) =>
      !onlyMine || (user?.personId && refId<Teacher>(classroom.homeroomTeacherId) === user.personId),
  );

  return {
    isLoading: query.isLoading,
    data: rooms?.map<SelectOption>((classroom) => ({
      value: classroom.id,
      label: `${classroomLabel(classroom)} · ${classroom.currentCount}/${classroom.capacity}`,
    })),
  };
}
