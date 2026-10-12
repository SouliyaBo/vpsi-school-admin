import type { ColumnDef } from '@tanstack/react-table';
import { UserMinus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { classroomLabel, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { notify } from '@/lib/toast';
import { formatDate, fullName, localizedName, refObject } from '@/lib/utils';
import type { Classroom, LessonSubstitution, Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { useLessonSubstitutions, useWithdrawLessonCover } from '../api';

/**
 * ການສອນແທນ — who stood in for whom.
 *
 * Deliberately a log and not a form. Cover is claimed where it is used — on the
 * roll-call sheet, by the teacher standing in front of the class — because that is
 * the moment somebody knows it happened. This page is what the claim becomes
 * afterwards: the office's record of who covered what, and the one place a claim
 * made by mistake can be withdrawn.
 *
 * The API narrows a teacher's read to the claims they are a party to — cover they
 * took, and cover taken of their own lessons — so the same page serves a teacher
 * checking what they are answerable for and the office reading the school.
 */
export function LessonCoverPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const user = useCurrentUser();
  const activeYear = useActiveSchoolYear();

  const table = useTableQueryState({ filterKeys: ['classroomId'] });
  const [withdrawing, setWithdrawing] = useState<LessonSubstitution | null>(null);

  const list = useLessonSubstitutions(table.queryParams);
  const withdraw = useWithdrawLessonCover();

  const classroomOptions = useClassroomOptions('', activeYear.data?.id);

  const oversees = can('lesson-substitutions', 'manage');
  const myTeacherId = user?.personType === 'teacher' ? (user.personId ?? null) : null;

  const columns = useMemo<ColumnDef<LessonSubstitution, unknown>[]>(
    () => [
      {
        id: 'date',
        header: t('cover.date'),
        cell: ({ row }) => (
          <span className="tabular-nums">{formatDate(row.original.date)}</span>
        ),
        meta: { sortKey: 'date' } satisfies DataTableColumnMeta,
      },
      {
        id: 'lesson',
        header: t('cover.lesson'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          const room = refObject<Classroom>(row.original.classroomId);
          return (
            <div className="leading-tight">
              <p>{subject ? localizedName(subject, i18n.language) : '—'}</p>
              <p className="text-xs text-muted-foreground">{room ? classroomLabel(room) : '—'}</p>
            </div>
          );
        },
      },
      {
        id: 'substitute',
        header: t('cover.substituteTeacher'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.substituteTeacherId);
          if (!teacher) return '—';
          return (
            <div className="leading-tight">
              <p className="font-medium">{fullName(teacher, i18n.language)}</p>
              <p className="text-xs text-muted-foreground">{teacher.teacherCode ?? '—'}</p>
            </div>
          );
        },
      },
      {
        id: 'owner',
        header: t('cover.timetabledTeacher'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.ownerTeacherId);
          return teacher ? fullName(teacher, i18n.language) : '—';
        },
      },
      {
        id: 'reason',
        header: t('cover.reasonLabel'),
        cell: ({ row }) =>
          row.original.reason ? (
            <Badge variant="secondary">{row.original.reason}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          // A teacher withdraws their own cover and nobody else's; the office
          // withdraws anyone's. The API enforces the same split, so this only
          // decides whether the button is worth showing.
          const mine =
            myTeacherId !== null &&
            refObject<Teacher>(row.original.substituteTeacherId)?.id === myTeacherId;
          if (!oversees && !mine) return null;

          return (
            <RowActions
              actions={[
                {
                  label: t('cover.withdraw'),
                  icon: UserMinus,
                  destructive: true,
                  onSelect: () => setWithdrawing(row.original),
                },
              ]}
            />
          );
        },
        meta: { className: 'w-12' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, oversees, myTeacherId],
  );

  const withdrawnSubject = withdrawing
    ? refObject<Subject>(withdrawing.subjectId)
    : null;
  const withdrawnOwner = withdrawing ? refObject<Teacher>(withdrawing.ownerTeacherId) : null;

  return (
    <div className="space-y-4">
      <PageHeader title={t('cover.title')} description={t('cover.subtitle')} />

      <DataTable
        columns={columns}
        result={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        error={list.error}
        onRetry={list.refetch}
        sortBy={table.sortBy}
        sortOrder={table.sortOrder}
        onSortChange={table.setSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        getRowId={(row) => row.id}
        emptyTitle={t('cover.empty')}
        emptyDescription={t('cover.emptyHint')}
        toolbar={
          <TableToolbar>
            <FilterSelect
              value={table.filters.classroomId}
              onChange={(value) => table.setFilter('classroomId', value)}
              options={classroomOptions.data ?? []}
              placeholder={t('cover.allClasses')}
            />
          </TableToolbar>
        }
      />

      <ConfirmDialog
        open={withdrawing !== null}
        onOpenChange={(open) => !open && setWithdrawing(null)}
        tone="danger"
        title={t('cover.withdrawTitle')}
        description={t('cover.withdrawBody', {
          subject: withdrawnSubject ? localizedName(withdrawnSubject, i18n.language) : '—',
          date: withdrawing ? formatDate(withdrawing.date) : '',
          teacher: withdrawnOwner ? fullName(withdrawnOwner, i18n.language) : '—',
        })}
        confirmLabel={t('cover.withdraw')}
        isPending={withdraw.isPending}
        onConfirm={() => {
          if (!withdrawing) return;
          withdraw.mutate(withdrawing.id, {
            onSuccess: () => {
              notify.success(t('cover.withdrawn'));
              setWithdrawing(null);
            },
            onError: (error) => notify.error(error),
          });
        }}
      />
    </div>
  );
}
