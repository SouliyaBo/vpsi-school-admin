import { Printer, Save, Table2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn, formatDate } from '@/lib/utils';
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
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import {
  useSaveTermMarks,
  useSemesterSheet,
  type SemesterSheet as SemesterSheetData,
  type SheetRow,
} from '../api';
import { MarkInput, SheetPickers, type SheetTargetState } from './SheetPickers';

/** ຜ່ານ at half marks, as the API scores it. */
const PASSING_MARK = 5;

interface TermDraft {
  examScore: number | null;
  bonus: number | null;
}

/**
 * The term sheet — three months, ສອບເສັງພາກ, ເພີ່ມ and ພາກຮຽນ.
 *
 * Laid out as the paper it replaces, and printable, because this is the page the
 * office signs off and files. The exam and the bonus are editable here rather
 * than on the monthly form: they belong to the term, are sat once, and are
 * usually entered after the teacher has closed their months.
 *
 * Marks below 5 are called out and a student who has left is dimmed rather than
 * dropped — both are how the school reads its own sheet, and a screen that
 * quietly omitted a leaver would not reconcile with the paper.
 *
 * The monthly detail shown here is each month's ລວມ, not its four columns: the
 * full form is 15 columns a month, which is where the entry grid earns its
 * place. Nothing is recomputed on this side — every figure is the API's.
 */
