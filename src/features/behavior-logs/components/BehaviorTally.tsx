import { BarChart3, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { semesters, useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { monthBounds, monthsOf } from '@/lib/term-months';
import { cn, formatDate, fullName, localizedName, refId, refObject } from '@/lib/utils';
import type { BehaviorLog, Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import {
  useBehaviorTally,
  useStudentBehaviorEntries,
  type BehaviorTallyRow,
  type BehaviorTallyScope,
} from '../api';

/** From here up, a pattern rather than a bad week — worth a conversation. */
const REPEAT_THRESHOLD = 3;

/**
 * The lines a reader is likely to want to draw, offered as choices rather than a
 * free number so that everyone asks the same question of the register.
 */
const ACTION_THRESHOLDS = [3, 5] as const;

/** The `Select` cannot carry an empty value, so these two are spelled out. */
const NO_THRESHOLD = 'none';
const WHOLE_TERM = 'all';

/** How many columns a row spans, for the detail row beneath it. */
const TALLY_COLUMNS = 5;

/**
 * Who the term's entries are about, most-flagged first.
 *
 * Neither of the other two screens answers this: the monthly sheet is a diary and
 * the history is a page at a time, so a student who collects one entry a week goes
 * unnoticed in both. Ranked by entries that carried a warning or a deduction
 * rather than by raw count, because a bare observation is not an escalation.
 *
 * Laid out like the attendance summary, because it is read for the same reason
 * and by the same people: the term can be narrowed to a month, a date range or a
 * subject, and a row opens onto the entries behind its own numbers — which used
 * to mean leaving for the history tab and filtering it by hand.
 *
 * What it does *not* copy is that summary's roster. Only students who appear in
 * the register are listed: an absence from this table is the good outcome, and
 * padding it with the whole class would bury the few rows that matter under
 * thirty rows of zero.
 */
export function BehaviorTally() {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [semesterId, setSemesterId] = useState<string | undefined>();
  const effectiveSemesterId = semesterId ?? activeSemester.data?.id;

  // What narrows the counts below the whole term. A month and a date range are
  // two ways of saying the same thing, so picking one clears the other rather
  // than intersecting silently into an empty window.
  const [monthKey, setMonthKey] = useState<string | undefined>();
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  const [minWithAction, setMinWithAction] = useState<number | undefined>();

  const pickMonth = (key: string) => {
    setMonthKey(key === WHOLE_TERM ? undefined : key);
    setFrom(undefined);
    setTo(undefined);
  };
  const pickRange = (which: 'from' | 'to', value: string) => {
    (which === 'from' ? setFrom : setTo)(value || undefined);
    setMonthKey(undefined);
  };

  const semester = semesters.useDetail(effectiveSemesterId);
  const termMonths = useMemo(
    () => monthsOf(semester.data?.startDate, semester.data?.endDate),
    [semester.data?.startDate, semester.data?.endDate],
  );
  // A month picked under one term means nothing under the next; it is dropped
  // rather than sent, since the API would count a different year's month.
  const termMonth = termMonths.find((candidate) => candidate.key === monthKey);

  // The register is written against the timetable, so the subjects on offer are
  // the class's `taught` ones rather than every subject it is marked in.
  const classroom = classrooms.useDetail(classroomId);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;
  const useSubjectsForClass = (search: string) => useSubjectOptions(search, gradeLevelId, 'taught');

  // One scope for both reads: the counts and the entries behind them must be
  // taken over the same window, or opening a row contradicts the row.
  const scope = useMemo<BehaviorTallyScope>(
    () => ({
      from: termMonth ? monthBounds(termMonth).from : from,
      to: termMonth ? monthBounds(termMonth).to : to,
      subjectId,
    }),
    [termMonth, from, to, subjectId],
  );

  const [openStudentIds, setOpenStudentIds] = useState<ReadonlySet<string>>(new Set());
  const toggleStudent = (studentId: string) =>
    setOpenStudentIds((open) => {
      const next = new Set(open);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const tally = useBehaviorTally(classroomId, effectiveSemesterId, scope);
  // Filtered here rather than server-side: one class is a few rows, and the API
  // ordering the reader is relying on stays untouched.
  const rows = (tally.data ?? []).filter(
    (row) => minWithAction === undefined || row.withAction >= minWithAction,
  );

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tally-classroom">{t('behaviorLog.classroom')}</Label>
            <EntitySelect
              id="tally-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('behaviorLog.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tally-semester">{t('behaviorLog.semester')}</Label>
            <Select value={effectiveSemesterId ?? ''} onValueChange={setSemesterId}>
              <SelectTrigger id="tally-semester">
                <SelectValue placeholder={t('behaviorLog.semester')} />
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

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="tally-month">{t('behaviorLog.month')}</Label>
              <Select value={termMonth?.key ?? WHOLE_TERM} onValueChange={pickMonth}>
                <SelectTrigger id="tally-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_TERM}>{t('behaviorLog.wholeTerm')}</SelectItem>
                  {termMonths.map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.key}>
                      {t(`month.${candidate.month}`)} {candidate.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tally-from">{t('behaviorLog.from')}</Label>
              <Input
                id="tally-from"
                type="date"
                value={from ?? ''}
                max={to}
                onChange={(event) => pickRange('from', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tally-to">{t('behaviorLog.to')}</Label>
              <Input
                id="tally-to"
                type="date"
                value={to ?? ''}
                min={from}
                onChange={(event) => pickRange('to', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tally-subject">{t('behaviorLog.subject')}</Label>
              <EntitySelect
                id="tally-subject"
                value={subjectId ?? null}
                onChange={setSubjectId}
                useOptions={useSubjectsForClass}
                disabled={!classroomId}
                placeholder={
                  classroomId ? t('behaviorLog.allSubjects') : t('behaviorLog.pickClassFirst')
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tally-threshold">{t('behaviorLog.actionAtLeast')}</Label>
              <Select
                value={minWithAction === undefined ? NO_THRESHOLD : String(minWithAction)}
                onValueChange={(value) =>
                  setMinWithAction(value === NO_THRESHOLD ? undefined : Number(value))
                }
              >
                <SelectTrigger id="tally-threshold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_THRESHOLD}>{t('behaviorLog.everyone')}</SelectItem>
                  {ACTION_THRESHOLDS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {t('behaviorLog.actionCountOption', { count })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId || !effectiveSemesterId ? (
            <EmptyState icon={BarChart3} title={t('behaviorLog.tallyHint')} />
          ) : tally.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : tally.error ? (
            <ErrorState error={tally.error} onRetry={tally.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={
                minWithAction === undefined
                  ? t('behaviorLog.emptyTally')
                  : t('behaviorLog.nobodyOverLine', { count: minWithAction })
              }
              description={
                minWithAction === undefined ? t('behaviorLog.emptyTallyHint') : undefined
              }
            />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('behaviorLog.studentName')}</TableHead>
                    <TableHead className="w-28">{t('behaviorLog.entryCount')}</TableHead>
                    <TableHead className="w-32">{t('behaviorLog.actionCount')}</TableHead>
                    <TableHead className="w-32">{t('behaviorLog.lastEntry')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TallyRowView
                      key={row.studentId}
                      row={row}
                      classroomId={classroomId}
                      semesterId={effectiveSemesterId}
                      scope={scope}
                      open={openStudentIds.has(row.studentId)}
                      onToggle={() => toggleStudent(row.studentId)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('behaviorLog.tallyNote')}</p>
    </div>
  );
}

/**
 * One student's counts, and — opened up — the entries behind them.
 *
 * Every row here has at least one entry, by the endpoint's own convention, so
 * every row opens. That is the difference from the attendance summary, where a
 * clean row has nothing to show and stays shut.
 */
function TallyRowView({
  row,
  classroomId,
  semesterId,
  scope,
  open,
  onToggle,
}: {
  row: BehaviorTallyRow;
  classroomId: string | undefined;
  semesterId: string | undefined;
  scope: BehaviorTallyScope;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <Link
            to={`/students/${row.studentId}`}
            className="font-medium hover:underline"
            // The name goes to the student; the rest of the row opens the detail.
            onClick={(event) => event.stopPropagation()}
          >
            <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
          </Link>
          <p className="text-xs text-muted-foreground">{row.studentCode ?? '—'}</p>
        </TableCell>
        <TableCell className="tabular-nums">{row.entries}</TableCell>
        <TableCell>
          {row.withAction === 0 ? (
            <span className="tabular-nums text-muted-foreground">0</span>
          ) : (
            <Badge variant={row.withAction >= REPEAT_THRESHOLD ? 'danger' : 'warning'}>
              {row.withAction}
            </Badge>
          )}
        </TableCell>
        <TableCell className="tabular-nums">{formatDate(row.lastDate)}</TableCell>
        <TableCell className="text-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-expanded={open}
            aria-label={open ? t('behaviorLog.hideEntries') : t('behaviorLog.showEntries')}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronDown
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={TALLY_COLUMNS} className="py-3">
            <StudentEntries
              studentId={row.studentId}
              classroomId={classroomId}
              semesterId={semesterId}
              scope={scope}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * The entries behind one student's counts — day, lesson, what was written, and
 * what was done about it.
 *
 * Read from the log rather than the tally, which carries only counts. Newest
 * first, as the log is, and over the same window the counts were taken over.
 */
function StudentEntries({
  studentId,
  classroomId,
  semesterId,
  scope,
}: {
  studentId: string;
  classroomId: string | undefined;
  semesterId: string | undefined;
  scope: BehaviorTallyScope;
}) {
  const { t, i18n } = useTranslation();
  const entries = useStudentBehaviorEntries(studentId, classroomId, semesterId, scope, true);

  if (entries.isLoading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (entries.error) {
    return <ErrorState error={entries.error} onRetry={entries.refetch} compact />;
  }

  const records = entries.data?.data ?? [];
  const total = entries.data?.meta.total ?? records.length;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{t('behaviorLog.entriesTitle')}</p>
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('behaviorLog.entriesEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border/60 text-sm">
          {records.map((record) => (
            <EntryLine key={record.id} record={record} language={i18n.language} />
          ))}
        </ul>
      )}
      {total > records.length && (
        <p className="text-xs text-muted-foreground">
          {t('behaviorLog.entriesMore', { shown: records.length, total })}
        </p>
      )}
    </div>
  );
}

function EntryLine({ record, language }: { record: BehaviorLog; language: string }) {
  const { t } = useTranslation();
  const subject = refObject<Subject>(record.subjectId);
  const teacher = refObject<Teacher>(record.teacherId);

  return (
    <li className="grid grid-cols-[7rem_1fr_auto] items-start gap-x-3 gap-y-0.5 py-1.5 md:grid-cols-[7rem_1fr_1fr_auto]">
      <div className="leading-tight">
        <p className="tabular-nums">{formatDate(record.date)}</p>
        <p className="text-xs text-muted-foreground">
          {t('behaviorLog.periodN', { number: record.period })}
        </p>
      </div>
      <div className="leading-tight">
        {/* The class note is the fallback: on a student's row it is the line the
            whole class got, and it is all there is when the entry named no
            behaviour of their own. */}
        <p>{record.behavior || record.classNote || '—'}</p>
        <p className="text-xs text-muted-foreground md:hidden">
          {subject ? localizedName(subject, language) : '—'}
        </p>
      </div>
      <div className="hidden leading-tight md:block">
        <p>{subject ? localizedName(subject, language) : '—'}</p>
        <p className="text-xs text-muted-foreground">
          {teacher ? fullName(teacher, language) : '—'}
        </p>
      </div>
      <div>
        {record.action ? (
          <Badge variant="warning">{record.action}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{t('behaviorLog.noAction')}</span>
        )}
      </div>
    </li>
  );
}
