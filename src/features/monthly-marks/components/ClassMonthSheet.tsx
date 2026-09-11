import { FileSpreadsheet, Loader2, Printer, Table2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attendancesApi } from '@/features/attendances/api';
import { conductDeductionsApi } from '@/features/conduct-deductions/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { cn, formatDate, localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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
import { classroomHeading } from '@/features/classrooms/api';
import { useClassMonth, type ClassMonthSheet as ClassMonthData } from '../api';
import {
  buildClassMonthWorkbook,
  classMonthFileName,
  type StudentRegisterExtras,
} from '../lib/class-month-workbook';
import { Mark } from './SemesterSheet';
import { SheetPickers, type SheetTargetState } from './SheetPickers';

/**
 * ສະຫຼຸບປະຈຳເດືອນ — one class, one month, every subject across the page.
 *
 * The per-subject sheets each answer "how did this class do in ຄະນິດສາດ in ຕຸລາ".
 * None of them answers "how did this student do in ຕຸລາ", which is what the
 * school reads out at the end of every month and what it ranks on, so this tab
 * turns the sheet the other way round: students down, subjects across.
 *
 * The columns come from the grade, not from the marks — ມ.4 shows eight columns
 * from the first day of the month, ມ.1 four — so a subject nobody has filled in
 * is a visible gap rather than a column that silently is not there. ສະເລ່ຍ
 * divides by that same number of columns, which is why a half-marked month reads
 * low and is flagged rather than looking finished.
 *
 * Read-only by design: marks are written on the entry form, against one subject
 * at a time and by the teacher the timetable names. Nothing here is recomputed
 * on this side — every figure is the API's.
 */
