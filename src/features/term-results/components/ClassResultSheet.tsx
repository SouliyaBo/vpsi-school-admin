import { AlertTriangle, Calculator, Printer, Send, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useActiveSemester } from '@/features/semesters/api';
import {
  SheetPickers,
  type SheetTargetState,
} from '@/features/monthly-marks/components/SheetPickers';
import { cn, formatDate } from '@/lib/utils';
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
import { StudentName } from '@/components/common/StudentName';
import {
  toTenPoint,
  useClassTermResults,
  useComputeTermResults,
  usePublishTermResults,
  type ComputeSummary,
  type TermResult,
} from '../api';

/** ຜ່ານ at half marks — the same line the monthly sheet is read against. */
const PASSING_MARK = 5;

/**
 * ໃບຄະແນນລວມ — one class, one term, every subject.
 *
 * This is the sheet the office actually signs: the monthly forms are per subject
 * and per teacher, and until they are crossed with each other nobody can say what
 * a student's term looks like. Each column is a subject's ພາກຮຽນ, and the ສະເລ່ຍ
 * and ອັນດັບ beside them come from the stored term result rather than from
 * anything added up here — the same figures a report card prints.
 *
 * The three verbs are the office's, not a teacher's: recompute after marks change,
 * read, then publish. Publication is what makes a result visible to a student or a
 * guardian, and a result computed from marks that are not all in is held back.
 */
