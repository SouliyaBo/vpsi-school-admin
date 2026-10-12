import { CalendarRange } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Grade } from '@/types/enums';
import { useStudentAttendanceSummary } from '@/features/attendances/api';
import { useCan } from '@/features/auth/hooks';
import { useStudentLedger } from '@/features/conduct-deductions/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn, localizedName } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { classroomHeading } from '@/features/classrooms/api';
import {
  displaySubjectTotal,
  displayTotal,
  useStudentMonths,
  type MonthSubjectHeader,
  type StudentMonthlySheet,
  type StudentMonthSummary,
} from '../api';

/** ຜ່ານ at half marks, as the API scores it — a mark under it reads red. */
const PASSING_MARK = 5;

/** The picker's whole-term choice, beside the term's months. */
const TERM_VIEW = 'term';

/**
 * ຄະແນນປະຈຳເດືອນ of one child, on the child's own page.
 *
 * Laid out as the letter that goes home — the ໃບລາຍງານຜູ້ປົກຄອງ workbook — so
 * what the office reads off this screen is what the parent holds: the subjects
 * across the page standing on end, ກວດກາ on its own line above ລວມ, a letter
 * under each subject, and the month's ລວມ / ຈຳນວນວິຊາ / ສະເລ່ຍ / ເກຣດ standing
 * down the right. One month at a time, picked above the block, with a last
 * choice that turns the same block to the whole term: the months' totals, then
 * 3 ເດືອນ, ສອບເສັງ and ພາກຮຽນ per subject, and the term figures on the right.
 *
 * Read-only, deliberately. Marks belong to the teacher who teaches the subject,
 * entered against a class on the entry form; a second place to type them in
 * would be a second set of marks for the same month.
 *
 * Nothing is recomputed on this side — every figure below is the API's, which is
 * what keeps this card, the class summary and the letter from disagreeing.
 */
export function StudentMonthlyMarks({
  studentId,
  studentName,
  enabled = true,
}: {
  studentId: string | undefined;
  /** Heads the block, as the letter names the child. */
  studentName?: string;
  /** The tab is not open yet, so the class's marks are not worth reading. */
  enabled?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();
  const semesterOptions = useSemesterOptions('', activeYear.data?.id);

  // Uncontrolled until the office picks: an empty value means "the active term",
  // which is the one the API defaults to and the one they want nine times in ten.
  const [semesterId, setSemesterId] = useSemesterChoice(activeSemester.data?.id);
  const sheet = useStudentMonths(studentId, semesterId, enabled);
  const data = sheet.data;

  /**
   * ຄະແນນກົດລະບຽບ beside the marks, as the ສະຫຼຸບປະຈຳເດືອນ export prints it.
   *
   * A year's budget of 100, not a month's — the discipline ledger has no other
   * window — so the same two figures stand beside every month and the term.
   * Read only for an account allowed the ledger; anyone else sees the marks
   * without it rather than an error beside them.
   */
  const can = useCan();
  const ledger = useStudentLedger(
    can('conduct-scores') && enabled ? studentId : undefined,
    activeYear.data?.id,
  );
  const conduct: ConductStanding | null = ledger.data
    ? {
        baseScore: ledger.data.baseScore,
        deducted: ledger.data.deducted,
        remaining: ledger.data.remaining,
      }
    : null;

  const [view, setView] = useViewChoice(data);
  const schoolYear = activeYear.data?.code ?? localizedName(activeYear.data, i18n.language);

  /**
   * ວັນມາຮຽນ over the window on screen — the month picked, or the whole term —
   * so the days beside a month's marks are that month's, as on the export.
   * The roll 404s for a child with nothing recorded yet; that is an empty
   * figure here, not an error.
   */
  const roll = useStudentAttendanceSummary(
    can('attendances') && enabled ? studentId : undefined,
    data?.semester.id,
    view === TERM_VIEW ? undefined : Number(view),
  );
  const attendance: AttendanceStanding | null = roll.data
    ? {
        // Days in the room, less the days that three late arrivals cost.
        attended: roll.data.totalRecorded - roll.data.absentTotal,
        excused: roll.data.absentExcused,
        unexcused: roll.data.absentUnexcused,
        recorded: roll.data.totalRecorded,
      }
    : null;

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

        {data && data.months.length > 0 && (
          <Tabs value={view} onValueChange={setView} className="max-w-full">
            {/* Four choices side by side outgrow a phone; the strip scrolls. */}
            <div className="scrollbar-thin overflow-x-auto">
              <TabsList aria-label={t('monthlyMark.month')}>
                {data.months.map((month) => (
                  <TabsTrigger key={month} value={String(month)}>
                    {t(`month.${month}`)}
                  </TabsTrigger>
                ))}
                <TabsTrigger value={TERM_VIEW}>{t('monthlyMark.studentWholeTerm')}</TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
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
      ) : view === TERM_VIEW ? (
        <TermBlock
          data={data}
          studentName={studentName}
          schoolYear={schoolYear}
          conduct={conduct}
          attendance={attendance}
        />
      ) : (
        <MonthBlock
          data={data}
          entry={data.monthly.find((entry) => entry.month === Number(view)) ?? data.monthly[0]}
          studentName={studentName}
          schoolYear={schoolYear}
          conduct={conduct}
          attendance={attendance}
        />
      )}
    </div>
  );
}

