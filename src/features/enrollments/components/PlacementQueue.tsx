import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, School } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { students } from '@/features/students/api';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { errorMessage } from '@/lib/error-message';
import { calculateAge, fullName } from '@/lib/utils';
import { notify } from '@/lib/toast';
import type { Student } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { useBulkEnroll } from '../api';

/**
 * The students who have no class for the active school year.
 *
 * This is the screen the start of a term is actually spent on, so it places many
 * at once: select rows, pick a class, submit. The API's bulk endpoint runs each
 * row in its own transaction, so a class filling up mid-batch rejects only the
 * rows that no longer fit and reports them back — which is why the failures are
 * listed rather than collapsed into one error.
 */
export function PlacementQueue() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const table = useTableQueryState({ defaultSortBy: 'studentCode', defaultSortOrder: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetClassroom, setTargetClassroom] = useState<string | undefined>();

  const bulkEnroll = useBulkEnroll();

  const list = students.useList({
    ...table.queryParams,
    // The filter the API gained for exactly this screen.
    enrolled: false,
    status: 'active',
  });

  const rows = list.data?.data ?? [];
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((previous) => {
      const next = new Set(previous);
      // Selection spans pages, so this only adds or removes the current page.
      for (const row of rows) {
        if (allOnPageSelected) next.delete(row.id);
        else next.add(row.id);
      }
      return next;
    });
  }

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);

  const columns = useMemo<ColumnDef<Student, unknown>[]>(
    () => [
      {
        id: 'select',
        header: () => (
          <Checkbox
            checked={allOnPageSelected}
            onCheckedChange={toggleAllOnPage}
            aria-label={t('common.all')}
            disabled={rows.length === 0}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selected.has(row.original.id)}
            onCheckedChange={() => toggle(row.original.id)}
            aria-label={fullName(row.original, i18n.language)}
            onClick={(event) => event.stopPropagation()}
          />
        ),
        meta: { className: 'w-10' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'studentCode',
        header: t('student.studentCode'),
        cell: ({ row }) => <span className="font-medium">{row.original.studentCode}</span>,
        meta: { sortKey: 'studentCode' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => fullName(row.original, i18n.language),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'gender',
        header: t('person.gender'),
        cell: ({ row }) => t(`gender.${row.original.gender}`),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'age',
        header: t('person.age'),
        cell: ({ row }) => calculateAge(row.original.dateOfBirth) ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
    ],
    // `rows` and `selected` drive the header/row checkboxes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, selected, rows, allOnPageSelected],
  );

  function submit() {
    if (!targetClassroom || selected.size === 0) return;

    const items = rows
      .filter((row) => selected.has(row.id))
      .map((row) => ({ studentCode: row.studentCode, classroomId: targetClassroom }));

    // Only rows on the current page can be sent: the bulk endpoint needs each
    // student's code, and selections from other pages are no longer in memory.
    bulkEnroll
      .mutateAsync(items)
      .then((result) => {
        const summary = t('enrollment.bulkResult', {
          enrolled: result.enrolled,
          failed: result.failed,
        });

        if (result.failed === 0) {
          notify.success(summary);
        } else {
          // Name the rejected rows: a half-successful batch is only actionable if
          // the user can see which students still need a class, and why.
          notify.warning(
            summary,
            result.errors.map((error) => `${error.studentCode}: ${error.reason}`).join('\n'),
          );
        }
        setSelected(new Set());
      })
      .catch((error) => notify.error(error));
  }

  const selectedOnPage = rows.filter((row) => selected.has(row.id)).length;

  return (
    <div className="space-y-3">
      {!activeYear.data && !activeYear.isLoading ? (
        <EmptyState icon={School} title={t('enrollment.noActiveYearHint')} />
      ) : (
        <>
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
            emptyTitle={t('enrollment.queueEmpty')}
            toolbar={
              <TableToolbar
                hasActiveFilters={table.hasActiveFilters}
                onClearFilters={table.clearFilters}
              >
                <SearchInput
                  value={table.search ?? ''}
                  onChange={table.setSearch}
                  className="w-full sm:w-64"
                />
              </TableToolbar>
            }
          />

          {selectedOnPage > 0 && (
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-primary" aria-hidden />
                {t('enrollment.selected', { count: selectedOnPage })}
              </div>

              <div className="min-w-56 flex-1">
                <EntitySelect
                  value={targetClassroom ?? null}
                  onChange={setTargetClassroom}
                  useOptions={useClassroomsForYear}
                  placeholder={t('enrollment.selectClassroom')}
                  label={t('enrollment.selectClassroom')}
                />
              </div>

              <Button
                onClick={submit}
                disabled={!targetClassroom}
                loading={bulkEnroll.isPending}
              >
                <School />
                {t('enrollment.assignSelected', { count: selectedOnPage })}
              </Button>
            </div>
          )}

          {bulkEnroll.isError && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(bulkEnroll.error)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
