import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { classroomLabel } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { localizedName, refObject } from '@/lib/utils';
import type { Classroom, Subject } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EntitySelect } from '@/components/common/EntitySelect';
import { useTeacherSchedule } from '../api';
import { countPeriods, toTimetableEntries, type TimetableEntry } from '../schedule';
import { TimetableGrid } from './TimetableGrid';

/**
 * "Where is this teacher, and when?"
 *
 * The endpoint behind it returns active assignments only, so a posting that has
 * been switched off is not shown as a lesson the teacher is expected to give.
 * It populates the subject and the classroom — the two axes a teacher's own
 * week does not already fix — so each card renders without a further join.
 */
export function TeacherTimetable() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const [teacherId, setTeacherId] = useState<string>();
  const [semesterId, setSemesterId] = useState<string>();

  // The current semester is the answer nine times out of ten, so it is the
  // starting point until the user picks another.
  const effectiveSemesterId = semesterId ?? activeSemester.data?.id;
  const schedule = useTeacherSchedule(teacherId, effectiveSemesterId);
  const assignments = schedule.data ?? [];

  const useSemestersForYear = (search: string) => useSemesterOptions(search, activeYear.data?.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <EntitySelect
            value={teacherId ?? null}
            onChange={setTeacherId}
            useOptions={useTeacherOptions}
            placeholder={t('assignment.selectTeacher')}
            label={t('assignment.teacher')}
          />
        </div>
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <EntitySelect
            value={effectiveSemesterId ?? null}
            onChange={setSemesterId}
            useOptions={useSemestersForYear}
            placeholder={t('assignment.selectSemester')}
            label={t('assignment.semester')}
            // Clearing would only fall straight back to the active semester.
            clearable={false}
          />
        </div>

        {teacherId && effectiveSemesterId && !schedule.isLoading && (
          <Badge variant="outline">
            {t('assignment.periodsPerWeek', { count: countPeriods(assignments) })}
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <TimetableGrid
            entries={toTimetableEntries(assignments)}
            isLoading={schedule.isLoading}
            error={schedule.error}
            onRetry={schedule.refetch}
            hint={!teacherId || !effectiveSemesterId ? t('assignment.teacherViewHint') : undefined}
            primary={(entry) =>
              localizedName(refObject<Subject>(entry.assignment.subjectId), i18n.language)
            }
            secondary={(entry) => {
              // Grade-qualified: a teacher across m3/m4/m5 would otherwise see
              // the same section letter in every cell of their week.
              const room = refObject<Classroom>(entry.assignment.classroomId);
              return room ? classroomLabel(room) : '—';
            }}
            // On a teacher's own week, what a swap alternates between is the
            // class they are in — which of the two rooms they walk into.
            rotationPartner={(partners: TimetableEntry[]) => {
              const classes = partners
                .map((partner) => refObject<Classroom>(partner.assignment.classroomId))
                .filter((room): room is Classroom => room !== null && room !== undefined)
                .map(classroomLabel);
              return classes.length > 0 ? [...new Set(classes)].join(', ') : null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
