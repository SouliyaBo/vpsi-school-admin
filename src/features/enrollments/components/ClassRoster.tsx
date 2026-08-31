import { Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { classroomLabel, classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { formatDate, refId } from '@/lib/utils';
import type { EnrollmentStatus } from '@/types/enums';
import type { Enrollment } from '@/types/entities';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ALLOWED_TRANSITIONS, useClassRoster } from '../api';
import {
  EnrollmentMoveDialog,
  STATUS_ICONS,
  STATUS_LABEL_KEYS,
  type EnrollmentMove,
} from './EnrollmentMoveDialog';

/**
 * One classroom's students, in roll-number order.
 *
 * The roster endpoint returns the denormalized student name and code on each row,
 * so this renders without joining back to `students`.
 */
export function ClassRoster() {
  const { t } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [move, setMove] = useState<EnrollmentMove | null>(null);

  const roster = useClassRoster(classroomId);
  const classroom = classrooms.useDetail(classroomId);

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);

  function openMove(enrollment: Enrollment, status: EnrollmentStatus) {
    setMove({ enrollment, status });
  }

  const occupancy = classroom.data
    ? Math.round((classroom.data.currentCount / Math.max(classroom.data.capacity, 1)) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <EntitySelect
            value={classroomId ?? null}
            onChange={setClassroomId}
            useOptions={useClassroomsForYear}
            placeholder={t('enrollment.selectClassroom')}
            label={t('enrollment.selectClassroom')}
          />
        </div>

        {classroom.data && (
          <div className="flex min-w-44 items-center gap-2">
            <Progress value={Math.min(occupancy, 100)} className="h-1.5 flex-1" />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {classroom.data.currentCount}/{classroom.data.capacity}
            </span>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          {!classroomId ? (
            <EmptyState icon={Users} title={t('enrollment.rosterHint')} />
          ) : roster.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : roster.error ? (
            <ErrorState error={roster.error} onRetry={roster.refetch} compact />
          ) : !roster.data?.length ? (
            <EmptyState icon={Users} title={t('common.noData')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t('enrollment.rollNumber')}</TableHead>
                  <TableHead>{t('student.studentCode')}</TableHead>
                  <TableHead>{t('person.fullName')}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t('enrollment.enrolledAt')}
                  </TableHead>
                  <TableHead>{t('person.status')}</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.data.map((enrollment) => {
                  const studentId = refId(enrollment.studentId);
                  return (
                    <TableRow key={enrollment.id}>
                      <TableCell className="text-muted-foreground">
                        {enrollment.rollNumber ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">{enrollment.studentCode}</TableCell>
                      <TableCell>
                        {studentId ? (
                          <Link to={`/students/${studentId}`} className="hover:underline">
                            {enrollment.studentNameLo}
                          </Link>
                        ) : (
                          enrollment.studentNameLo
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {formatDate(enrollment.enrolledAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={enrollment.status} namespace="enrollmentStatus" />
                      </TableCell>
                      <TableCell className="text-end">
                        <RowActions
                          actions={ALLOWED_TRANSITIONS[enrollment.status].map((status) => ({
                            label: t(STATUS_LABEL_KEYS[status]),
                            icon: STATUS_ICONS[status],
                            destructive: status === 'dropped',
                            hidden: !can('enrollments', 'update'),
                            onSelect: () => openMove(enrollment, status),
                          }))}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EnrollmentMoveDialog
        move={move}
        onClose={() => setMove(null)}
        fromLabel={classroom.data ? classroomLabel(classroom.data) : undefined}
      />

      <p className="text-xs text-muted-foreground">{t('enrollment.transferNote')}</p>
    </div>
  );
}
