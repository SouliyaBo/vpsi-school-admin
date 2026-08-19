import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Pagination } from './Pagination';
import { TableSkeleton } from './TableSkeleton';

/**
 * Server-driven table.
 *
 * Paging, sorting and filtering all happen in the API: student and score
 * collections are far too large to pull down and slice in the browser. TanStack
 * Table is used only for column definition and rendering (`manualPagination` /
 * `manualSorting`), never for its client-side row models.
 *
 * A column opts into sorting by setting `meta.sortKey` to the field name the
 * endpoint whitelists — an unknown `sortBy` is ignored by the API, so this is
 * the one place the two have to agree.
 */

export interface DataTableColumnMeta {
  /** API field name for `?sortBy=`. Omit to make the column unsortable. */
  sortKey?: string;
  /** Extra classes for both the header and body cells (alignment, width). */
  className?: string;
  /** Hide below the `md` breakpoint to keep tablet layouts readable. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  /** The query result — `undefined` while the first page is loading. */
  result: PaginatedResponse<T> | undefined;
  isLoading: boolean;
  /** True during a background refetch, when stale rows are still on screen. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;

  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortKey: string) => void;

  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;

  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;

  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Rendered above the table: search box, filter selects, bulk actions. */
  toolbar?: ReactNode;
  className?: string;
}

function columnMeta(meta: unknown): DataTableColumnMeta {
  return (meta ?? {}) as DataTableColumnMeta;
}

export function DataTable<T>({
  columns,
  result,
  isLoading,
  isFetching = false,
  error,
  onRetry,
  sortBy,
  sortOrder,
  onSortChange,
  onPageChange,
  onLimitChange,
  onRowClick,
  getRowId,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbar,
  className,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const rows = result?.data ?? [];

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  const isEmpty = !isLoading && !error && rows.length === 0;

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}

      <div className="relative rounded-lg border border-border bg-card shadow-sm">
        {/* A refetch dims the stale rows instead of replacing them with
            skeletons, so the table does not flash on every filter change. */}
        {isFetching && !isLoading && (
          <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-t-lg">
            <div className="h-full w-1/4 animate-loading bg-primary" />
          </div>
        )}

        {error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState
            title={emptyTitle ?? t('common.noResults')}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const meta = columnMeta(header.column.columnDef.meta);
                    const sortKey = meta.sortKey;
                    const isSorted = Boolean(sortKey) && sortBy === sortKey;

                    return (
                      <TableHead
                        key={header.id}
                        className={cn(meta.className, meta.hideOnMobile && 'hidden md:table-cell')}
                        aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {header.isPlaceholder ? null : sortKey && onSortChange ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="-ms-2 h-7 gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            onClick={() => onSortChange(sortKey)}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSorted ? (
                              sortOrder === 'asc' ? (
                                <ArrowUp className="size-3" />
                              ) : (
                                <ArrowDown className="size-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )}
                          </Button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody className={cn(isFetching && !isLoading && 'opacity-60 transition-opacity')}>
              {isLoading ? (
                <TableSkeleton columns={columns.length} rows={Math.min(result?.meta.limit ?? 8, 8)} />
              ) : (
                table.getRowModel().rows.map((row: Row<T>) => (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    className={onRowClick ? 'cursor-pointer' : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = columnMeta(cell.column.columnDef.meta);
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(meta.className, meta.hideOnMobile && 'hidden md:table-cell')}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {result && result.meta.total > 0 && (
        <Pagination meta={result.meta} onPageChange={onPageChange} onLimitChange={onLimitChange} />
      )}
    </div>
  );
}
