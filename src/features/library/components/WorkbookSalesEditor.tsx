import { Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Textarea } from '@/components/ui/textarea';
import { ErrorState } from '@/components/common/ErrorState';
import { useCan } from '@/features/auth/hooks';
import { formatKip, gradeShort, useSaveWorkbookSales, useWorkbookSales } from '../api';

interface LineDraft {
  gradeLevelId: string;
  subjects: string;
  booksPerSet: string;
  setsProduced: string;
  pricePerSet: string;
}

interface ExtraDraft {
  date: string;
  gradeLevelId: string;
  description: string;
  /** Whole sets; empty for a sale of single books. */
  sets: string;
  books: string;
  amount: string;
}

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};
const NO_GRADE = '__none__';

/**
 * ການສ້າງປື້ມແບບບົດເຝິກຫັດອອກຂາຍ — one school year's printing and sales.
 *
 * The two tables of the office's report on one screen: what each grade's set
 * holds and how many were printed (ລວມຈຳນວນປື້ມ), and what they sold for
 * (ລວມມູນຄ່າຂາຍ). Sales outside the sets — "ໄດ້ຂາຍເພີ່ມຕື່ມອີກ 10 ຫົວ" — have
 * their own rows, so they are counted rather than left in a footnote.
 */
export function WorkbookSalesEditor({ schoolYearId }: { schoolYearId?: string }) {
  const { t } = useTranslation();
  const can = useCan();
  const editable = can('library', 'update');
  const sheet = useWorkbookSales(schoolYearId);
  const save = useSaveWorkbookSales();
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [extras, setExtras] = useState<ExtraDraft[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!sheet.data) return;
    setLines(
      sheet.data.lines.map((line) => ({
        gradeLevelId: line.gradeLevelId,
        subjects: line.subjects ?? '',
        booksPerSet: String(line.booksPerSet),
        setsProduced: String(line.setsProduced),
        pricePerSet: String(line.pricePerSet),
      })),
    );
    setExtras(
      sheet.data.extraSales.map((extra) => ({
        date: extra.date ?? '',
        gradeLevelId: extra.gradeLevelId ?? '',
        description: extra.description,
        sets: extra.sets ? String(extra.sets) : '',
        books: String(extra.books),
        amount: String(extra.amount),
      })),
    );
    setNote(sheet.data.note ?? '');
  }, [sheet.data]);

  const totals = useMemo(() => {
    const lineBooks = lines.map((line) => num(line.booksPerSet) * num(line.setsProduced));
    const lineAmounts = lines.map((line) => num(line.setsProduced) * num(line.pricePerSet));
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const amount = sum(lineAmounts);
    const extraAmount = sum(extras.map((extra) => num(extra.amount)));
    return {
      lineBooks,
      lineAmounts,
      sets: sum(lines.map((line) => num(line.setsProduced))),
      books: sum(lineBooks),
      amount,
      extraSets: sum(extras.map((extra) => num(extra.sets))),
      extraBooks: sum(extras.map((extra) => num(extra.books))),
      extraAmount,
      grand: amount + extraAmount,
    };
  }, [lines, extras]);

  if (sheet.isLoading) return <Skeleton className="h-64 w-full" />;
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} />;
  if (!sheet.data) return null;

  const grades = sheet.data.grades;
  const gradeName = (id: string) => {
    const grade = grades.find((candidate) => candidate.id === id);
    return grade ? gradeShort(grade) : '';
  };
  const usedGrades = new Set(lines.map((line) => line.gradeLevelId));

  const editLine = (index: number, patch: Partial<LineDraft>) =>
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const editExtra = (index: number, patch: Partial<ExtraDraft>) =>
    setExtras((current) =>
      current.map((extra, i) => (i === index ? { ...extra, ...patch } : extra)),
    );

  /**
   * A sale by the set: once the grade and the number of sets are known, the
   * books and the money follow from that grade's line above — 2 sets of ມ.7 are
   * 14 books and 530,000. Filled in rather than locked, so a discount can still
   * be written over the amount.
   */
  const editSetSale = (index: number, patch: Pick<Partial<ExtraDraft>, 'gradeLevelId' | 'sets'>) =>
    setExtras((current) =>
      current.map((extra, i) => {
        if (i !== index) return extra;
        const next = { ...extra, ...patch };
        const sets = num(next.sets);
        const line = lines.find((candidate) => candidate.gradeLevelId === next.gradeLevelId);
        if (!line || sets === 0) return next;
        return {
          ...next,
          books: String(sets * num(line.booksPerSet)),
          amount: String(sets * num(line.pricePerSet)),
          description:
            next.description.trim() ||
            t('library.workbook.setSale', { n: sets, grade: gradeName(next.gradeLevelId) }),
        };
      }),
    );

  const submit = () =>
    save.mutate({
      schoolYearId: sheet.data!.schoolYear.id,
      lines: lines
        .filter((line) => line.gradeLevelId)
        .map((line) => ({
          gradeLevelId: line.gradeLevelId,
          ...(line.subjects.trim() ? { subjects: line.subjects.trim() } : {}),
          booksPerSet: num(line.booksPerSet),
          setsProduced: num(line.setsProduced),
          pricePerSet: num(line.pricePerSet),
        })),
      extraSales: extras
        .filter((extra) => extra.description.trim())
        .map((extra) => ({
          ...(extra.date ? { date: extra.date } : {}),
          ...(extra.gradeLevelId ? { gradeLevelId: extra.gradeLevelId } : {}),
          description: extra.description.trim(),
          ...(num(extra.sets) > 0 ? { sets: num(extra.sets) } : {}),
          books: num(extra.books),
          amount: num(extra.amount),
        })),
      ...(note.trim() ? { note: note.trim() } : {}),
    });

  const numberCell = (value: string, onChange: (value: string) => void, label: string) =>
    editable ? (
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={label}
        className="h-8 w-28 text-end tabular-nums"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    ) : (
      <span className="tabular-nums">{formatKip(num(value))}</span>
    );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('library.workbook.production')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t('library.workbook.grade')}</TableHead>
                  <TableHead className="min-w-64">{t('library.workbook.subjects')}</TableHead>
                  <TableHead className="text-end">{t('library.workbook.booksPerSet')}</TableHead>
                  <TableHead className="text-end">{t('library.workbook.setsProduced')}</TableHead>
                  <TableHead className="text-end">{t('library.workbook.pricePerSet')}</TableHead>
                  <TableHead className="text-end">{t('library.workbook.totalBooks')}</TableHead>
                  <TableHead className="text-end">{t('library.workbook.totalAmount')}</TableHead>
                  {editable && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {editable ? (
                        <Select
                          value={line.gradeLevelId}
                          onValueChange={(value) => editLine(index, { gradeLevelId: value })}
                        >
                          <SelectTrigger
                            className="h-8 w-28"
                            aria-label={t('library.workbook.grade')}
                          >
                            <SelectValue placeholder={t('library.workbook.grade')} />
                          </SelectTrigger>
                          <SelectContent>
                            {grades
                              .filter(
                                (grade) =>
                                  grade.id === line.gradeLevelId || !usedGrades.has(grade.id),
                              )
                              .map((grade) => (
                                <SelectItem key={grade.id} value={grade.id}>
                                  {gradeShort(grade)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        gradeName(line.gradeLevelId)
                      )}
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <Input
                          aria-label={t('library.workbook.subjects')}
                          className="h-8"
                          value={line.subjects}
                          onChange={(event) => editLine(index, { subjects: event.target.value })}
                        />
                      ) : (
                        line.subjects
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {numberCell(
                        line.booksPerSet,
                        (value) => editLine(index, { booksPerSet: value }),
                        t('library.workbook.booksPerSet'),
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {numberCell(
                        line.setsProduced,
                        (value) => editLine(index, { setsProduced: value }),
                        t('library.workbook.setsProduced'),
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      {numberCell(
                        line.pricePerSet,
                        (value) => editLine(index, { pricePerSet: value }),
                        t('library.workbook.pricePerSet'),
                      )}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">
                      {formatKip(totals.lineBooks[index])}
                    </TableCell>
                    <TableCell className="text-end font-semibold tabular-nums">
                      {formatKip(totals.lineAmounts[index])}
                    </TableCell>
                    {editable && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('common.delete')}
                          onClick={() =>
                            setLines((current) => current.filter((_, i) => i !== index))
                          }
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="font-semibold">
                    {t('library.total')}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">
                    {t('library.workbook.sets', { n: totals.sets })}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-end font-bold tabular-nums">
                    {formatKip(totals.books)}
                  </TableCell>
                  <TableCell className="text-end font-bold tabular-nums">
                    {formatKip(totals.amount)}
                  </TableCell>
                  {editable && <TableCell />}
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          {editable && (
            <Button
              variant="outline"
              disabled={lines.length >= grades.length}
              onClick={() =>
                setLines((current) => [
                  ...current,
                  {
                    gradeLevelId: '',
                    subjects: '',
                    booksPerSet: '',
                    setsProduced: '',
                    pricePerSet: '',
                  },
                ])
              }
            >
              <Plus />
              {t('library.workbook.addGrade')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('library.workbook.extraSales')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {extras.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('library.workbook.noExtras')}</p>
          )}
          {extras.map((extra, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                className="w-40"
                aria-label={t('library.workbook.date')}
                disabled={!editable}
                value={extra.date}
                onChange={(event) => editExtra(index, { date: event.target.value })}
              />
              <Select
                value={extra.gradeLevelId || NO_GRADE}
                onValueChange={(value) =>
                  editSetSale(index, { gradeLevelId: value === NO_GRADE ? '' : value })
                }
                disabled={!editable}
              >
                <SelectTrigger className="w-28" aria-label={t('library.workbook.grade')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_GRADE}>—</SelectItem>
                  {grades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {gradeShort(grade)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="min-w-56 flex-1"
                aria-label={t('library.workbook.description')}
                placeholder={t('library.workbook.description')}
                disabled={!editable}
                value={extra.description}
                onChange={(event) => editExtra(index, { description: event.target.value })}
              />
              <Input
                type="number"
                min={0}
                className="w-24 text-end"
                aria-label={t('library.workbook.setsSold')}
                placeholder={t('library.workbook.setsSold')}
                disabled={!editable}
                value={extra.sets}
                onChange={(event) => editSetSale(index, { sets: event.target.value })}
              />
              <Input
                type="number"
                min={0}
                className="w-24 text-end"
                aria-label={t('library.workbook.books')}
                placeholder={t('library.workbook.books')}
                disabled={!editable}
                value={extra.books}
                onChange={(event) => editExtra(index, { books: event.target.value })}
              />
              <Input
                type="number"
                min={0}
                className="w-32 text-end"
                aria-label={t('library.workbook.amount')}
                placeholder={t('library.workbook.amount')}
                disabled={!editable}
                value={extra.amount}
                onChange={(event) => editExtra(index, { amount: event.target.value })}
              />
              {editable && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.delete')}
                  onClick={() => setExtras((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          ))}
          {editable && (
            <Button
              variant="outline"
              onClick={() =>
                setExtras((current) => [
                  ...current,
                  {
                    date: '',
                    gradeLevelId: '',
                    description: '',
                    sets: '',
                    books: '',
                    amount: '',
                  },
                ])
              }
            >
              <Plus />
              {t('library.workbook.addExtra')}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('library.workbook.setsAmount')}</p>
              <p className="text-xl font-semibold tabular-nums">{formatKip(totals.amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {t('library.workbook.extraAmount', {
                  sets: totals.extraSets,
                  n: totals.extraBooks,
                })}
              </p>
              <p className="text-xl font-semibold tabular-nums">{formatKip(totals.extraAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('library.workbook.grandAmount')}</p>
              <p className="text-2xl font-bold tabular-nums">{formatKip(totals.grand)}</p>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="workbook-note">{t('library.workbook.note')}</Label>
            <Textarea
              id="workbook-note"
              rows={2}
              disabled={!editable}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {editable && (
            <div className="flex justify-end">
              <Button onClick={submit} disabled={save.isPending}>
                <Save />
                {t('common.save')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
