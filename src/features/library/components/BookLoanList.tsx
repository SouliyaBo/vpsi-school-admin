import { HandHelping, Plus, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { FilterSelect, SearchInput } from '@/components/common/TableToolbar';
import { useCan } from '@/features/auth/hooks';
import { useBookLoans, useReturnBookLoan } from '../api';
import { LoanDialog } from './LoanDialog';

type LoanFilter = 'outstanding' | 'returned' | 'all';

/**
 * ການຢືມ — who has which book. Opens on what is still out, oldest first, since
 * that is the list someone is going to walk round the staff room with.
 */
export function BookLoanList() {
  const { t } = useTranslation();
  const can = useCan();
  const [filter, setFilter] = useState<LoanFilter>('outstanding');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lending, setLending] = useState(false);
  const loans = useBookLoans({
    outstanding: filter === 'all' ? undefined : filter === 'outstanding',
    search: search || undefined,
    page,
    limit: 50,
  });
  const giveBack = useReturnBookLoan();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('library.loan.search')}
          className="w-72"
        />
        <FilterSelect
          value={filter}
          onChange={(value) => {
            setFilter((value as LoanFilter) || 'outstanding');
            setPage(1);
          }}
          options={(['outstanding', 'returned', 'all'] as const).map((value) => ({
            value,
            label: t(`library.loan.filters.${value}`),
          }))}
          placeholder={t('library.loan.filters.outstanding')}
        />
        {can('library', 'create') && (
          <Button className="ms-auto" onClick={() => setLending(true)}>
            <Plus />
            {t('library.loan.create')}
          </Button>
        )}
      </div>

      {loans.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : loans.error ? (
        <ErrorState error={loans.error} onRetry={() => loans.refetch()} />
      ) : !loans.data || loans.data.data.length === 0 ? (
        <EmptyState icon={HandHelping} title={t('library.loan.empty')} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-56">{t('library.title.name')}</TableHead>
                  <TableHead className="min-w-44">{t('library.loan.borrower')}</TableHead>
                  <TableHead className="text-end">{t('library.loan.quantity')}</TableHead>
                  <TableHead>{t('library.loan.loanedOn')}</TableHead>
                  <TableHead>{t('library.loan.dueOn')}</TableHead>
                  <TableHead>{t('library.loan.status')}</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.data.data.map((loan) => {
                  const overdue = !loan.returnedOn && Boolean(loan.dueOn) && loan.dueOn! < today;
                  return (
                    <TableRow key={loan.id}>
                      <TableCell>
                        <span className="font-medium">{loan.bookTitle ?? '—'}</span>
                        {loan.bookCategory && (
                          <span className="block text-xs text-muted-foreground">
                            {t(`library.tabs.${loan.bookCategory}`)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {loan.borrowerName}
                        <span className="block text-xs text-muted-foreground">
                          {t(`library.loan.borrowerTypes.${loan.borrowerType}`)}
                        </span>
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{loan.quantity}</TableCell>
                      <TableCell>{formatDate(loan.loanedOn)}</TableCell>
                      <TableCell>{loan.dueOn ? formatDate(loan.dueOn) : '—'}</TableCell>
                      <TableCell>
                        {loan.returnedOn ? (
                          <Badge variant="success">
                            {t('library.loan.returnedOn', { date: formatDate(loan.returnedOn) })}
                          </Badge>
                        ) : overdue ? (
                          <Badge variant="danger">{t('library.loan.overdue')}</Badge>
                        ) : (
                          <Badge variant="warning">{t('library.loan.out')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-end">
                        {!loan.returnedOn && can('library', 'update') && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={giveBack.isPending}
                            onClick={() => giveBack.mutate({ id: loan.id })}
                          >
                            <Undo2 />
                            {t('library.loan.return')}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination meta={loans.data.meta} onPageChange={setPage} />
        </>
      )}
      <LoanDialog open={lending} start={null} onOpenChange={setLending} />
    </div>
  );
}