export function ClassResultSheet() {
  const { t } = useTranslation();
  const can = useCan();

  const [target, setTarget] = useState<SheetTargetState>({});
  const [outcome, setOutcome] = useState<ComputeSummary | null>(null);
  const [publishing, setPublishing] = useState(false);

  // The picker shows the active term until another is chosen, so the sheet has
  // to read the same one rather than waiting for a click that says nothing new.
  const activeSemester = useActiveSemester();
  const classroomId = target.classroomId;
  const semesterId = target.semesterId ?? activeSemester.data?.id;
  const ready = Boolean(classroomId && semesterId);

  const results = useClassTermResults({ classroomId, semesterId });
  const compute = useComputeTermResults();
  const publish = usePublishTermResults();

  // Memoised because the subject columns are derived from it: a fresh `[]` on
  // every render would rebuild them on every render too.
  const rows = useMemo(() => results.data?.data ?? [], [results.data]);
  const manages = can('term-results', 'manage');

  /**
   * The subject columns, in the order the class meets them.
   *
   * Taken from every row rather than from the first: a student who dropped a
   * subject would otherwise decide the whole table's columns.
   */
  const subjects = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      for (const subject of row.subjects) {
        if (!seen.has(subject.subjectId)) seen.set(subject.subjectId, subject.subjectNameLo);
      }
    }
    return [...seen.entries()].map(([id, nameLo]) => ({ id, nameLo }));
  }, [rows]);

  const provisional = rows.filter((row) => row.isProvisional).length;
  const published = rows.filter((row) => row.isPublished).length;
  // Marks moved after these were computed, so what is stored is already wrong.
  const stale = rows.filter((row) => row.isStale);
  const staleSince = stale
    .map((row) => row.staleSince)
    .filter((date): date is string => Boolean(date))
    .sort()[0];

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers value={target} onChange={setTarget} showSubject={false} />

          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t('termResult.summaryLine', { students: rows.length, provisional, published })}
              </p>
            )}

            <div className="ms-auto flex items-center gap-2">
              {manages && (
                <Button
                  variant="outline"
                  disabled={!ready || compute.isPending}
                  onClick={async () => {
                    if (!classroomId || !semesterId) return;
                    setOutcome(await compute.mutateAsync({ classroomId, semesterId }));
                  }}
                >
                  <Calculator />
                  {t('termResult.compute')}
                </Button>
              )}
              {manages && (
                <Button
                  variant="outline"
                  disabled={rows.length === 0 || publish.isPending}
                  onClick={() => setPublishing(true)}
                >
                  <Send />
                  {t('termResult.publish')}
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()} disabled={rows.length === 0}>
                <Printer />
                {t('termResult.print')}
              </Button>
            </div>
          </div>

          {outcome && (
            <p
              className={cn(
                'rounded-md px-3 py-2 text-sm',
                outcome.withdrawn > 0
                  ? 'bg-warning-subtle text-warning'
                  : 'bg-success-subtle text-success',
              )}
            >
              {t('termResult.computed', {
                count: outcome.studentsProcessed,
                provisional: outcome.provisionalCount,
                skipped: outcome.skipped.length,
              })}
              {/* Publication is withdrawn rather than overwritten, so the office
                  has to be told which families are now waiting on a re-release. */}
              {outcome.withdrawn > 0 &&
                ` · ${t('termResult.withdrawn', { count: outcome.withdrawn })}`}
            </p>
          )}
        </CardContent>
      </Card>

      {stale.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning-subtle px-3 py-2 text-sm text-warning print:hidden">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {t('termResult.staleWarning', {
              count: stale.length,
              since: staleSince ? formatDate(staleSince) : '—',
            })}
          </span>
        </p>
      )}

      {/* `print-sheet` is what the print stylesheet keeps. See index.css. */}
      <Card className="print-sheet">
        <CardContent className="space-y-3 pt-5">
          {!ready ? (
            <EmptyState icon={Table2} title={t('termResult.pickClass')} />
          ) : results.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : results.error ? (
            <ErrorState error={results.error} onRetry={results.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Table2}
              title={t('termResult.empty')}
              description={t('termResult.emptyHint')}
            />
          ) : (
            <>
              <header className="space-y-1 text-center">
                <h2 className="text-lg font-semibold">{t('termResult.sheetTitle')}</h2>
                <p className="hidden text-xs text-muted-foreground print:block">
                  {t('termResult.printedOn', { date: formatDate(new Date()) })}
                </p>
              </header>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('termResult.rank')}</TableHead>
                    <TableHead className="w-24">{t('termResult.studentCode')}</TableHead>
                    <TableHead>{t('termResult.studentName')}</TableHead>
                    {subjects.map((subject) => (
                      <TableHead key={subject.id} className="w-24 text-center">
                        {subject.nameLo}
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-center">{t('termResult.average')}</TableHead>
                    <TableHead className="w-20 text-center">{t('termResult.passFail')}</TableHead>
                    <TableHead className="w-28 text-center">{t('termResult.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <ResultRow key={row.id} row={row} subjects={subjects} />
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground print:hidden">{t('termResult.sheetNote')}</p>

      <ConfirmDialog
        open={publishing}
        onOpenChange={setPublishing}
        title={t('termResult.publish')}
        description={t('termResult.publishConfirm', {
          provisional,
          stale: stale.length,
        })}
        isPending={publish.isPending}
        onConfirm={() => {
          if (!classroomId || !semesterId) return;
          void publish.mutateAsync({ classroomId, semesterId }).finally(() => setPublishing(false));
        }}
      />
    </div>
  );
}

function ResultRow({
  row,
  subjects,
}: {
  row: TermResult;
  subjects: { id: string; nameLo: string }[];
}) {
  const { t } = useTranslation();
  const bySubject = new Map(row.subjects.map((subject) => [subject.subjectId, subject]));
  const average = toTenPoint(row.average);

  return (
    <TableRow>
      <TableCell className="tabular-nums">{row.rank ?? '—'}</TableCell>
      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
      <TableCell>
        <StudentName name={row.studentNameLo} nickname={null} />
      </TableCell>

      {subjects.map((subject) => {
        const result = bySubject.get(subject.id);
        const mark = toTenPoint(result?.percentage);
        return (
          <TableCell key={subject.id} className="text-center tabular-nums">
            {mark === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span
                className={cn(
                  mark < PASSING_MARK && 'font-medium text-danger',
                  // A subject still missing a month reads as a figure that is
                  // going to move, not as a result.
                  result?.isIncomplete && 'italic text-muted-foreground',
                )}
              >
                {mark.toFixed(2)}
              </span>
            )}
          </TableCell>
        );
      })}

      <TableCell className="text-center font-semibold tabular-nums">
        {average === null ? '—' : average.toFixed(2)}
      </TableCell>
      <TableCell className="text-center tabular-nums">
        {row.subjectsPassed}/{row.subjectsPassed + row.subjectsFailed}
      </TableCell>
      <TableCell className="text-center">
        {/* Stale leads: a published result whose marks have moved is the one
            state where what a family can see is already wrong. */}
        {row.isStale ? (
          <Badge variant="danger">{t('termResult.stale')}</Badge>
        ) : row.isProvisional ? (
          <Badge variant="warning">{t('termResult.provisional')}</Badge>
        ) : row.isPublished ? (
          <Badge variant="success">{t('termResult.published')}</Badge>
        ) : (
          <Badge variant="secondary">{t('termResult.ready')}</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
