import { BookOpen, HandHelping, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { SearchInput } from '@/components/common/TableToolbar';
import { useCan } from '@/features/auth/hooks';
import {
  formatKip,
  useBookTitles,
  useBookTitleSummary,
  useDeleteBookTitle,
  type BookTitle,
  type BookTitleCategory,
} from '../api';
import { BookTitleDialog } from './BookTitleDialog';
import { LoanDialog } from './LoanDialog';

/**
 * ປື້ມອຸປະຖຳ / ເອກະສານອ້າງອີງ — one row per title, as the office's lists are.
 *
 * The figures across the top answer the question each list was written to
 * answer ("Book Festival 2026: 53 ຫົວ, 3,504,000 ກີບ"); a source is a button
 * that narrows the table to it. ຢູ່ໃນຊັ້ນ is read off the loans every time.
 */
export function BookTitleList({ category }: { category: BookTitleCategory }) {
  const { t } = useTranslation();
  const can = useCan();
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<BookTitle | null | 'new'>(null);
  const [lending, setLending] = useState<BookTitle | null>(null);
  const [deleting, setDeleting] = useState<BookTitle | null>(null);

  const list = useBookTitles({
    category,
    search: search || undefined,
    source: source ?? undefined,
    page,
    limit: 50,
    sortBy: 'createdAt',
    sortOrder: 'asc',
  });
  const summary = useBookTitleSummary(category);
  const remove = useDeleteBookTitle();

  return (
    <div className="space-y-4">
      {summary.data && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [t('library.summary.titles'), summary.data.titles],
            [t('library.summary.copies'), summary.data.copies],
            [t('library.summary.value'), formatKip(summary.data.value)],
            [t('library.summary.onLoan'), summary.data.onLoan],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {summary.data && summary.data.sources.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {summary.data.sources.map((entry) => {
            const key = entry.source ?? '';
            const active = (source ?? '') === key && source !== null;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSource(active ? null : key);
                  setPage(1);
                }}
                className="rounded-md border px-3 py-1.5 text-start text-sm transition-colors hover:border-primary/40 aria-pressed:border-primary aria-pressed:bg-primary-subtle"
              >
                <span className="font-medium">{entry.source ?? t('library.summary.noSource')}</span>
                <span className="ms-2 tabular-nums text-muted-foreground">
                  {t('library.summary.sourceLine', {
                    copies: entry.copies,
                    value: formatKip(entry.value),
                  })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('library.title.search')}
          className="w-72"
        />
        {can('library', 'create') && (
          <Button className="ms-auto" onClick={() => setEditing('new')}>
            <Plus />
            {t(`library.title.create.${category}`)}
          </Button>
        )}
      </div>

      {list.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data || list.data.data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('library.title.empty')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('library.no')}</TableHead>
                  <TableHead className="min-w-64">{t('library.title.name')}</TableHead>
                  <TableHead className="text-end">{t('library.title.quantity')}</TableHead>
                  <TableHead className="text-end">{t('library.title.unitPrice')}</TableHead>
                  <TableHead className="text-end">{t('library.title.value')}</TableHead>
                  <TableHead>{t('library.title.sourceYear')}</TableHead>
                  <TableHead>{t('library.title.shelf')}</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.data.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell>{(page - 1) * 50 + index + 1}</TableCell>
                    <TableCell>
                      <span className="font-medium">{row.title}</span>
                      {row.note && (
                        <span className="block text-xs text-muted-foreground">{row.note}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{row.quantity}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatKip(row.unitPrice)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatKip(row.value)}</TableCell>
                    <TableCell className="text-sm">
                      {row.source ?? '—'}
                      {(row.academicYear || row.acquiredOn) && (
                        <span className="block text-xs text-muted-foreground">
                          {[row.academicYear, row.acquiredOn && formatDate(row.acquiredOn)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.available > 0 ? 'success' : 'warning'}>
                        {t('library.title.available', { n: row.available })}
                      </Badge>
                      {row.onLoan > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {t('library.title.onLoan', { n: row.onLoan })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {can('library', 'create') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="me-1"
                          disabled={row.available < 1}
                          onClick={() => setLending(row)}
                        >
                          <HandHelping />
                          {t('library.loan.lend')}
                        </Button>
                      )}
                      {can('library', 'update') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.edit')}
                          onClick={() => setEditing(row)}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {can('library', 'delete') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.delete')}
                          onClick={() => setDeleting(row)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination meta={list.data.meta} onPageChange={setPage} />
        </>
      )}

      <BookTitleDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        category={category}
        title={editing === 'new' ? null : editing}
      />
      <LoanDialog
        open={lending !== null}
        start={lending ? { kind: 'title', title: lending } : null}
        onOpenChange={(open) => !open && setLending(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('library.title.deleteConfirm', { title: deleting?.title ?? '' })}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutateAsync(deleting.id).then(
            () => setDeleting(null),
            () => setDeleting(null),
          )
        }
      />
    </div>
  );
}
