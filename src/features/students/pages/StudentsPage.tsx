import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, School, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { EnrollDialog } from '@/features/enrollments/components/EnrollDialog';
import { useGradeLevelOptions } from '@/features/grade-levels/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { calculateAge, formatDate, fullName, initials, nickname } from '@/lib/utils';
import { GENDERS, STUDENT_STATUSES } from '@/types/enums';
import type { Student } from '@/types/entities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { StudentFormDialog } from '../components/StudentFormDialog';
import { students } from '../api';

export function StudentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();

  // `classroomId` and `gradeLevelId` are resolved by the API through the
  // enrollment collection, so filtering by class does not need a second request.
  const table = useTableQueryState({
    defaultSortBy: 'studentCode',
    defaultSortOrder: 'asc',
    filterKeys: ['status', 'gender', 'gradeLevelId', 'classroomId', 'villageId', 'enrolled'],
  });
  const dialogs = useCrudDialogs<Student>();

  /** Student waiting to be placed in a class, either just created or picked from a row. */
  const [enrollTarget, setEnrollTarget] = useState<Student | null>(null);
  /** Newly created student, held while the "place them now?" prompt is open. */
  const [justCreated, setJustCreated] = useState<Student | null>(null);

  const list = students.useList(table.queryParams);
  const remove = students.useDelete();
  const gradeOptions = useGradeLevelOptions();
  const classroomOptions = useClassroomOptions();

  const columns = useMemo<ColumnDef<Student, unknown>[]>(
    () => [
      {
        accessorKey: 'studentCode',
        header: t('student.studentCode'),
        cell: ({ row }) => <span className="font-medium">{row.original.studentCode}</span>,
        meta: { sortKey: 'studentCode' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              {/* Staff recognise a child by their face before their name, so the
                  roster shows the photo where there is one. `photoUrl` is a
                  short-lived signed URL minted per request — the object key
                  never leaves the API — and initials stay as the fallback for
                  the students who have no photo on file yet. */}
              {row.original.photoUrl && (
                <AvatarImage src={row.original.photoUrl} alt="" loading="lazy" />
              )}
              <AvatarFallback>{initials(row.original)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {fullName(row.original, i18n.language)}
                {/* The name staff actually use, kept on the same line so the
                    row height does not grow for it. */}
                {nickname(row.original, i18n.language) && (
                  <span className="ms-1.5 font-normal text-muted-foreground">
                    ({nickname(row.original, i18n.language)})
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t(`gender.${row.original.gender}`)}
                {calculateAge(row.original.dateOfBirth) !== null &&
                  ` · ${calculateAge(row.original.dateOfBirth)} ${t('person.age')}`}
              </p>
            </div>
          </div>
        ),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        id: 'primaryGuardian',
        header: t('student.guardians'),
        // The link is denormalized on the student, so the roster needs no join.
        cell: ({ row }) => {
          const primary =
            row.original.guardians?.find((link) => link.isPrimary) ?? row.original.guardians?.[0];
          if (!primary) return '—';
          return (
            <div className="min-w-0">
              <p className="truncate">{primary.fullNameLo}</p>
              <p className="text-xs text-muted-foreground">
                {t(`relationship.${primary.relationship}`)} · {primary.phone}
              </p>
            </div>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'classroom',
        header: t('enrollment.classroom'),
        // Resolved by the API from the active enrollment for the current school
        // year, so no per-row request is needed.
        cell: ({ row }) => {
          const placement = row.original.currentEnrollment;
          if (!placement) {
            return <Badge variant="warning">{t('enrollment.noClassroom')}</Badge>;
          }
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {placement.gradeLevelCode
                  ? `${placement.gradeLevelCode} ${placement.classroomName}`
                  : placement.classroomName}
              </p>
              {placement.rollNumber != null && (
                <p className="text-xs text-muted-foreground">
                  {t('enrollment.rollNumber')} {placement.rollNumber}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('person.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} namespace="studentStatus" />,
      },
      {
        accessorKey: 'admissionDate',
        header: t('student.admissionDate'),
        cell: ({ row }) => formatDate(row.original.admissionDate),
        meta: { sortKey: 'admissionDate', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('common.details'),
                icon: Eye,
                onSelect: () => navigate(`/students/${row.original.id}`),
              },
              {
                label: t('enrollment.enroll'),
                icon: School,
                // Moving an already-placed student is a transfer, which belongs on
                // the enrollment screen where the origin class is visible.
                hidden: !can('enrollments', 'create') || Boolean(row.original.currentEnrollment),
                onSelect: () => setEnrollTarget(row.original),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('students', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('students', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs, navigate],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('student.title')}
        description={
          list.data ? `${t('common.total')}: ${list.data.meta.total.toLocaleString()}` : undefined
        }
        actions={
          can('students', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('student.create')}
            </Button>
          )
        }
      />

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
        onRowClick={(row) => navigate(`/students/${row.id}`)}
        getRowId={(row) => row.id}
        toolbar={
          <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} className="w-full sm:w-64" />
            {/* The API narrows to the current roll — `active` plus
                `no_certificate`, since declining the certificate does not take a
                child out of a classroom — when no status is given, so the trigger
                shows that rather than "all", and seeing leavers and graduates
                means asking for `all` by name. */}
            <FilterSelect
              value={table.filters.status ?? 'current'}
              onChange={(value) => table.setFilter('status', value)}
              allValue="all"
              allLabel={t('student.everyStatus')}
              options={[
                { value: 'current', label: t('student.currentRoll') },
                ...STUDENT_STATUSES.map((status) => ({
                  value: status,
                  label: t(`studentStatus.${status}`),
                })),
              ]}
              placeholder={t('person.status')}
            />
            <FilterSelect
              value={table.filters.gradeLevelId}
              onChange={(value) => table.setFilter('gradeLevelId', value)}
              options={gradeOptions.data ?? []}
              placeholder={t('gradeLevel.title')}
            />
            <FilterSelect
              value={table.filters.classroomId}
              onChange={(value) => table.setFilter('classroomId', value)}
              options={classroomOptions.data ?? []}
              placeholder={t('classroom.title')}
            />
            <FilterSelect
              value={table.filters.gender}
              onChange={(value) => table.setFilter('gender', value)}
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
              placeholder={t('person.gender')}
            />
            <FilterSelect
              value={table.filters.enrolled}
              onChange={(value) => table.setFilter('enrolled', value)}
              options={[
                { value: 'false', label: t('enrollment.unassigned') },
                { value: 'true', label: t('enrollment.assigned') },
              ]}
              placeholder={t('enrollment.placement')}
            />
          </TableToolbar>
        }
      />

      <StudentFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        student={dialogs.record}
        // A new student has no class yet, and a class is what makes them appear in
        // rosters, score sheets and attendance — so the offer to place them comes
        // straight after saving rather than being left to be discovered.
        // The prompt is the fallback for a student who ended up unplaced —
        // either no classroom was picked, or the placement was rejected.
        onCreated={(created, placed) => {
          if (!placed) setJustCreated(created);
        }}
      />

      <ConfirmDialog
        open={justCreated !== null}
        onOpenChange={(open) => !open && setJustCreated(null)}
        title={t('enrollment.askEnrollTitle')}
        description={
          justCreated
            ? t('enrollment.askEnrollBody', { name: fullName(justCreated, i18n.language) })
            : undefined
        }
        tone="default"
        confirmLabel={t('enrollment.askEnrollNow')}
        cancelLabel={t('enrollment.askEnrollLater')}
        onConfirm={() => {
          setEnrollTarget(justCreated);
          setJustCreated(null);
        }}
      />

      <EnrollDialog
        open={enrollTarget !== null}
        onOpenChange={(open) => !open && setEnrollTarget(null)}
        student={enrollTarget}
        onEnrolled={() => setEnrollTarget(null)}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('student.deleteConfirm', { name: fullName(dialogs.deleteTarget, i18n.language) })
            : undefined
        }
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}