// ── One month, as the letter prints it ──────────────────────────────────────

function MonthBlock({
  data,
  entry,
  studentName,
  schoolYear,
  conduct,
  attendance,
}: {
  data: StudentMonthlySheet;
  entry: StudentMonthSummary;
  studentName?: string;
  schoolYear: string;
  conduct: ConductStanding | null;
  attendance: AttendanceStanding | null;
}) {
  const { t } = useTranslation();
  const subjects = data.subjects.length;
  // An API older than this block has no ກວດກາ line and no letters per subject;
  // those cells read blank rather than the whole card failing to draw.
  const blanks = data.subjects.map(() => null);
  const testScores = entry.testScores ?? blanks;
  const subjectGrades = entry.subjectGrades ?? blanks;

  return (
    <Block
      title={t('monthlyMark.parentReportTitle', {
        month: t(`month.${entry.month}`),
        monthNumber: String(entry.month).padStart(2, '0'),
        year: schoolYear,
      })}
      data={data}
      studentName={studentName}
      headline={t('monthlyMark.parentReportTotalRow')}
      items={data.subjects.map((subject, index) => ({
        subject,
        mark: entry.scores[index],
        grade: subjectGrades[index],
        details: [{ label: t('monthlyMark.column.test'), value: testScores[index], max: 6 }],
      }))}
      rows={[
        {
          label: t('monthlyMark.parentReportTestRow'),
          cells: testScores.map((score) => <Figure value={score} />),
        },
        {
          label: t('monthlyMark.parentReportTotalRow'),
          cells: entry.scores.map((score) => <Figure value={score} whole failBelowPass />),
        },
        {
          label: t('monthlyMark.parentReportSubjectGradeRow'),
          cells: subjectGrades.map((grade, index) => (
            <Letter grade={grade} mark={entry.scores[index]} />
          )),
        },
      ]}
      standing={{
        total: displaySubjectTotal(entry.scores),
        recorded: entry.subjectsRecorded,
        average: entry.average,
        isComplete: entry.isComplete,
        grade: entry.grade,
        conduct,
        attendance,
      }}
      wholeMarks
      note={
        entry.average !== null && !entry.isComplete
          ? t('monthlyMark.studentIncompleteNote', {
              months: t(`month.${entry.month}`),
              total: subjects,
            })
          : null
      }
    />
  );
}

// ── The whole term, the same block turned to the term's figures ─────────────

