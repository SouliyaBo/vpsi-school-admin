import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { classroomsApi } from '@/features/classrooms/api';
import { gradeLevelsApi } from '@/features/grade-levels/api';
import { monthlyMarksApi } from '@/features/monthly-marks/api';
import { schoolYearsApi } from '@/features/school-years/api';
import { fetchEveryPage } from '@/lib/crud';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { studentsApi } from '../api';
import {
  countDistrictReport,
  LAST_LOWER_SECONDARY_LEVEL,
  MOVEMENT_ROWS,
  undatedSuspensions,
  startOfYear,
  type GradeColumn,
  type GradeFigures,
  type Headcount,
  type MovementRow,
} from '../lib/district-report';
import {
  buildDistrictReportWorkbook,
  districtReportFileName,
  type ExamGroup,
} from '../lib/district-report-workbook';
import {
  countExamResults,
  EXAM_PERCENT_ROWS,
  EXAM_ROWS,
  share,
  type ExamFigures,
  type ExamStudent,
} from '../lib/exam-results';

/**
 * ຮ່າງລາຍງານເມືອງ — the district headcount, checked on screen before export.
 *
 * Today's roll is counted and fixed; the movements are prefilled from the
 * students' statuses and open to correction, because the system cannot know
 * who came from another school or who is repeating; ຕົ້ນປີ follows from both.
 */
