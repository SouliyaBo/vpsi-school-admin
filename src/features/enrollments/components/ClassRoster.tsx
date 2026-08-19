import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, GraduationCap, RotateCcw, UserMinus, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { classroomLabel, classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { stripEmpty } from '@/lib/payload';
import { formatDate, refId } from '@/lib/utils';
import { optionalId, optionalText } from '@/lib/zod-helpers';
import { vmsg } from '@/lib/form-message';
import type { EnrollmentStatus } from '@/types/enums';
import type { Enrollment } from '@/types/entities';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
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
import { EntitySelect, EntitySelectField } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { FieldSection, TextareaField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ALLOWED_TRANSITIONS, useChangeEnrollmentStatus, useClassRoster } from '../api';

const baseSchema = z.object({
  transferredToClassroomId: optionalId(),
  reason: optionalText(500),
});

/** Only a transfer needs a destination; the other moves just take a reason. */
const transferSchema = baseSchema.refine((values) => Boolean(values.transferredToClassroomId), {
  path: ['transferredToClassroomId'],
  message: vmsg('validation.required'),
});

type StatusFormValues = z.infer<typeof baseSchema>;

const STATUS_ICONS: Partial<Record<EnrollmentStatus, typeof ArrowRightLeft>> = {
  transferred: ArrowRightLeft,
  promoted: GraduationCap,
  dropped: UserMinus,
  repeated: RotateCcw,
  active: RotateCcw,
};

const STATUS_LABEL_KEYS: Record<EnrollmentStatus, string> = {
  transferred: 'enrollment.transfer',
  promoted: 'enrollment.promote',
  dropped: 'enrollment.drop',
  repeated: 'enrollment.repeat',
  active: 'enrollment.reactivate',
};

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
  const [move, setMove] = useState<{ enrollment: Enrollment; status: EnrollmentStatus } | null>(
    null,
  );

  const roster = useClassRoster(classroomId);
  const classroom = classrooms.useDetail(classroomId);
  const changeStatus = useChangeEnrollmentStatus();

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);

  const form = useForm<StatusFormValues>({
    // Which rule applies depends on the move being made, so the resolver follows
    // the open dialog rather than carrying the branch inside one schema.
    resolver: zodResolver(move?.status === 'transferred' ? transferSchema : baseSchema),
    defaultValues: { transferredToClassroomId: '', reason: '' },
  });

  function openMove(enrollment: Enrollment, status: EnrollmentStatus) {
    form.reset({ transferredToClassroomId: '', reason: '' });
    setMove({ enrollment, status });
  }

  function submitMove(values: StatusFormValues) {
    if (!move) return;

    changeStatus
      .mutateAsync({
        id: move.enrollment.id,
        body: { status: move.status, ...(stripEmpty(values) as StatusFormValues) },
      })
      .then(() => setMove(null))
      .catch(() => {});
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

      <FormDialog
        open={move !== null}
        onOpenChange={(open) => !open && setMove(null)}
        title={move ? t(STATUS_LABEL_KEYS[move.status]) : ''}
        description={
          move
            ? `${move.enrollment.studentCode} — ${move.enrollment.studentNameLo}${
                classroom.data ? ` · ${classroomLabel(classroom.data)}` : ''
              }`
            : undefined
        }
        onSubmit={form.handleSubmit(submitMove)}
        isSubmitting={changeStatus.isPending}
        submitLabel={move ? t(STATUS_LABEL_KEYS[move.status]) : undefined}
      >
        <Form {...form}>
          <FieldSection columns={1}>
            {move?.status === 'transferred' && (
              <EntitySelectField
                control={form.control}
                name="transferredToClassroomId"
                label={t('enrollment.transferTo')}
                required
                useOptions={useClassroomsForYear}
                searchPlaceholder={t('enrollment.selectClassroom')}
              />
            )}
            <TextareaField
              control={form.control}
              name="reason"
              label={t('enrollment.statusReason')}
              description={t('enrollment.statusReasonHint')}
            />
          </FieldSection>
        </Form>
      </FormDialog>

      <p className="text-xs text-muted-foreground">{t('enrollment.transferNote')}</p>
    </div>
  );
}
