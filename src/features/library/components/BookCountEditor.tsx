import { HandHelping, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorState } from '@/components/common/ErrorState';
import { useCan } from '@/features/auth/hooks';
import {
  cellBookKey,
  gradeShort,
  useBookCounts,
  useSaveBookCounts,
  type BookCountCategory,
} from '../api';
import { LoanDialog, type LoanStart } from './LoanDialog';

interface DraftRow {
  /** The saved row's id; absent on a row added since the last save. */
  rowId?: string;
  name: string;
  /** gradeLevelId → what is typed, so an empty cell stays empty rather than 0. */
  counts: Record<string, string>;
}

const asNumber = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * ຄູ່ມືຄູ / ແບບຮຽນ — the office's subject × grade sheet, typed in as a grid.
 *
 * The totals across and down are worked out as the cells are typed, from the
 * same rule the API saves by — the paper sheet's own totals had drifted from its
 * rows, and that is exactly what a screen should make impossible.
 */
export function BookCountEditor({
  category,
  schoolYearId,
}: {
  category: BookCountCategory;
  schoolYearId?: string;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can('library', 'update');
  const canLend = can('library', 'create');
  const sheet = useBookCounts(category, schoolYearId);
  const save = useSaveBookCounts();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [lending, setLending] = useState<LoanStart>(null);
  const hasActions = editable || canLend;

  // Reload the grid whenever a different sheet comes back (year, category, after a save).
  useEffect(() => {
    if (!sheet.data) return;
    setRows(
      sheet.data.rows.map((row) => ({
        rowId: row.rowId,
        name: row.name,
        counts: Object.fromEntries(
          Object.entries(row.counts).map(([gradeId, count]) => [gradeId, String(count)]),
        ),
      })),
    );
  }, [sheet.data]);

  const grades = useMemo(() => sheet.data?.grades ?? [], [sheet.data]);
  const totals = useMemo(() => {
    const columns: Record<string, number> = Object.fromEntries(grades.map((g) => [g.id, 0]));
    const rowTotals = rows.map((row) =>
      grades.reduce((sum, grade) => {
        const count = asNumber(row.counts[grade.id]);
        columns[grade.id] += count;
        return sum + count;
      }, 0),
    );
    return { rowTotals, columns, grand: rowTotals.reduce((a, b) => a + b, 0) };
  }, [rows, grades]);

  if (sheet.isLoading) return <Skeleton className="h-64 w-full" />;
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} />;
  if (!sheet.data) return null;

  const setCell = (index: number, gradeId: string, value: string) =>
    setRows((current) =>
      current.map((row, i) =>
        i === index ? { ...row, counts: { ...row.counts, [gradeId]: value } } : row,
      ),
    );

  const saved = (rowId?: string) =>
    rowId ? sheet.data!.rows.find((row) => row.rowId === rowId) : undefined;

  /**
   * Lends from a row as it was last saved: a count typed but not yet saved has
   * no books behind it, and the API would refuse the loan anyway.
   */
  const lendFrom = (rowId: string) => {
    const row = saved(rowId);
    const sheetId = sheet.data!.sheetId;
    if (!row || !sheetId) return;
    setLending({
      kind: 'row',
      label: `${t(`library.tabs.${category}`)} · ${row.name}`,
      cells: grades
        .filter((grade) => (row.counts[grade.id] ?? 0) > 0)
        .map((grade) => ({
          key: cellBookKey(sheetId, row.rowId, grade.id),
          grade: gradeShort(grade),
          available: (row.counts[grade.id] ?? 0) - (row.onLoan[grade.id] ?? 0),
        })),
    });
  };

  const submit = () =>
    save.mutate({
      category,
      schoolYearId: sheet.data!.schoolYear.id,
      rows: rows
        .filter((row) => row.name.trim())
        .map((row) => ({
          ...(row.rowId ? { rowId: row.rowId } : {}),
          name: row.name.trim(),
          counts: grades
            .map((grade) => ({ gradeLevelId: grade.id, quantity: asNumber(row.counts[grade.id]) }))
            .filter((count) => count.quantity > 0),
        })),
    });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t('library.no')}</TableHead>
                <TableHead className="min-w-56">{t(`library.countHeading.${category}`)}</TableHead>
                {grades.map((grade) => (
                  <TableHead key={grade.id} className="w-20 text-center">
                    {gradeShort(grade)}
                  </TableHead>
                ))}
                <TableHead className="w-24 text-center">{t('library.totalBooks')}</TableHead>
                {hasActions && <TableHead className="w-28" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={grades.length + 4}
                    className="text-center text-muted-foreground"
                  >
                    {t('library.emptySheet')}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        aria-label={t('library.rowName')}
                        value={row.name}
                        placeholder={t('library.rowNamePlaceholder')}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((r, i) =>
                              i === index ? { ...r, name: event.target.value } : r,
                            ),
                          )
                        }
                      />
                    ) : (
                      row.name
                    )}
                  </TableCell>
                  {grades.map((grade) => (
                    <TableCell key={grade.id} className="text-center">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 w-16 text-center tabular-nums"
                          aria-label={`${row.name || index + 1} ${gradeShort(grade)}`}
                          value={row.counts[grade.id] ?? ''}
                          onChange={(event) => setCell(index, grade.id, event.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums">{row.counts[grade.id] || '-'}</span>
                      )}
                      {(saved(row.rowId)?.onLoan[grade.id] ?? 0) > 0 && (
                        <span className="mt-0.5 block text-[11px] text-warning">
                          {t('library.countOnLoan', { n: saved(row.rowId)!.onLoan[grade.id] })}
                        </span>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-center font-semibold tabular-nums">
                    {totals.rowTotals[index]}
                  </TableCell>
                  {hasActions && (
                    <TableCell className="whitespace-nowrap text-end">
                      {canLend && row.rowId && saved(row.rowId) && (
                        <Button variant="outline" size="sm" onClick={() => lendFrom(row.rowId!)}>
                          <HandHelping />
                          {t('library.loan.lend')}
                        </Button>
                      )}
                      {editable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.delete')}
                          onClick={() =>
                            setRows((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell className="font-semibold">{t('library.total')}</TableCell>
                {grades.map((grade) => (
                  <TableCell key={grade.id} className="text-center font-semibold tabular-nums">
                    {totals.columns[grade.id]}
                  </TableCell>
                ))}
                <TableCell className="text-center font-bold tabular-nums">{totals.grand}</TableCell>
                {hasActions && <TableCell />}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        {editable && (
          <div className="flex flex-wrap justify-between gap-2">
            <Button
              variant="outline"
              onClick={() => setRows((current) => [...current, { name: '', counts: {} }])}
            >
              <Plus />
              {t('library.addRow')}
            </Button>
            <Button onClick={submit} disabled={save.isPending}>
              <Save />
              {t('common.save')}
            </Button>
          </div>
        )}
        <LoanDialog
          open={lending !== null}
          start={lending}
          onOpenChange={(open) => !open && setLending(null)}
        />
      </CardContent>
    </Card>
  );
}