function TermBlock({
  data,
  studentName,
  schoolYear,
  conduct,
  attendance,
}: {
  data: StudentMonthlySheet;
  studentName?: string;
  schoolYear: string;
  conduct: ConductStanding | null;
  attendance: AttendanceStanding | null;
}) {
  const { t, i18n } = useTranslation();
  const rows = data.subjectRows;
  // ເພີ່ມ is rare enough that an all-blank line would only pad the block.
  const anyBonus = rows.some((row) => row.bonus !== null);

  return (
    <Block
      title={t('monthlyMark.studentTermTitle', {
        semester: localizedName(data.semester, i18n.language),
        year: schoolYear,
      })}
      data={data}
      studentName={studentName}
      headline={t('monthlyMark.termMark')}
      items={rows.map((row) => ({
        subject: row.subject,
        mark: row.semesterMark,
        grade: row.semesterGrade ?? null,
        details: [
          ...data.months.map((month, monthIndex) => ({
            label: t(`month.${month}`),
            value: row.monthScores[monthIndex],
          })),
          { label: t('monthlyMark.threeMonth'), value: row.threeMonth },
          { label: t('monthlyMark.exam'), value: row.examScore },
          ...(row.bonus === null ? [] : [{ label: t('monthlyMark.bonus'), value: row.bonus }]),
        ],
      }))}
      rows={[
        ...data.months.map((month, monthIndex) => ({
          label: t('monthlyMark.studentMonthRow', { month: t(`month.${month}`) }),
          cells: rows.map((row) => <Figure value={row.monthScores[monthIndex]} failBelowPass />),
        })),
        {
          label: t('monthlyMark.studentThreeMonthRow'),
          cells: rows.map((row) => <Figure value={row.threeMonth} failBelowPass />),
        },
        {
          label: t('monthlyMark.studentExamRow'),
          cells: rows.map((row) => <Figure value={row.examScore} failBelowPass />),
        },
        ...(anyBonus
          ? [
              {
                label: t('monthlyMark.studentBonusRow'),
                cells: rows.map((row) => <Figure value={row.bonus} />),
              },
            ]
          : []),
        {
          label: t('monthlyMark.studentTermRow'),
          cells: rows.map((row) => <Figure value={row.semesterMark} failBelowPass />),
          emphasis: true,
        },
        {
          label: t('monthlyMark.parentReportSubjectGradeRow'),
          cells: rows.map((row) => (
            <Letter grade={row.semesterGrade ?? null} mark={row.semesterMark} />
          )),
        },
      ]}
      standing={{
        // The `??` fallbacks are for an API older than this block, which has
        // no term figures beyond the average.
        total: data.summary.termTotal ?? null,
        recorded: data.summary.termSubjectsRecorded ?? 0,
        average: data.summary.termAverage,
        isComplete: data.summary.termComplete,
        grade: data.summary.termGrade ?? null,
        conduct,
        attendance,
      }}
      note={
        data.summary.termAverage !== null && !data.summary.termComplete
          ? t('monthlyMark.studentTermIncompleteNote', {
              recorded: data.summary.termSubjectsRecorded ?? 0,
              total: data.subjects.length,
            })
          : null
      }
    />
  );
}

// ── The block the two views share ───────────────────────────────────────────

interface BlockRow {
  label: string;
  /** Aligned with `data.subjects`. */
  cells: ReactNode[];
  /** The line the letter is read from — ລວມ of a month, ພາກຮຽນ of the term. */
  emphasis?: boolean;
}

/** ຄະແນນກົດລະບຽບ for the year to date, as the discipline ledger holds it. */
interface ConductStanding {
  baseScore: number;
  deducted: number;
  remaining: number;
}

/** ວັນມາຮຽນ over the window on screen, from the roll. */
interface AttendanceStanding {
  /** Present and late, less the days the lates cost — see `AttendanceSummary`. */
  attended: number;
  /** ຄອບ — excused and sick, as the export folds them. */
  excused: number;
  /** ບໍ່ຄອບ, with one day for every three lates. */
  unexcused: number;
  recorded: number;
}

/** The figures standing down the right, each spanning every mark row. */
interface Standing {
  total: number | null;
  recorded: number;
  average: number | null;
  isComplete: boolean;
  grade: Grade | null;
  /** `null` leaves the two conduct columns out — no ledger, or no right to read it. */
  conduct: ConductStanding | null;
  /** `null` leaves the attendance columns out — nothing recorded, or no right to read it. */
  attendance: AttendanceStanding | null;
}

