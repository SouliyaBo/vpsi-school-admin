import { CalendarRange } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
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
import { classroomHeading } from '@/features/classrooms/api';
import { useStudentMonths, type StudentMonthSummary } from '../api';
import { Mark } from './SemesterSheet';

/**
 * ຄະແນນປະຈຳເດືອນ of one child, on the child's own page.
 *
 * The marks pages ask the school's questions — one class, one subject, one month
 * — and the office counter asks the other one: a parent is standing there about
 * one student, and wants the months read out. So the sheet is turned round here.
 * Subjects go down the page and the term's months across it, exactly as the
 * paper card does, and the foot of each month column carries the figures the
 * school actually reads out: ລວມ, ສະເລ່ຍ, ເກຣດ and the ລຳດັບ they held.
 *
 * Read-only, deliberately. Marks belong to the teacher who teaches the subject,
 * entered against a class on the entry form; a second place to type them in
 * would be a second set of marks for the same month.
 *
 * Nothing is recomputed on this side — every figure below is the API's, which is
 * what keeps this card and the class summary from disagreeing about a rank.
 */
export function StudentMonthlyMarks({
  studentId,
  enabled = true,
}: {
  studentId: string | undefined;
  /** The tab is not open yet, so the class's marks are not worth reading. */
  enabled?: boolean;
}) {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();
  const semesterOptions = useSemesterOptions('', activeYear.data?.id);

  // Uncontrolled until the office picks: an empty value means "the active term",
  // which is the one the API defaults to and the one they want nine times in ten.
  const [semesterId, setSemesterId] = useSemesterChoice(activeSemester.data?.id);
  const sheet = useStudentMonths(studentId, semesterId, enabled);
  const data = sheet.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="student-marks-semester">{t('monthlyMark.semester')}</Label>
          <Select value={semesterId ?? ''} onValueChange={setSemesterId}>
            <SelectTrigger id="student-marks-semester" className="w-56">
              <SelectValue placeholder={t('monthlyMark.semester')} />
            </SelectTrigger>
            <SelectContent>
              {(semesterOptions.data ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {data?.classroom && (
          <p className="pb-2 text-sm text-muted-foreground">
            {t('monthlyMark.classroom')}:{' '}
            <span className="text-foreground">{classroomHeading(data.classroom)}</span>
            {data.rollNumber !== null && (
              <>
                {' · '}
                {t('monthlyMark.rollNumber')} {data.rollNumber}
              </>
            )}
            {data.classroom.homeroomTeacherName && (
              <>
                {' · '}
                {t('monthlyMark.homeroomTeacher')}: {data.classroom.homeroomTeacherName}
              </>
            )}
          </p>
        )}
      </div>

      {sheet.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : sheet.error ? (
        <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
      ) : !data ? null : !data.classroom ? (
        <EmptyState icon={CalendarRange} title={t('monthlyMark.studentNotPlaced')} />
      ) : data.subjects.length === 0 ? (
        <EmptyState icon={CalendarRange} title={t('monthlyMark.noGradeSubjects')} />
      ) : data.summary.monthsRecorded === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t('monthlyMark.studentNoMarks')}
          description={t('monthlyMark.studentNoMarksHint')}
        />
      ) : (
        <>
          {/* Eight ມ.4 subjects down and three months plus four term columns
              across still overflow a narrow laptop; the table scrolls inside the
              card rather than pushing the page sideways. */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">{t('monthlyMark.subject')}</TableHead>
                  {data.months.map((month) => (
                    <TableHead key={month} className="w-20 text-center">
                      {t(`month.${month}`)}
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-center">{t('monthlyMark.threeMonth')}</TableHead>
                  <TableHead className="w-20 text-center">{t('monthlyMark.exam')}</TableHead>
                  <TableHead className="w-16 text-center">{t('monthlyMark.bonus')}</TableHead>
                  <TableHead className="w-20 text-center">{t('monthlyMark.termMark')}</TableHead>
                  <TableHead className="w-16 text-center">{t('monthlyMark.outcome')}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {data.subjectRows.map((row) => (
                  <TableRow key={row.subject.id}>
                    <TableCell className="font-medium">{row.subject.nameLo}</TableCell>
                    {row.monthScores.map((score, index) => (
                      <TableCell key={data.months[index]} className="text-center">
                        <Mark value={score} />
                      </TableCell>
                    ))}
                    <TableCell className="text-center">
                      <Mark value={row.threeMonth} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Mark value={row.examScore} />
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {row.bonus === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        row.bonus.toFixed(2)
                      )}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      <Mark value={row.semesterMark} />
                    </TableCell>
                    <TableCell className="text-center">
                      {row.isPassing === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant={row.isPassing ? 'secondary' : 'danger'}>
                          {row.isPassing ? t('monthlyMark.passed') : t('monthlyMark.failed')}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {/* What the school reads out at the end of a month, under the month
                  it belongs to — the same four figures the class summary ranks on. */}
              <TableFooter>
                <MonthFoot
                  label={t('monthlyMark.total')}
                  months={data.monthly}
                  cell={(entry) =>
                    entry.total === null ? null : (
                      <span className="tabular-nums">{entry.total.toFixed(2)}</span>
                    )
                  }
                />
                <MonthFoot
                  label={t('monthlyMark.average')}
                  months={data.monthly}
                  cell={(entry) => <Mark value={entry.average} />}
                  after={
                    <>
                      <TableCell colSpan={3} />
                      <TableCell className="text-center font-semibold">
                        <Mark value={data.summary.termAverage} />
                      </TableCell>
                      <TableCell />
                    </>
                  }
                />
                <MonthFoot
                  label={t('monthlyMark.grade')}
                  months={data.monthly}
                  cell={(entry) =>
                    entry.grade === null ? null : (
                      <span
                        className={cn(
                          'font-semibold',
                          // E and F are both below the 5 the school passes at.
                          (entry.grade === 'E' || entry.grade === 'F') && 'text-danger',
                        )}
                      >
                        {entry.grade}
                      </span>
                    )
                  }
                />
                <MonthFoot
                  label={t('monthlyMark.rank')}
                  months={data.monthly}
                  cell={(entry) =>
                    entry.rank === null ? null : (
                      <span className="tabular-nums">
                        {entry.rank}/{entry.rankedStudents}
                      </span>
                    )
                  }
                />
              </TableFooter>
            </Table>
          </div>

          <MonthNotes months={data.monthly} subjects={data.subjects.length} />
        </>
      )}
    </div>
  );
}

/**
 * One footer line: a label, a cell per month, then the term columns left blank.
 *
 * `after` fills those trailing columns where a figure does belong there — ສະເລ່ຍ
 * of the term marks sits under ພາກຮຽນ, and nothing else does.
 */
function MonthFoot({
  label,
  months,
  cell,
  after,
}: {
  label: string;
  months: StudentMonthSummary[];
  cell: (entry: StudentMonthSummary) => ReactNode;
  after?: ReactNode;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      {months.map((entry) => (
        <TableCell key={entry.month} className="text-center">
          {cell(entry) ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
      ))}
      {after ?? <TableCell colSpan={5} />}
    </TableRow>
  );
}

/**
 * Why a month reads low, where the reason is not the student's marks.
 *
 * ສະເລ່ຍ divides by every subject of the grade, so a month three subjects short
 * is below the pass line for a reason nothing else on the sheet states — and the
 * ເກຣດ and ຜ່ານ/ຕົກ are withheld for exactly that month. Saying so here keeps a
 * parent from reading an unfinished month as a failed one.
 */
function MonthNotes({ months, subjects }: { months: StudentMonthSummary[]; subjects: number }) {
  const { t } = useTranslation();
  const unfinished = months.filter((entry) => entry.average !== null && !entry.isComplete);

  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {unfinished.length > 0 && (
        <p>
          {t('monthlyMark.studentIncompleteNote', {
            months: unfinished.map((entry) => t(`month.${entry.month}`)).join(', '),
            total: subjects,
          })}
        </p>
      )}
      <p>{t('monthlyMark.sheetNote')}</p>
      <p>{t('monthlyMark.gradeScaleNote')}</p>
    </div>
  );
}

/**
 * The term on screen, defaulting to the active one once it is known.
 *
 * A plain `useState(active)` would freeze on `undefined`, since the active term
 * arrives after the first render and an initial value is only read once.
 */
function useSemesterChoice(
  activeId: string | undefined,
): [string | undefined, (next: string) => void] {
  const [picked, setPicked] = useState<string | undefined>(undefined);
  return [picked ?? activeId, setPicked];
}