export function ClassMonthSheet() {
  const { t, i18n } = useTranslation();
  const [target, setTarget] = useState<SheetTargetState>({});
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const activeYear = useActiveSchoolYear();

  const sheet = useClassMonth({
    classroomId: target.classroomId,
    semesterId: target.semesterId,
    month,
  });
  const data = sheet.data;

  // A term that does not collect the current month — the school breaks for exams
  // in ທັນວາ and ມັງກອນ — lands on its last month rather than on an empty table.
  useEffect(() => {
    if (data && data.months.length > 0 && !data.months.includes(month)) {
      setMonth(data.months[data.months.length - 1]);
    }
  }, [data, month]);

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers value={target} onChange={setTarget} showSubject={false} />

          {data && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="class-month">{t('monthlyMark.month')}</Label>
                <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                  <SelectTrigger id="class-month" className="w-36">
                    <SelectValue placeholder={t('monthlyMark.month')} />
                  </SelectTrigger>
                  <SelectContent>
                    {data.months.map((entry) => (
                      <SelectItem key={entry} value={String(entry)}>
                        {t(`month.${entry}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="pb-2 text-sm text-muted-foreground">
                {t('monthlyMark.monthSummaryLine', {
                  students: data.summary.students,
                  passed: data.summary.passed,
                  failed: data.summary.failed,
                  incomplete: data.summary.incomplete,
                  average: data.summary.average === null ? '—' : data.summary.average.toFixed(2),
                })}
              </p>

              <div className="ms-auto flex items-end gap-2">
                <ExportButton
                  sheet={data}
                  schoolYear={
                    activeYear.data?.code ?? localizedName(activeYear.data, i18n.language)
                  }
                  schoolYearId={activeYear.data?.id}
                />
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  disabled={data.rows.length === 0}
                >
                  <Printer />
                  {t('monthlyMark.print')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print-sheet">
        <CardContent className="space-y-3 pt-5">
          {!target.classroomId ? (
            <EmptyState icon={Table2} title={t('monthlyMark.pickClass')} />
          ) : sheet.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : sheet.error ? (
            <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
          ) : !data ? null : data.subjects.length === 0 ? (
            <EmptyState icon={Table2} title={t('monthlyMark.noGradeSubjects')} />
          ) : (
            <>
              <MonthHeading sheet={data} />
              {/* The eight ມ.4 columns plus five fixed ones overflow a phone and a
                  narrow laptop alike; the table scrolls inside the card rather
                  than pushing the page sideways. */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">{t('monthlyMark.rank')}</TableHead>
                      <TableHead className="w-12">{t('monthlyMark.rollNumber')}</TableHead>
                      <TableHead className="min-w-40">{t('monthlyMark.studentName')}</TableHead>
                      {data.subjects.map((subject) => (
                        <TableHead key={subject.id} className="w-20 text-center">
                          {subject.nameLo}
                        </TableHead>
                      ))}
                      <TableHead className="w-20 text-center">{t('monthlyMark.total')}</TableHead>
                      <TableHead className="w-20 text-center">{t('monthlyMark.average')}</TableHead>
                      <TableHead className="w-16 text-center">{t('monthlyMark.grade')}</TableHead>
                      <TableHead className="w-16 text-center">{t('monthlyMark.outcome')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.studentId} className={cn(!row.isEnrolled && 'opacity-60')}>
                        <TableCell className="tabular-nums">{row.rank ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">{row.rollNumber ?? '—'}</TableCell>
                        <TableCell>
                          <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
                        </TableCell>
                        {row.scores.map((score, index) => (
                          <TableCell
                            key={data.subjects[index].id}
                            className="text-center tabular-nums"
                          >
                            <Mark value={score} />
                          </TableCell>
                        ))}
                        <TableCell className="text-center tabular-nums">
                          {row.total === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            row.total.toFixed(2)
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold tabular-nums">
                          <Mark value={row.average} />
                        </TableCell>
                        <TableCell className="text-center">
                          {row.grade === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={cn(
                                'font-semibold',
                                // F and E are both below the 5 the school passes
                                // at, so they read as the sheet marks them.
                                (row.grade === 'E' || row.grade === 'F') && 'text-danger',
                              )}
                            >
                              {row.grade}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Outcome row={row} subjects={data.subjects.length} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-1 text-xs text-muted-foreground print:hidden">
        <p>{t('monthlyMark.monthSheetNote', { count: data?.subjects.length ?? 0 })}</p>
        <p>{t('monthlyMark.gradeScaleNote')}</p>
      </div>
    </div>
  );
}

/**
 * The same sheet as a workbook the office can file, forward and print.
 *
 * The school's monthly summary lives in Excel and is pasted into letters from
 * there, so a screen that can only be printed would leave that workbook being
 * kept by hand beside this one. The file is built from the rows already on
 * screen — no second read, and no figure this side works out — so what downloads
 * is what was being looked at.
 *
 * `exceljs` is fetched on the click rather than with the page: it is a large
 * dependency and most people who open this tab only read it.
 */
function ExportButton({
  sheet,
  schoolYear,
  schoolYearId,
}: {
  sheet: ClassMonthData;
  schoolYear: string;
  schoolYearId: string | undefined;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const className = classroomHeading(sheet.classroom);

  async function exportSheet() {
    setBusy(true);
    try {
      const registers = await loadRegisters(sheet, schoolYearId);
      const blob = await buildClassMonthWorkbook(
        sheet,
        {
          schoolName:
            (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
            (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
            '',
          title: t('monthlyMark.exportTitle', {
            month: t(`month.${sheet.month}`),
            monthNumber: sheet.month,
            classroom: className,
            year: schoolYear,
          }),
          homeroomTeacher: t('monthlyMark.homeroomTeacher'),
          semester: t('monthlyMark.semester'),
          rollNumber: t('monthlyMark.rollNumber'),
          studentCode: t('monthlyMark.studentCode'),
          studentName: t('monthlyMark.studentName'),
          nickname: t('monthlyMark.nickname'),
          total: t('monthlyMark.total'),
          average: t('monthlyMark.average'),
          grade: t('monthlyMark.grade'),
          classification: t('monthlyMark.classification'),
          conductPoints: t('monthlyMark.conductPoints'),
          deducted: t('monthlyMark.deducted'),
          remaining: t('monthlyMark.remaining'),
          absences: t('monthlyMark.absences'),
          excused: t('monthlyMark.excusedAbsence'),
          unexcused: t('monthlyMark.unexcusedAbsence'),
          absencesTotal: t('monthlyMark.absencesTotal'),
          strong: t('monthlyMark.strong'),
          middling: t('monthlyMark.middling'),
          weak: t('monthlyMark.weak'),
          incompleteRow: (recorded, total) => t('monthlyMark.ofSubjects', { recorded, total }),
          left: t('monthlyMark.left'),
          summary: t('monthlyMark.summary'),
          studentsCounted: (count) => t('monthlyMark.studentsCounted', { count }),
          passed: t('monthlyMark.examPassed'),
          failed: t('monthlyMark.examFailed'),
          schoolDays: t('monthlyMark.schoolDays'),
          absenceBlock: t('monthlyMark.absenceBlock'),
          excusedAbsence: t('monthlyMark.absenceExcused'),
          unexcusedAbsence: t('monthlyMark.absenceUnexcused'),
          count: t('monthlyMark.countRow'),
          percent: t('monthlyMark.percentRow'),
          director: t('monthlyMark.director'),
          signatureDate: t('monthlyMark.signatureDate'),
          note: t('monthlyMark.monthSheetNote', { count: sheet.subjects.length }),
          registerNote: t('monthlyMark.registerNote', {
            strongFrom: sheet.bands.strongFrom,
            weakBelow: sheet.bands.weakBelow,
          }),
          gradeScale: t('monthlyMark.gradeScaleNote'),
          printedOn: t('monthlyMark.printedOn', { date: formatDate(new Date()) }),
        },
        registers,
      );
      saveBlob(
        blob,
        classMonthFileName(
          sheet,
          t('monthlyMark.exportFileName', {
            month: t(`month.${sheet.month}`),
            // Padded so a year of them sorts (09) before (10) in the folder.
            monthNumber: String(sheet.month).padStart(2, '0'),
          }),
        ),
      );
    } catch (error) {
      notify.error(error, t('monthlyMark.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={exportSheet} disabled={busy || sheet.rows.length === 0}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      {busy ? t('monthlyMark.exporting') : t('monthlyMark.exportExcel')}
    </Button>
  );
}

/**
 * The two columns the mark sheet borrows, read at the moment of export.
 *
 * Fetched on the click rather than with the page: neither register is on screen
 * here, and a tab most people only read should not pull the discipline ledger
 * and the roll on every open. Both are per-class reads the API already serves —
 * nothing is counted on this side.
 *
 * Counted over different windows on purpose. ຄະແນນຄຸນສົມບັດ is a year's budget of
 * 100 that runs to the last day of the year, which is the only window the
 * discipline ledger has; ວັນຂາດ belongs to the month the sheet is headed with,
 * so the roll is asked for that month. A student the registers do not answer for — one who has left, and so is
 * off the roll both are built from — is left out rather than defaulted, and
 * their cells print empty.
 */
async function loadRegisters(
  sheet: ClassMonthData,
  schoolYearId: string | undefined,
): Promise<Map<string, StudentRegisterExtras>> {
  const [conduct, attendance] = await Promise.all([
    schoolYearId
      ? conductDeductionsApi.classroomStanding(sheet.classroom.id, schoolYearId)
      : Promise.resolve([]),
    attendancesApi.classroomSummary(sheet.classroom.id, sheet.semester.id, sheet.month),
  ]);

  const absences = new Map(attendance.map((row) => [row.studentId, row]));
  const registers = new Map<string, StudentRegisterExtras>();

  for (const row of conduct) {
    const roll = absences.get(row.studentId);
    registers.set(row.studentId, {
      deducted: row.deducted,
      remaining: row.remaining,
      // ຄອບ is any absence the school was told about; the roll files a sick day
      // separately from an excused one, and the sheet has one column for both.
      excusedAbsences: (roll?.excused ?? 0) + (roll?.sick ?? 0),
      unexcusedAbsences: roll?.absent ?? 0,
      daysRecorded: roll?.totalRecorded ?? 0,
    });
  }

  return registers;
}

/**
 * ຜ່ານ / ຕົກ, or how far off a full month the student is.
 *
 * A student short of a subject has no verdict yet: their ສະເລ່ຍ is divided by
 * every subject of the grade, so it reads low for a reason that is not their
 * marks, and calling that ຕົກ would be a judgement the sheet cannot support.
 */
function Outcome({ row, subjects }: { row: ClassMonthData['rows'][number]; subjects: number }) {
  const { t } = useTranslation();

  if (row.average === null) return <span className="text-muted-foreground">—</span>;
  if (!row.isComplete) {
    return (
      <Badge variant="outline" className="font-normal">
        {t('monthlyMark.ofSubjects', { recorded: row.subjectsRecorded, total: subjects })}
      </Badge>
    );
  }
  return (
    <Badge variant={row.isPassing ? 'secondary' : 'danger'}>
      {row.isPassing ? t('monthlyMark.passed') : t('monthlyMark.failed')}
    </Badge>
  );
}

/** The heading the printed sheet carries, since the pickers do not print. */
function MonthHeading({ sheet }: { sheet: ClassMonthData }) {
  const { t } = useTranslation();
  const className = classroomHeading(sheet.classroom);

  return (
    <header className="space-y-1 text-center">
      <h2 className="text-lg font-semibold">
        {t('monthlyMark.monthSheetTitle', { month: t(`month.${sheet.month}`) })}
      </h2>
      <p className="text-sm">
        <span className="font-medium">{t('monthlyMark.classroom')}:</span> {className}
        {sheet.classroom.homeroomTeacherName && (
          <>
            <span className="ms-4 font-medium">{t('monthlyMark.homeroomTeacher')}:</span>{' '}
            {sheet.classroom.homeroomTeacherName}
          </>
        )}
        <span className="ms-4 font-medium">{t('monthlyMark.semester')}:</span>{' '}
        {sheet.semester.nameLo}
      </p>
    </header>
  );
}