/** One subject as the phone lists it: the headline mark, its letter, the rest small. */
interface SubjectItem {
  subject: MonthSubjectHeader;
  /** ລວມ of the month, or ພາກຮຽນ of the term. */
  mark: number | null;
  grade: Grade | null;
  /** The figures behind the headline — ກວດກາ for a month; the months, 3 ເດືອນ and ສອບເສັງ for the term. */
  details: { label: string; value: number | null; max?: number }[];
}

interface BlockProps {
  title: string;
  data: StudentMonthlySheet;
  studentName?: string;
  /** What the headline mark on the phone is called. */
  headline: string;
  items: SubjectItem[];
  rows: BlockRow[];
  standing: Standing;
  note: string | null;
  /**
   * Whether the headline marks are a month's ລວມ, which the office writes whole.
   *
   * The term view hands the same block its ພາກຮຽນ figures, and those keep their
   * two places — the rounding is the monthly sheet's rule, not the block's.
   */
  wholeMarks?: boolean;
}

/**
 * The same figures in two shapes.
 *
 * Wider than a phone, the block is the letter's: subjects across, a table the
 * office can hold against the printed one. On a phone that table only fits by
 * scrolling under a thumb, and a parent reading it there has to line a figure
 * up with a heading that has scrolled off — so the phone gets the figures the
 * school reads out first, then one line a subject with the mark on the right,
 * which is how the office says them aloud at the counter. Chosen by media
 * query rather than by CSS so only one copy of every figure is on the page.
 */
function Block(props: BlockProps) {
  const phone = useMediaQuery('(max-width: 767px)');
  return phone ? <PhoneBlock {...props} /> : <ReportBlock {...props} />;
}

/**
 * The letter's head. `compact` drops the title and the child's name — on a
 * phone the page already carries the name at the top and the month on the
 * strip just above, so they only pushed the figures further down.
 */