export function DistrictReportDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet />
        {t('student.districtReport.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle>{t('student.districtReport.title')}</DialogTitle>
            <DialogDescription>{t('student.districtReport.hint')}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so its edits start fresh from the roll each time. */}
          {open && <DistrictReportBody onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DistrictReportBody({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const source = useQuery({
    queryKey: ['students', 'district-report'],
    queryFn: async () => {
      const [roster, gradeLevels, year] = await Promise.all([
        fetchEveryPage(studentsApi.list, { status: 'all' }),
        fetchEveryPage(gradeLevelsApi.list, { sortBy: 'level', sortOrder: 'asc' }),
        // No active year is a normal state; the suspensions are then not narrowed.
        schoolYearsApi.active().catch(() => null),
      ]);
      const grades: GradeColumn[] = gradeLevels.map((grade) => ({
        gradeLevelId: grade.id,
        label: grade.nameLo,
        level: grade.level,
      }));
      // The classes whose ສະຫຼຸບປະຈຳເດືອນ the exam table is read from.
      const classrooms = year
        ? await fetchEveryPage(classroomsApi.list, { schoolYearId: year.id })
        : [];
      const examStudents = new Map<string, ExamStudent>(
        roster.map((student) => [
          student.id,
          {
            status: student.status,
            gender: student.gender,
            gradeLevelId: student.currentEnrollment?.gradeLevelId ?? null,
          },
        ]),
      );
      const students = roster.map((student) => ({
        status: student.status,
        gender: student.gender,
        gradeLevelId: student.currentEnrollment?.gradeLevelId ?? null,
        suspendedAt: student.suspendedAt ?? null,
      }));
      const figures = countDistrictReport(students, grades, year);
      return {
        grades,
        figures,
        year,
        undated: undatedSuspensions(students),
        classroomIds: classrooms.map((room) => room.id),
        examStudents,
      };
    },
    staleTime: 0,
  });

  if (source.isLoading) {
    return (
      <div className="flex justify-center py-10 text-muted-foreground">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!source.data) {
    return <p className="py-6 text-sm text-destructive">{t('student.districtReport.failed')}</p>;
  }
  return (
    <DistrictReportTable
      grades={source.data.grades}
      initial={source.data.figures}
      undated={source.data.undated}
      classroomIds={source.data.classroomIds}
      examStudents={source.data.examStudents}
      title={[t('student.districtReport.title'), source.data.year?.code].filter(Boolean).join(' ')}
      onDone={onDone}
    />
  );
}

function DistrictReportTable({
  grades,
  initial,
  undated,
  classroomIds,
  examStudents,
  title,
  onDone,
}: {
  grades: GradeColumn[];
  initial: Map<string, GradeFigures>;
  /** Suspended students with no ວັນທີໂຈະ, so not counted. */
  undated: number;
  classroomIds: string[];
  examStudents: Map<string, ExamStudent>;
  title: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [figures, setFigures] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const exams = useExamResults(month, classroomIds, examStudents, grades);
  const months = exams.data?.months;
  // A month the term does not mark — the exam break in ທັນວາ and ມັງກອນ —
  // lands on the term's last month rather than on an empty table.
  useEffect(() => {
    if (months && months.length > 0 && !months.includes(month)) {
      setMonth(months[months.length - 1]!);
    }
  }, [months, month]);
  const examGroups: ExamGroup[] = [
    {
      label: t('student.districtReport.exams.lower'),
      grades: grades.filter((grade) => grade.level <= LAST_LOWER_SECONDARY_LEVEL),
    },
    {
      label: t('student.districtReport.exams.upper'),
      grades: grades.filter((grade) => grade.level > LAST_LOWER_SECONDARY_LEVEL),
    },
  ].filter((group) => group.grades.length > 0);

  const setMovement = (
    gradeLevelId: string,
    row: MovementRow,
    key: keyof Headcount,
    raw: string,
  ) => {
    const value = Math.max(0, Math.floor(Number(raw) || 0));
    setFigures((current) => {
      const next = new Map(current);
      const grade = current.get(gradeLevelId)!;
      next.set(gradeLevelId, {
        ...grade,
        movements: { ...grade.movements, [row]: { ...grade.movements[row], [key]: value } },
      });
      return next;
    });
  };

  const sum = (read: (grade: GradeFigures) => Headcount): Headcount =>
    grades.reduce(
      (acc, grade) => {
        const count = read(figures.get(grade.gradeLevelId)!);
        return { total: acc.total + count.total, female: acc.female + count.female };
      },
      { total: 0, female: 0 },
    );

  async function exportWorkbook() {
    setBusy(true);
    try {
      const blob = await buildDistrictReportWorkbook(grades, figures, {
        schoolName:
          (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
          (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
          '',
        title,
        tableTitle: t('student.districtReport.tableTitle'),
        sheetName: t('student.districtReport.sheet'),
        grade: t('student.districtReport.grade'),
        total: t('student.districtReport.total'),
        female: t('student.districtReport.female'),
        allGrades: t('student.districtReport.allGrades'),
        start: t('student.districtReport.rows.start'),
        current: t('student.districtReport.rows.current'),
        movements: Object.fromEntries(
          MOVEMENT_ROWS.map((row) => [row, t(`student.districtReport.rows.${row}`)]),
        ) as Record<MovementRow, string>,
        printedOn: t('student.exportPrintedOn', { date: formatDate(new Date()) }),
        exams: exams.data
          ? {
              title: t('student.districtReport.exams.title', { month: t(`month.${month}`) }),
              groups: examGroups,
              figures: exams.data.figures,
              content: t('student.districtReport.exams.content'),
              percent: t('student.districtReport.exams.percent'),
              rows: Object.fromEntries(
                EXAM_ROWS.map((row) => [row, t(`student.districtReport.exams.rows.${row}`)]),
              ) as Record<(typeof EXAM_ROWS)[number], string>,
            }
          : undefined,
      });
      saveBlob(blob, districtReportFileName(title));
      onDone();
    } catch (error) {
      notify.error(error, t('student.districtReport.failed'));
    } finally {
      setBusy(false);
    }
  }

  const negative = grades.some((grade) => {
    const start = startOfYear(figures.get(grade.gradeLevelId)!);
    return start.total < 0 || start.female < 0;
  });

  return (
    <>
      {/* The two tables run past a laptop screen; they scroll, the buttons stay put. */}
      <div className="-mx-1 min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
        {undated > 0 && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            {t('student.districtReport.undatedSuspensions', { count: undated })}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th rowSpan={2} className="border px-2 py-1 text-start">
                  {t('student.districtReport.grade')}
                </th>
                {grades.map((grade) => (
                  <th key={grade.gradeLevelId} colSpan={2} className="border px-1 py-1">
                    {grade.label}
                  </th>
                ))}
                <th colSpan={2} className="border px-1 py-1">
                  {t('student.districtReport.allGrades')}
                </th>
              </tr>
              <tr>
                {[...grades, null].map((grade) => (
                  <PairHeading key={grade?.gradeLevelId ?? 'all'} />
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="border px-2 py-1 text-start font-normal">
                  {t('student.districtReport.rows.start')}
                </th>
                {grades.map((grade) => (
                  <Pair
                    key={grade.gradeLevelId}
                    count={startOfYear(figures.get(grade.gradeLevelId)!)}
                  />
                ))}
                <Pair count={sum(startOfYear)} />
              </tr>
              {MOVEMENT_ROWS.map((row) => (
                <tr key={row}>
                  <th className="border px-2 py-1 text-start font-normal">
                    {t(`student.districtReport.rows.${row}`)}
                  </th>
                  {grades.map((grade) =>
                    (['total', 'female'] as const).map((key) => (
                      <td key={`${grade.gradeLevelId}-${key}`} className="border p-0.5">
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 w-12 px-1 text-center tabular-nums"
                          aria-label={`${t(`student.districtReport.rows.${row}`)} ${grade.label} ${t(`student.districtReport.${key}`)}`}
                          value={figures.get(grade.gradeLevelId)!.movements[row][key]}
                          onChange={(event) =>
                            setMovement(grade.gradeLevelId, row, key, event.target.value)
                          }
                        />
                      </td>
                    )),
                  )}
                  <Pair count={sum((grade) => grade.movements[row])} />
                </tr>
              ))}
              <tr>
                <th className="border px-2 py-1 text-start">
                  {t('student.districtReport.rows.current')}
                </th>
                {grades.map((grade) => (
                  <Pair
                    key={grade.gradeLevelId}
                    count={figures.get(grade.gradeLevelId)!.current}
                    bold
                  />
                ))}
                <Pair count={sum((grade) => grade.current)} bold />
              </tr>
            </tbody>
          </table>
        </div>
        {negative && (
          <p className="text-sm text-destructive">{t('student.districtReport.negativeStart')}</p>
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-semibold">
              {t('student.districtReport.exams.title', { month: t(`month.${month}`) })}
            </h3>
            {months && months.length > 0 && (
              <div className="space-y-1">
                <Label htmlFor="district-exam-month">{t('monthlyMark.month')}</Label>
                <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                  <SelectTrigger id="district-exam-month" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((entry) => (
                      <SelectItem key={entry} value={String(entry)}>
                        {t(`month.${entry}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {exams.isLoading ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : exams.data ? (
            examGroups.map((group) => (
              <ExamTable key={group.label} group={group} figures={exams.data.figures} />
            ))
          ) : (
            <p className="text-sm text-destructive">{t('student.districtReport.exams.failed')}</p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button onClick={exportWorkbook} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
          {t('student.exportExcel')}
        </Button>
      </DialogFooter>
    </>
  );
}

function PairHeading() {
  const { t } = useTranslation();
  return (
    <>
      <th className="border px-1 py-1 font-medium">{t('student.districtReport.total')}</th>
      <th className="border px-1 py-1 font-medium">{t('student.districtReport.female')}</th>
    </>
  );
}

/** ລ and ຍ; `note` puts the ຄິດເປັນ % under ລ, so the columns stay paired. */
function Pair({ count, bold = false, note }: { count: Headcount; bold?: boolean; note?: string }) {
  const weight = bold ? 'font-semibold' : '';
  return (
    <>
      <td className={`border px-1 py-1 text-center tabular-nums ${weight}`}>
        {count.total}
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </td>
      <td className={`border px-1 py-1 text-center tabular-nums ${weight}`}>{count.female}</td>
    </>
  );
}

/**
 * Every class's ສະຫຼຸບປະຈຳເດືອນ for one month, counted into the exam table.
 * `months` is the term's marked months, as the sheets list them.
 */
function useExamResults(
  month: number,
  classroomIds: string[],
  students: Map<string, ExamStudent>,
  grades: GradeColumn[],
) {
  return useQuery({
    queryKey: ['students', 'district-report', 'exams', month, classroomIds],
    queryFn: async () => {
      const sheets = await Promise.all(
        classroomIds.map((classroomId) => monthlyMarksApi.classMonth({ classroomId, month })),
      );
      return {
        months: sheets[0]?.months ?? [],
        figures: countExamResults(
          sheets.flatMap((sheet) => sheet.rows),
          students,
          grades.map((grade) => grade.gradeLevelId),
        ),
      };
    },
    enabled: classroomIds.length > 0,
    retry: false,
  });
}

/** ມ.ຕົ້ນ or ມ.ປາຍ: per grade ລ, ຍ and ຄິດເປັນ %, the office's layout. */
function ExamTable({ group, figures }: { group: ExamGroup; figures: Map<string, ExamFigures> }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{group.label}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th rowSpan={2} className="border px-2 py-1 text-start">
                {t('student.districtReport.exams.content')}
              </th>
              {group.grades.map((grade) => (
                <th key={grade.gradeLevelId} colSpan={2} className="border px-1 py-1">
                  {grade.label}
                </th>
              ))}
            </tr>
            <tr>
              {group.grades.map((grade) => (
                <PairHeading key={grade.gradeLevelId} />
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAM_ROWS.map((row) => (
              <tr key={row}>
                <th className="border px-2 py-1 text-start font-normal">
                  {t(`student.districtReport.exams.rows.${row}`)}
                </th>
                {group.grades.map((grade) => {
                  const counts = figures.get(grade.gradeLevelId)!;
                  const ratio = EXAM_PERCENT_ROWS.includes(row)
                    ? share(counts[row].total, counts.students.total)
                    : null;
                  return (
                    <Pair
                      key={grade.gradeLevelId}
                      count={counts[row]}
                      note={ratio === null ? undefined : `${(ratio * 100).toFixed(2)}%`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