export function SemesterSheet() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<SheetTargetState>({});
  const [draft, setDraft] = useState<Record<string, TermDraft>>({});

  const sheet = useSemesterSheet(target);
  const saveTerm = useSaveTermMarks();
  const data = sheet.data;

  const saved = useMemo(() => {
    const rows: Record<string, TermDraft> = {};
    for (const row of data?.rows ?? []) {
      rows[row.studentId] = { examScore: row.examScore, bonus: row.bonus };
    }
    return rows;
  }, [data]);

  useEffect(() => setDraft(saved), [saved]);

  const dirty = Object.keys(draft).filter(
    (studentId) =>
      draft[studentId]?.examScore !== saved[studentId]?.examScore ||
      draft[studentId]?.bonus !== saved[studentId]?.bonus,
  );

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers value={target} onChange={setTarget} />

          {data && (
            <div className="flex flex-wrap items-center gap-2">
              <SheetSummary sheet={data} />
              <div className="ms-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={data.rows.length === 0}
                >
                  <Printer />
                  {t('monthlyMark.print')}
                </Button>
                {data.canEdit && (
                  <Button
                    disabled={dirty.length === 0 || saveTerm.isPending}
                    onClick={() =>
                      saveTerm.mutate({
                        subjectId: data.subject.id,
                        classroomId: data.classroom.id,
                        semesterId: data.semester.id,
                        entries: dirty.map((studentId) => ({ studentId, ...draft[studentId] })),
                      })
                    }
                  >
                    <Save />
                    {dirty.length > 0
                      ? t('monthlyMark.saveCount', { count: dirty.length })
                      : t('common.save')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* `print-sheet` is what the print stylesheet keeps — the pickers, the app
          frame and the sidebar are dropped around it. See index.css. */}
      <Card className="print-sheet">
        <CardContent className="space-y-3 pt-5">
          {!target.subjectId || !target.classroomId ? (
            <EmptyState icon={Table2} title={t('monthlyMark.pickSheet')} />
          ) : sheet.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : sheet.error ? (
            <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
          ) : !data ? null : (
            <>
              <SheetHeading sheet={data} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('monthlyMark.rollNumber')}</TableHead>
                    <TableHead className="w-24">{t('monthlyMark.studentCode')}</TableHead>
                    <TableHead>{t('monthlyMark.studentName')}</TableHead>
                    {data.months.map((month) => (
                      <TableHead key={month} className="w-20 text-center">
                        {t(`month.${month}`)}
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-center">
                      {t('monthlyMark.threeMonth')}
                    </TableHead>
                    <TableHead className="w-24 text-center">{t('monthlyMark.exam')}</TableHead>
                    <TableHead className="w-24 text-center">{t('monthlyMark.bonus')}</TableHead>
                    <TableHead className="w-24 text-center">{t('monthlyMark.termMark')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.studentId} className={cn(!row.isEnrolled && 'opacity-60')}>
                      <TableCell className="tabular-nums">{row.rollNumber ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
                      </TableCell>
                      {row.months.map((month) => (
                        <TableCell key={month.month} className="text-center tabular-nums">
                          <Mark value={month.score} />
                        </TableCell>
                      ))}
                      <TableCell className="text-center tabular-nums">
                        <Mark value={row.threeMonth} />
                      </TableCell>
                      <TableCell className="text-center">
                        {data.canEdit ? (
                          <MarkInput
                            value={draft[row.studentId]?.examScore ?? null}
                            max={10}
                            disabled={!row.isEnrolled}
                            label={`${row.studentNameLo} · ${t('monthlyMark.exam')}`}
                            onChange={(next) =>
                              setDraft((previous) => ({
                                ...previous,
                                [row.studentId]: {
                                  bonus: previous[row.studentId]?.bonus ?? null,
                                  examScore: next,
                                },
                              }))
                            }
                          />
                        ) : (
                          <Mark value={row.examScore} />
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {data.canEdit ? (
                          <MarkInput
                            value={draft[row.studentId]?.bonus ?? null}
                            max={10}
                            disabled={!row.isEnrolled}
                            label={`${row.studentNameLo} · ${t('monthlyMark.bonus')}`}
                            onChange={(next) =>
                              setDraft((previous) => ({
                                ...previous,
                                [row.studentId]: {
                                  examScore: previous[row.studentId]?.examScore ?? null,
                                  bonus: next,
                                },
                              }))
                            }
                          />
                        ) : (
                          <Mark value={row.bonus} />
                        )}
                      </TableCell>
                      <TableCell className="text-center font-semibold tabular-nums">
                        <Mark value={row.semesterMark} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground print:hidden">{t('monthlyMark.sheetNote')}</p>
    </div>
  );
}

/** A mark out of 10 — dashed while unmarked, red below the pass line. */
export function Mark({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('tabular-nums', value < PASSING_MARK && 'font-medium text-danger')}>
      {value.toFixed(2)}
    </span>
  );
}

function SheetSummary({ sheet }: { sheet: SemesterSheetData }) {
  const { t } = useTranslation();
  const { summary } = sheet;

  return (
    <p className="text-sm text-muted-foreground">
      {t('monthlyMark.summaryLine', {
        students: summary.students,
        passed: summary.passed,
        failed: summary.failed,
        incomplete: summary.incomplete,
        average: summary.average === null ? '—' : summary.average.toFixed(2),
      })}
    </p>
  );
}

/** The heading the printed sheet carries, since the pickers do not print. */
export function SheetHeading({
  sheet,
  rows,
}: {
  sheet: {
    subject: SemesterSheetData['subject'];
    classroom: SemesterSheetData['classroom'];
    semester?: SemesterSheetData['semester'];
    summary?: SemesterSheetData['summary'];
  };
  rows?: SheetRow[];
}) {
  const { t, i18n } = useTranslation();
  const className = sheet.classroom.gradeLevelCode
    ? `${sheet.classroom.gradeLevelCode}/${sheet.classroom.name}`
    : sheet.classroom.name;

  return (
    <header className="space-y-1 text-center">
      <h2 className="text-lg font-semibold">
        {i18n.language === 'en' && sheet.subject.nameEn
          ? sheet.subject.nameEn
          : sheet.subject.nameLo}
      </h2>
      <p className="text-sm">
        <span className="font-medium">{t('monthlyMark.classroom')}:</span> {className}
        {sheet.classroom.homeroomTeacherName && (
          <>
            <span className="ms-4 font-medium">{t('monthlyMark.homeroomTeacher')}:</span>{' '}
            {sheet.classroom.homeroomTeacherName}
          </>
        )}
        {sheet.semester && (
          <>
            <span className="ms-4 font-medium">{t('monthlyMark.semester')}:</span>{' '}
            {sheet.semester.nameLo}
          </>
        )}
      </p>
      <p className="hidden text-xs text-muted-foreground print:block">
        {t('monthlyMark.printedOn', { date: formatDate(new Date()) })}
        {rows && ` · ${t('monthlyMark.studentCount', { count: rows.length })}`}
      </p>
    </header>
  );
}