function BlockHead({
  title,
  data,
  studentName,
  compact = false,
}: {
  title: string;
  data: StudentMonthlySheet;
  studentName?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      {!compact && (
        <div className="space-y-1 text-center">
          <h3 className="text-sm font-semibold sm:text-base">{title}</h3>
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-sm">
        {!compact && (
          <p>
            <span className="text-muted-foreground">{t('monthlyMark.studentName')}:</span>{' '}
            <span className="font-medium">{studentName ?? '—'}</span>
          </p>
        )}
        <p>
          <span className="text-muted-foreground">{t('monthlyMark.classroom')}:</span>{' '}
          <span className="font-medium">
            {data.classroom ? classroomHeading(data.classroom) : '—'}
          </span>
          {data.rollNumber !== null && (
            <>
              {' · '}
              <span className="text-muted-foreground">{t('monthlyMark.rollNumber')}</span>{' '}
              <span className="font-medium">{data.rollNumber}</span>
            </>
          )}
          {data.classroom?.homeroomTeacherName && (
            <>
              {' · '}
              <span className="text-muted-foreground">
                {t('monthlyMark.homeroomTeacher')}:
              </span>{' '}
              <span className="font-medium">{data.classroom.homeroomTeacherName}</span>
            </>
          )}
        </p>
      </div>
    </>
  );
}

function BlockNotes({ note, conduct }: { note: string | null; conduct: ConductStanding | null }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      {note && <p>{note}</p>}
      {conduct && (
        <p>
          {t('monthlyMark.conductPoints')}: {t('conductDeduction.yearScopeNote')}
        </p>
      )}
      <p>
        <span className="font-medium">{t('monthlyMark.parentReportNote')}</span>{' '}
        {t('monthlyMark.parentReportScale').split('\n').join(' · ')}
      </p>
      <p>{t('monthlyMark.sheetNote')}</p>
    </div>
  );
}

/**
 * The phone's shape: the month's (or term's) own figures first, large, then a
 * line a subject with the headline mark and its letter on the right and the
 * figures behind it small underneath.
 */
function PhoneBlock({
  title,
  data,
  studentName,
  headline,
  items,
  standing,
  note,
  wholeMarks = false,
}: BlockProps) {
  const { t } = useTranslation();
  const failing = standing.average !== null && standing.average < PASSING_MARK;
  const subjects = data.subjects.length;

  return (
    <div className="space-y-4">
      <BlockHead title={title} data={data} studentName={studentName} compact />

      {/* What the school reads out — ສະເລ່ຍ and ເກຣດ large, the rest beneath. */}
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('monthlyMark.parentReportAverage')}</p>
            <p className={cn('text-3xl font-semibold tabular-nums', failing && 'text-danger')}>
              {standing.average === null ? '—' : standing.average.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('monthlyMark.parentReportGrade')}</p>
            <p className={cn('text-3xl font-semibold', failing && 'text-danger')}>
              {standing.grade ?? '—'}
            </p>
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t('monthlyMark.parentReportTotal')}</dt>
            <dd className="font-medium tabular-nums">
              {standing.total === null
                ? '—'
                : wholeMarks
                  ? standing.total
                  : standing.total.toFixed(2)}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t('monthlyMark.parentReportSubjectCount')}</dt>
            <dd className="font-medium tabular-nums">
              {standing.average === null
                ? '—'
                : standing.isComplete
                  ? subjects
                  : t('monthlyMark.ofSubjects', { recorded: standing.recorded, total: subjects })}
            </dd>
          </div>
        </dl>
        {standing.conduct && (
          <dl className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-2 text-sm">
            <dt className="text-muted-foreground">{t('monthlyMark.conductPoints')}</dt>
            <dd className="flex gap-1.5">
              <span className="text-muted-foreground">{t('monthlyMark.remaining')}</span>
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  standing.conduct.deducted > 0 && 'text-danger',
                )}
              >
                {standing.conduct.remaining}/{standing.conduct.baseScore}
              </span>
            </dd>
            <dd className="flex gap-1.5">
              <span className="text-muted-foreground">{t('monthlyMark.deducted')}</span>
              <span className="font-medium tabular-nums">{standing.conduct.deducted}</span>
            </dd>
          </dl>
        )}
        {standing.attendance && (
          <dl className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-2 text-sm">
            <dt className="text-muted-foreground">{t('monthlyMark.daysPresent')}</dt>
            <dd className="font-semibold tabular-nums">
              {standing.attendance.attended}/{standing.attendance.recorded}
            </dd>
            <dd className="flex gap-1.5">
              <span className="text-muted-foreground">
                {t('monthlyMark.absences')} {t('monthlyMark.excusedAbsence')}
              </span>
              <span className="font-medium tabular-nums">{standing.attendance.excused}</span>
            </dd>
            <dd className="flex gap-1.5">
              <span className="text-muted-foreground">{t('monthlyMark.unexcusedAbsence')}</span>
              <span
                className={cn(
                  'font-medium tabular-nums',
                  standing.attendance.unexcused > 0 && 'text-danger',
                )}
              >
                {standing.attendance.unexcused}
              </span>
            </dd>
          </dl>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between px-1 pb-1 text-xs text-muted-foreground">
          <span>{t('monthlyMark.subject')}</span>
          <span>{headline}</span>
        </div>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => {
            const fails = item.mark !== null && item.mark < PASSING_MARK;
            return (
              <li key={item.subject.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{item.subject.nameLo}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {item.details.map((detail) => (
                      <span key={detail.label} className="whitespace-nowrap">
                        {detail.label}{' '}
                        <span className="tabular-nums text-foreground">
                          {detail.value === null ? '—' : detail.value.toFixed(2)}
                          {detail.max !== undefined && (
                            <span className="text-muted-foreground">/{detail.max}</span>
                          )}
                        </span>
                      </span>
                    ))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn('text-xl font-semibold tabular-nums', fails && 'text-danger')}
                  >
                    {item.mark === null
                      ? '—'
                      : wholeMarks
                        ? displayTotal(item.mark)
                        : item.mark.toFixed(2)}
                  </span>
                  <span
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-sm font-semibold',
                      fails ? 'border-danger/40 text-danger' : 'bg-muted',
                    )}
                  >
                    {item.grade ?? '—'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <BlockNotes note={note} conduct={standing.conduct} />
    </div>
  );
}

/**
 * The letter's block: a titled head, the subjects across standing on end, the
 * mark rows, and the standing figures on the right. The ໝາຍເຫດ scale sits
 * under it as it does on paper.
 */
function ReportBlock({
  title,
  data,
  studentName,
  rows,
  standing,
  note,
  wholeMarks = false,
}: BlockProps) {
  const { t } = useTranslation();
  const subjects = data.subjects;
  const failing = standing.average !== null && standing.average < PASSING_MARK;
  const conduct = standing.conduct;
  const attendance = standing.attendance;

  const headCell =
    'border border-border bg-muted/50 px-2 py-1 text-center align-middle font-semibold';
  const cell = 'border border-border px-2 py-1.5 text-center align-middle';
  // The row labels stay put while the subjects scroll under a thumb, so a
  // phone still reads which line 8.60 is on. Opaque, or the figures show through.
  const labelCell = 'sticky left-0 z-10 bg-background text-left';
  const standingCell = cn(cell, 'w-20 text-base font-semibold tabular-nums');

  return (
    <div className="space-y-3">
      <BlockHead title={title} data={data} studentName={studentName} />

      {/* Eight ມ.4 subjects plus five standing columns overflow a narrow laptop;
          the block scrolls inside the card rather than pushing the page sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {/* Two header rows only so ຄະແນນກົດລະບຽບ can head its two columns
              as one group, the way the export's merged cell does; every other
              heading spans both rows. */}
          <thead>
            <tr>
              <th
                scope="col"
                rowSpan={2}
                className={cn(headCell, labelCell, 'min-w-36 bg-muted sm:min-w-44')}
              >
                {t('monthlyMark.parentReportCorner')}
              </th>
              {subjects.map((subject) => (
                <th key={subject.id} scope="col" rowSpan={2} className={cn(headCell, 'h-36 w-14')}>
                  {/* Standing on end, as the workbook rotates them — eight
                      subject names side by side do not fit any other way. */}
                  <span className="inline-block rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">
                    {subject.nameLo}
                  </span>
                </th>
              ))}
              <th scope="col" rowSpan={2} className={cn(headCell, 'w-20')}>
                {t('monthlyMark.parentReportTotal')}
              </th>
              <th scope="col" rowSpan={2} className={cn(headCell, 'w-20')}>
                {t('monthlyMark.parentReportSubjectCount')}
              </th>
              <th scope="col" rowSpan={2} className={cn(headCell, 'w-20')}>
                {t('monthlyMark.parentReportAverage')}
              </th>
              <th scope="col" rowSpan={2} className={cn(headCell, 'w-20')}>
                {t('monthlyMark.parentReportGrade')}
              </th>
              {conduct && (
                <th scope="colgroup" colSpan={2} className={cn(headCell, 'h-8')}>
                  {t('monthlyMark.conductPoints')}
                </th>
              )}
              {attendance && (
                <th scope="colgroup" colSpan={3} className={cn(headCell, 'h-8')}>
                  {t('monthlyMark.attendance')}
                </th>
              )}
            </tr>
            {(conduct || attendance) && (
              <tr>
                {conduct && (
                  <>
                    <th scope="col" className={cn(headCell, 'w-16 font-medium')}>
                      {t('monthlyMark.deducted')}
                    </th>
                    <th scope="col" className={cn(headCell, 'w-16 font-medium')}>
                      {t('monthlyMark.remaining')}
                    </th>
                  </>
                )}
                {attendance && (
                  <>
                    <th scope="col" className={cn(headCell, 'w-16 font-medium')}>
                      {t('monthlyMark.daysPresent')}
                    </th>
                    <th scope="col" className={cn(headCell, 'w-16 font-medium')}>
                      {t('monthlyMark.absences')} {t('monthlyMark.excusedAbsence')}
                    </th>
                    <th scope="col" className={cn(headCell, 'w-16 font-medium')}>
                      {t('monthlyMark.absences')} {t('monthlyMark.unexcusedAbsence')}
                    </th>
                  </>
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.label} className={cn(row.emphasis && 'bg-muted/30')}>
                <th
                  scope="row"
                  className={cn(
                    cell,
                    labelCell,
                    'font-medium',
                    row.emphasis && 'bg-muted font-semibold',
                  )}
                >
                  {row.label}
                </th>
                {row.cells.map((content, index) => (
                  <td key={subjects[index]?.id ?? index} className={cn(cell, 'tabular-nums')}>
                    {content}
                  </td>
                ))}
                {/* The standing figures span every mark row, as the merged
                    cells do on the sheet. */}
                {rowIndex === 0 && (
                  <>
                    <td rowSpan={rows.length} className={standingCell}>
                      <Figure value={standing.total} whole={wholeMarks} />
                    </td>
                    <td rowSpan={rows.length} className={cn(standingCell, 'font-normal')}>
                      {standing.average === null
                        ? '—'
                        : standing.isComplete
                          ? subjects.length
                          : t('monthlyMark.ofSubjects', {
                              recorded: standing.recorded,
                              total: subjects.length,
                            })}
                    </td>
                    <td
                      rowSpan={rows.length}
                      className={cn(standingCell, failing && 'text-danger')}
                    >
                      <Figure value={standing.average} />
                    </td>
                    <td
                      rowSpan={rows.length}
                      className={cn(standingCell, failing && 'text-danger')}
                    >
                      {standing.grade ?? '—'}
                    </td>
                    {conduct && (
                      <>
                        {/* A deduction reads red in both cells, as on the export. */}
                        <td
                          rowSpan={rows.length}
                          className={cn(
                            standingCell,
                            'w-16',
                            conduct.deducted > 0 && 'text-danger',
                          )}
                        >
                          {conduct.deducted}
                        </td>
                        <td
                          rowSpan={rows.length}
                          className={cn(
                            standingCell,
                            'w-16',
                            conduct.deducted > 0 && 'text-danger',
                          )}
                        >
                          {conduct.remaining}
                        </td>
                      </>
                    )}
                    {attendance && (
                      <>
                        <td rowSpan={rows.length} className={cn(standingCell, 'w-16')}>
                          {attendance.attended}/{attendance.recorded}
                        </td>
                        <td rowSpan={rows.length} className={cn(standingCell, 'w-16 font-normal')}>
                          {attendance.excused}
                        </td>
                        <td
                          rowSpan={rows.length}
                          className={cn(
                            standingCell,
                            'w-16',
                            attendance.unexcused > 0 ? 'text-danger' : 'font-normal',
                          )}
                        >
                          {attendance.unexcused}
                        </td>
                      </>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BlockNotes note={note} conduct={standing.conduct} />
    </div>
  );
}

/**
 * A figure to two places, or a dash; red under the pass line when asked.
 *
 * `whole` is for the marks the office writes whole — a month's ລວມ and the row
 * of them. The red still follows the exact figure, so a 4.7 prints as a red 5.
 */
function Figure({
  value,
  failBelowPass = false,
  whole = false,
}: {
  value: number | null;
  failBelowPass?: boolean;
  whole?: boolean;
}) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        'tabular-nums',
        failBelowPass && value < PASSING_MARK && 'font-medium text-danger',
      )}
    >
      {whole ? displayTotal(value) : value.toFixed(2)}
    </span>
  );
}

/** The letter under a mark, red when the mark it bands is a failing one. */
function Letter({ grade, mark }: { grade: Grade | null; mark: number | null }) {
  if (grade === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('font-semibold', mark !== null && mark < PASSING_MARK && 'text-danger')}>
      {grade}
    </span>
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

/**
 * Which month is open — the latest one with marks until the office picks.
 *
 * A parent at the counter asks about the month just finished, so that is the
 * one the block opens on; a term with nothing in it yet opens on its first
 * month. A pick that names a month the term does not collect — the office
 * changed term after picking — falls back the same way rather than showing an
 * empty block.
 */
function useViewChoice(data: StudentMonthlySheet | undefined): [string, (next: string) => void] {
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const months = data?.months ?? [];
  const latest = [...(data?.monthly ?? [])].reverse().find((entry) => entry.average !== null);
  const fallback = String(latest?.month ?? months[0] ?? TERM_VIEW);
  const valid = picked === TERM_VIEW || (picked !== undefined && months.includes(Number(picked)));
  return [valid && picked !== undefined ? picked : fallback, setPicked];
}
