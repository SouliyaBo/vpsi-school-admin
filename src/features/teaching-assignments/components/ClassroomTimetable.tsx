import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { fullName, localizedName, refObject } from '@/lib/utils';
import type { Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EntitySelect } from '@/components/common/EntitySelect';
import { useClassroomSchedule } from '../api';
import { countPeriods, toTimetableEntries, type TimetableEntry } from '../schedule';
import { TimetableGrid } from './TimetableGrid';

/**
 * "What does this class study, and who teaches it?"
 *
 * The mirror of the teacher view, off the endpoint that populates subject and
 * teacher instead. It is also the sheet a class is handed at the start of term,
 * which is why the week reads across days rather than per subject.
 */
export function ClassroomTimetable() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const [classroomId, setClassroomId] = useState<string>();
  const [semesterId, setSemesterId] = useState<string>();

  const effectiveSemesterId = semesterId ?? activeSemester.data?.id;
  const schedule = useClassroomSchedule(classroomId, effectiveSemesterId);
  const assignments = schedule.data ?? [];

  const useSemestersForYear = (search: string) => useSemesterOptions(search, activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <EntitySelect
            value={classroomId ?? null}
            onChange={setClassroomId}
            useOptions={useClassroomsForYear}
            placeholder={t('assignment.selectClassroom')}
            label={t('assignment.classroom')}
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

        {classroomId && effectiveSemesterId && !schedule.isLoading && (
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
            hint={
              !classroomId || !effectiveSemesterId ? t('assignment.classroomViewHint') : undefined
            }
            primary={(entry) =>
              localizedName(refObject<Subject>(entry.assignment.subjectId), i18n.language)
            }
            secondary={(entry) => {
              const teacher = refObject<Teacher>(entry.assignment.teacherId);
              return teacher ? fullName(teacher, i18n.language) : '—';
            }}
            // A class stays put through a swap; what alternates for them is
            // which subject — and which teacher — turns up.
            rotationPartner={(partners: TimetableEntry[]) => {
              const subjects = partners
                .map((partner) => refObject<Subject>(partner.assignment.subjectId))
                .filter((subject): subject is Subject => subject !== null && subject !== undefined)
                .map((subject) => localizedName(subject, i18n.language));
              return subjects.length > 0 ? [...new Set(subjects)].join(', ') : null;
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
