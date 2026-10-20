import { Printer, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSemester } from '@/features/semesters/api';
import {
  SheetPickers,
  type SheetTargetState,
} from '@/features/monthly-marks/components/SheetPickers';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { toTenPoint, useClassTermResults, type TermResult } from '../api';

/** ຜ່ານ at half marks — the same line every other sheet is read against. */
const PASSING_MARK = 5;

/**
 * ໃບຄະແນນລາຍບຸກຄົນ — one child's term, in the breakdown the school recognises.
 *
 * The class sheet answers the school's question (how did the class do, who is
 * first) and this one answers the counter's: a parent is standing there about one
 * child and wants to see how the term mark was arrived at. So the subjects go
 * down the page and the components the API carried through — ກັນຍາ, ຕຸລາ, ພະຈິກ,
 * ສອບເສັງ, ເພີ່ມ — go across it, which is the only place in the admin those are
 * printed rather than summed away.
 *
 * Read from the class result rather than from the per-student endpoint: the row
 * is already in the cache the class sheet filled, it carries the same figures,
 * and reading it here means the card and the sheet cannot disagree about a rank.
 * Nothing below is recomputed — every figure is the stored result's, divided by
 * ten where the API holds a percentage.
 */
export function StudentResultCard() {
  const { t } = useTranslation();

  const [target, setTarget] = useState<SheetTargetState>({});
  const [studentId, setStudentId] = useState<string | undefined>(undefined);

  const activeSemester = useActiveSemester();
  const classroomId = target.classroomId;
  const semesterId = target.semesterId ?? activeSemester.data?.id;
  const ready = Boolean(classroomId && semesterId);

  const results = useClassTermResults({ classroomId, semesterId });
  const rows = useMemo(() => results.data?.data ?? [], [results.data]);
  const row = rows.find((result) => result.studentId === studentId);

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers
            value={target}
            onChange={(next) => {
              // Another class is another set of children: the one on screen is
              // dropped rather than left showing a card from the old class.
              if (next.classroomId !== target.classroomId) setStudentId(undefined);
              setTarget(next);
            }}
            showSubject={false}
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="result-student">{t('termResult.student')}</Label>
              <Select
                value={studentId ?? ''}
                onValueChange={setStudentId}
                disabled={rows.length === 0}
              >
                <SelectTrigger id="result-student" className="w-72">
                  <SelectValue
                    placeholder={
                      ready ? t('termResult.selectStudent') : t('termResult.pickClassFirst')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {/* In rank order, because that is the order the list arrives
                      in and the order the office reads the class in. */}
                  {rows.map((result) => (
                    <SelectItem key={result.id} value={result.studentId}>
                      {result.studentCode} — {result.studentNameLo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              className="ms-auto"
              onClick={() => window.print()}
              disabled={!row}
            >
              <Printer />
              {t('termResult.print')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* `print-sheet` is what the print stylesheet keeps. See index.css. */}
      <Card className="print-sheet">
        <CardContent className="space-y-4 pt-5">
          {!ready ? (
            <EmptyState icon={UserRound} title={t('termResult.pickClass')} />
          ) : results.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : results.error ? (
            <ErrorState error={results.error} onRetry={results.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title={t('termResult.empty')}
              description={t('termResult.emptyHint')}
            />
          ) : !row ? (
            <EmptyState icon={UserRound} title={t('termResult.pickStudent')} />
          ) : (
            <ResultCard row={row} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultCard({ row }: { row: TermResult }) {
  const { t } = useTranslation();
  const average = toTenPoint(row.average);

  /**
   * The component columns, in the order the subjects carry them.
   *
   * Taken from every subject rather than from the first: a subject marked on a
   * different instrument — one with no ເພີ່ມ, say — would otherwise decide the
   * whole card's columns. Keyed by name because the months come through with a
   * null `componentId`; they are columns of the monthly sheet, not components
   * the office defined.
   */
  const columns = useMemo(() => {
    const seen: string[] = [];
    for (const subject of row.subjects) {
      for (const component of subject.components) {
        if (!seen.includes(component.nameLo)) seen.push(component.nameLo);
      }
    }
    return seen;
  }, [row.subjects]);

  return (
    <div className="space-y-4">
      <header className="space-y-1 text-center">
        <h2 className="text-lg font-semibold">{t('termResult.cardTitle')}</h2>
        <p className="text-sm">
          <span className="font-medium">{row.studentNameLo}</span>
          <span className="ms-2 text-muted-foreground">
            {t('termResult.studentCode')} {row.studentCode}
          </span>
        </p>
        <p className="hidden text-xs text-muted-foreground print:block">
          {t('termResult.printedOn', { date: formatDate(new Date()) })}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t('termResult.average')}
          value={average === null ? '—' : average.toFixed(2)}
          tone={average !== null && average < PASSING_MARK ? 'danger' : 'default'}
        />
        <Tile label={t('termResult.grade')} value={row.grade || '—'} />
        <Tile
          label={t('termResult.rank')}
          value={row.rank === null ? '—' : `${row.rank}/${row.totalStudents ?? '—'}`}
        />
        <Tile
          label={t('termResult.passFail')}
          value={`${row.subjectsPassed}/${row.subjectsPassed + row.subjectsFailed}`}
          tone={row.subjectsFailed > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Eight subjects across three months, an exam and a bonus overflow a
          narrow laptop; the table scrolls inside the card. */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">{t('termResult.subject')}</TableHead>
              {columns.map((column) => (
                <TableHead key={column} className="w-20 text-center">
                  {column}
                </TableHead>
              ))}
              <TableHead className="w-20 text-center">{t('termResult.termMark')}</TableHead>
              <TableHead className="w-16 text-center">{t('termResult.grade')}</TableHead>
              <TableHead className="w-16 text-center">{t('termResult.outcome')}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {row.subjects.map((subject) => {
              const byName = new Map(
                subject.components.map((component) => [component.nameLo, component]),
              );
              const mark = toTenPoint(subject.percentage);

              return (
                <TableRow key={subject.subjectId}>
                  <TableCell className="font-medium">{subject.subjectNameLo}</TableCell>

                  {columns.map((column) => {
                    const score = byName.get(column)?.score ?? null;
                    return (
                      <TableCell key={column} className="text-center tabular-nums">
                        {score === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          score.toFixed(2)
                        )}
                      </TableCell>
                    );
                  })}

                  <TableCell className="text-center font-semibold tabular-nums">
                    {mark === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          // The API's verdict — 4.5 passes a subject out of 9.
                          !subject.isPassed && 'text-danger',
                          // A subject still short of a month reads as a figure
                          // that is going to move, not as a result.
                          subject.isIncomplete && 'italic font-normal text-muted-foreground',
                        )}
                      >
                        {mark.toFixed(2)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center font-medium">{subject.grade || '—'}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={subject.isPassed ? 'secondary' : 'danger'}>
                      {subject.isPassed ? t('termResult.passed') : t('termResult.failed')}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>

          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">{t('termResult.average')}</TableCell>
              {columns.map((column) => (
                <TableCell key={column} />
              ))}
              <TableCell className="text-center font-semibold tabular-nums">
                {average === null ? '—' : average.toFixed(2)}
              </TableCell>
              <TableCell className="text-center font-medium">{row.grade || '—'}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* What a report card carries beside the marks, and what the office is
          asked for at the counter: conduct, then the attendance the term was
          marked over. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t('termResult.conduct')}
          value={row.conductGrade ? t(`termResult.conductGrade.${row.conductGrade}`) : '—'}
        />
        <Tile label={t('termResult.daysPresent')} value={row.daysPresent} />
        <Tile
          label={t('termResult.daysAbsent')}
          value={row.daysAbsent}
          tone={row.daysAbsent > 0 ? 'warning' : 'default'}
        />
        <Tile label={t('termResult.daysLate')} value={`${row.daysLate} / ${row.daysExcused}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {/* Stale leads: a published result whose marks have moved is the one
            state where what the family can already see is wrong. */}
        {row.isStale ? (
          <Badge variant="danger">{t('termResult.stale')}</Badge>
        ) : row.isProvisional ? (
          <Badge variant="warning">{t('termResult.provisional')}</Badge>
        ) : row.isPublished ? (
          <Badge variant="success">{t('termResult.published')}</Badge>
        ) : (
          <Badge variant="secondary">{t('termResult.ready')}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {row.isPublished && row.publishedAt
            ? t('termResult.publishedOn', { date: formatDate(row.publishedAt) })
            : t('termResult.notPublishedNote')}
        </span>
      </div>

      <p className="text-xs text-muted-foreground print:hidden">{t('termResult.cardNote')}</p>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </p>
    </div>
  );
}
