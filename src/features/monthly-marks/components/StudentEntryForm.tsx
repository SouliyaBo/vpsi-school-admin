import { ChevronLeft, ChevronRight, Eraser, Lock, Save, Table2, Wand2 } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { classrooms } from '@/features/classrooms/api';
import { useSubjectsByGrade } from '@/features/subjects/api';
import { groupByStream, streamHeading } from '@/features/subjects/streams';
import { cn, localizedName, refId } from '@/lib/utils';
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
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import {
  formatTotal,
  localTotal,
  MARK_COLUMNS,
  useMonthGrids,
  useSaveStudentMonth,
  type MarkColumn,
  type MonthCells,
  type MonthGrid,
  type SaveStudentMonthResult,
} from '../api';
import { markingMonth, monthInTerm } from '../lib/default-month';
import { MarkInput, SheetPickers, type SheetTargetState } from './SheetPickers';

const EMPTY: MonthCells = { attendance: null, notebook: null, activity: null, test: null };

/** One line of the form: a subject, or one strand of a subject that keeps them. */
interface EntryLine {
  /** student : subject : strand. */
  key: string;
  grid: MonthGrid;
  strand: string | undefined;
  /** The ສາຍ heading the line is filed under, if its subject split from one. */
  stream: string | undefined;
}

/**
 * ໃສ່ຕາມນັກຮຽນ — one student, every subject of the month, on one screen.
 *
 * The entry form is a subject's sheet for a whole class, which is how a teacher
 * marks. The office often works the other way, from one child's paper: on that
 * form every subject was a trip back to the picker and a hunt down the roll, and
 * since ສັງຄົມ was split into ພູມສາດ, ສຶກສາພົນລະເມືອງ and ປະຫວັດສາດ it took
 * three trips where it used to take one.
 *
 * Nothing here is a second set of marks. Each line is the same row of the same
 * subject's sheet, read through `/monthly-marks/month` and saved back through it
 * one subject at a time, so who may write it, a submitted month and a column the
 * subject does not keep are all decided exactly as on the entry form.
 *
 * Unlike the entry form a blank line does **not** open on full marks: saving one
 * student here would write full marks into every subject their teacher has not
 * marked yet. ໃສ່ຄະແນນເຕັມ is still there for when that is what is wanted.
 */
export function StudentEntryForm() {
  const { t, i18n } = useTranslation();

  const [target, setTarget] = useState<SheetTargetState>({});
  // Starts on the month being marked — the one behind until the 5th — and is
  // corrected below once the API says which months this term actually collects.
  const [month, setMonth] = useState(() => markingMonth());
  const [studentId, setStudentId] = useState<string>();
  const [draft, setDraft] = useState<Record<string, MonthCells>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<SaveStudentMonthResult | null>(null);
  /** A move held back while unsaved marks are on screen. */
  const [pending, setPending] = useState<(() => void) | null>(null);

  const classroom = classrooms.useDetail(target.classroomId);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;
  const subjectList = useSubjectsByGrade(target.classroomId ? gradeLevelId : undefined, 'marked');
  const taughtList = useSubjectsByGrade(target.classroomId ? gradeLevelId : undefined, 'taught');

  /**
   * The grade's marked subjects filed under their ສາຍ — ສຶກສາພົນລະເມືອງ, ພູມສາດ
   * and ປະຫວັດສາດ together under ສາຍສັງຄົມ — rather than in the sheet's order,
   * which scatters them; and the heading each one goes under.
   */
  const { subjectIds, streamOf } = useMemo(() => {
    const streams = groupByStream(subjectList.data?.data ?? [], taughtList.data?.data);
    const headings = new Map<string, string>();
    for (const { parent, subjects } of streams) {
      if (!parent) continue;
      const heading = streamHeading(localizedName(parent, i18n.language), i18n.language);
      for (const subject of subjects) headings.set(subject.id, heading);
    }
    return {
      subjectIds: streams.flatMap(({ subjects }) => subjects.map((subject) => subject.id)),
      streamOf: headings,
    };
  }, [subjectList.data, taughtList.data, i18n.language]);

  const grids = useMonthGrids(subjectIds, {
    classroomId: target.classroomId,
    semesterId: target.semesterId,
    month,
  });
  const loading =
    subjectList.isLoading || taughtList.isLoading || grids.some((query) => query.isLoading);
  const failed = grids.filter((query) => query.error);
  const first = grids.find((query) => query.data)?.data;
  const roster = first?.rows ?? [];

  // A term that does not collect the month lands on its nearest month.
  useEffect(() => {
    if (first && !first.months.includes(month) && first.months.length > 0) {
      setMonth(monthInTerm(month, first.months));
    }
  }, [first, month]);

  const position = roster.findIndex((row) => row.studentId === studentId);
  const firstStudentId = roster[0]?.studentId;

  // A new class opens on its first student.
  useEffect(() => {
    if (firstStudentId && position < 0) setStudentId(firstStudentId);
  }, [firstStudentId, position]);

  const student = position >= 0 ? roster[position] : undefined;
  const previous = position > 0 ? roster[position - 1] : undefined;
  const next = position >= 0 ? roster[position + 1] : undefined;

  // The student is part of the key, so a draft typed for one child can never be
  // read back as another's in the render before the draft is replaced.
  const lines: EntryLine[] = grids.flatMap(({ data: grid }) => {
    if (!grid) return [];
    const strands = grid.subject.strands.length > 0 ? grid.subject.strands : [undefined];
    return strands.map((strand) => ({
      key: `${studentId}:${grid.subject.id}:${strand ?? ''}`,
      grid,
      strand,
      stream: streamOf.get(grid.subject.id),
    }));
  });

  const cellOf = (line: EntryLine) =>
    line.grid.rows
      .find((row) => row.studentId === studentId)
      ?.strands.find((cell) => (cell.strand ?? undefined) === line.strand);

  /** A submitted month is submitted for the whole class, as on the entry form. */
  const isLocked = (line: EntryLine) =>
    line.grid.rows.some((row) =>
      row.strands.some((cell) => (cell.strand ?? undefined) === line.strand && cell.isLocked),
    );
  const canWrite = (line: EntryLine) =>
    line.grid.canEdit && !isLocked(line) && Boolean(student?.isEnrolled);
  const columnsOf = (line: EntryLine): readonly MarkColumn[] =>
    line.grid.columns?.length ? line.grid.columns : MARK_COLUMNS;

  const saved: Record<string, MonthCells> = {};
  const savedRemarks: Record<string, string> = {};
  for (const line of lines) {
    const cell = cellOf(line);
    saved[line.key] = cell?.cells ?? EMPTY;
    savedRemarks[line.key] = cell?.remark ?? '';
  }

  // Compared as text: the grids are read afresh after every save, and a refetch
  // that brings back the same marks must not wipe what is being typed for the
  // next student.
  const opening = JSON.stringify({ saved, savedRemarks });
  useEffect(() => {
    const parsed = JSON.parse(opening) as {
      saved: Record<string, MonthCells>;
      savedRemarks: Record<string, string>;
    };
    setDraft(parsed.saved);
    setRemarks(parsed.savedRemarks);
  }, [opening]);

  const cellsOf = (line: EntryLine) => draft[line.key] ?? saved[line.key] ?? EMPTY;
  const dirty = lines.filter(
    (line) =>
      canWrite(line) &&
      (MARK_COLUMNS.some((column) => cellsOf(line)[column] !== saved[line.key]?.[column]) ||
        (remarks[line.key] ?? '') !== (savedRemarks[line.key] ?? '')),
  );
  const anyWritable = lines.some(canWrite);

  const save = useSaveStudentMonth();

  /** Runs a move straight away, or holds it for a yes when it would lose marks. */
  function guarded(move: () => void) {
    if (dirty.length > 0) setPending(() => move);
    else move();
  }

  function goTo(id: string) {
    setOutcome(null);
    setStudentId(id);
  }

  /** ໃສ່ຄະແນນເຕັມ — the blanks of this student's subjects, leaving written marks alone. */
  function fillEveryBlank() {
    setDraft((current) => {
      const filled = { ...current };
      for (const line of lines) {
        if (!canWrite(line)) continue;
        const columns = columnsOf(line);
        const cells = current[line.key] ?? saved[line.key] ?? EMPTY;
        filled[line.key] = Object.fromEntries(
          MARK_COLUMNS.map((column) => [
            column,
            cells[column] ?? (columns.includes(column) ? line.grid.columnMax[column] : null),
          ]),
        ) as MonthCells;
      }
      return filled;
    });
  }

  async function handleSave(then?: () => void) {
    if (!studentId || dirty.length === 0) return;
    const result = await save.mutateAsync(
      dirty.map((line) => ({
        subjectId: line.grid.subject.id,
        classroomId: line.grid.classroom.id,
        semesterId: line.grid.semester.id,
        month,
        strand: line.strand,
        entries: [{ studentId, ...cellsOf(line), remark: remarks[line.key]?.trim() || null }],
      })),
    );
    setOutcome(result);
    if (result.failedSubjectIds.length === 0) then?.();
  }

  const failedNames = lines
    .filter((line) => outcome?.failedSubjectIds.includes(line.grid.subject.id))
    .map((line) => localizedName(line.grid.subject, i18n.language));

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers
            value={target}
            onChange={(value) =>
              guarded(() => {
                setOutcome(null);
                setTarget(value);
              })
            }
            showSubject={false}
          />

          {first && student && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="student-month">{t('monthlyMark.month')}</Label>
                <Select
                  value={String(month)}
                  onValueChange={(value) =>
                    guarded(() => {
                      setOutcome(null);
                      setMonth(Number(value));
                    })
                  }
                >
                  <SelectTrigger id="student-month" className="w-36">
                    <SelectValue placeholder={t('monthlyMark.month')} />
                  </SelectTrigger>
                  <SelectContent>
                    {first.months.map((entry) => (
                      <SelectItem key={entry} value={String(entry)}>
                        {t(`month.${entry}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="student-pick">{t('monthlyMark.byStudent.student')}</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={!previous}
                    aria-label={t('monthlyMark.byStudent.previous')}
                    onClick={() => previous && guarded(() => goTo(previous.studentId))}
                  >
                    <ChevronLeft />
                  </Button>
                  <Select value={studentId} onValueChange={(id) => guarded(() => goTo(id))}>
                    <SelectTrigger id="student-pick" className="w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roster.map((row) => (
                        <SelectItem key={row.studentId} value={row.studentId}>
                          {row.rollNumber ?? '—'}. {row.studentNameLo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={!next}
                    aria-label={t('monthlyMark.byStudent.next')}
                    onClick={() => next && guarded(() => goTo(next.studentId))}
                  >
                    <ChevronRight />
                  </Button>
                  <span className="ms-1 text-sm tabular-nums text-muted-foreground">
                    {position + 1} / {roster.length}
                  </span>
                </div>
              </div>

              <div className="ms-auto flex flex-wrap items-center gap-2">
                {anyWritable && (
                  <>
                    <Button variant="outline" onClick={fillEveryBlank}>
                      <Wand2 />
                      {t('monthlyMark.fillFull')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={dirty.length === 0}
                      onClick={() => {
                        setDraft(saved);
                        setRemarks(savedRemarks);
                      }}
                    >
                      <Eraser />
                      {t('monthlyMark.clearDraft')}
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  disabled={dirty.length === 0 || save.isPending}
                  onClick={() => void handleSave()}
                >
                  <Save />
                  {dirty.length > 0
                    ? t('monthlyMark.saveCount', { count: dirty.length })
                    : t('common.save')}
                </Button>
                <Button
                  disabled={!next || dirty.length === 0 || save.isPending}
                  onClick={() => void handleSave(() => next && goTo(next.studentId))}
                >
                  {t('monthlyMark.byStudent.saveAndNext')}
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {outcome && (
        <p
          className={cn(
            'rounded-md px-3 py-2 text-sm',
            failedNames.length > 0
              ? 'bg-warning-subtle text-warning'
              : 'bg-success-subtle text-success',
          )}
        >
          {t('monthlyMark.saved', { count: outcome.saved })}
          {failedNames.length > 0 &&
            ` · ${t('monthlyMark.byStudent.notSaved', { subjects: failedNames.join(', ') })}`}
        </p>
      )}

      <Card>
        <CardContent className="pt-5">
          {!target.classroomId ? (
            <EmptyState icon={Table2} title={t('monthlyMark.byStudent.pickClass')} />
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : failed.length > 0 ? (
            <ErrorState
              error={failed[0]!.error}
              onRetry={() => failed.forEach((query) => void query.refetch())}
              compact
            />
          ) : subjectIds.length === 0 ? (
            <EmptyState icon={Table2} title={t('monthlyMark.byStudent.noSubjects')} />
          ) : roster.length === 0 || !student ? (
            <EmptyState
              icon={Table2}
              title={t('monthlyMark.emptyRoster')}
              description={t('monthlyMark.emptyRosterHint')}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <StudentName
                  name={student.studentNameLo}
                  nickname={student.studentNickname}
                  className="text-base font-medium"
                />
                <p className="text-sm text-muted-foreground">
                  {t('monthlyMark.studentCode')} {student.studentCode}
                  {!student.isEnrolled && ` · ${t('monthlyMark.left')}`}
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('monthlyMark.subject')}</TableHead>
                    {MARK_COLUMNS.map((column) => (
                      <TableHead key={column} className="w-24 text-center">
                        {t(`monthlyMark.column.${column}`)}
                      </TableHead>
                    ))}
                    <TableHead className="w-20 text-center">{t('monthlyMark.total')}</TableHead>
                    <TableHead className="min-w-56">{t('monthlyMark.remark')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => {
                    const subjectName = localizedName(line.grid.subject, i18n.language);
                    const cells = cellsOf(line);
                    const columns = columnsOf(line);
                    const writable = canWrite(line);
                    const opensStream = line.stream && line.stream !== lines[index - 1]?.stream;
                    return (
                      <Fragment key={line.key}>
                        {opensStream && (
                          <TableRow className="bg-muted/60 hover:bg-muted/60">
                            <TableCell
                              colSpan={MARK_COLUMNS.length + 3}
                              className="border-s-4 border-s-primary py-2 font-semibold"
                            >
                              {line.stream}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell
                            className={cn(line.stream && 'border-s-4 border-s-primary/40 ps-8')}
                          >
                            <p className="font-medium">
                              {subjectName}
                              {line.strand && ` · ${line.strand}`}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">
                                {line.grid.subject.code}
                              </span>
                              {isLocked(line) && (
                                <Badge variant="secondary">
                                  <Lock className="me-1 size-3" />
                                  {t('monthlyMark.submitted')}
                                </Badge>
                              )}
                              {!line.grid.canEdit && (
                                <Badge variant="outline">
                                  {t('monthlyMark.byStudent.readOnly')}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          {MARK_COLUMNS.map((column) => (
                            <TableCell key={column} className="text-center">
                              {columns.includes(column) ? (
                                <div className="flex items-center justify-center gap-1">
                                  <MarkInput
                                    value={cells[column]}
                                    max={line.grid.columnMax[column] ?? 10}
                                    disabled={!writable}
                                    label={`${subjectName} · ${t(`monthlyMark.column.${column}`)}`}
                                    onChange={(value) =>
                                      setDraft((current) => ({
                                        ...current,
                                        [line.key]: { ...cells, [column]: value },
                                      }))
                                    }
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    /{line.grid.columnMax[column]}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-medium tabular-nums">
                            {formatTotal(localTotal(cells)) ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={remarks[line.key] ?? ''}
                              maxLength={300}
                              disabled={!writable}
                              aria-label={`${subjectName} · ${t('monthlyMark.remark')}`}
                              placeholder={t('monthlyMark.remarkPlaceholder')}
                              className="h-9"
                              onChange={(event) =>
                                setRemarks((current) => ({
                                  ...current,
                                  [line.key]: event.target.value,
                                }))
                              }
                            />
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <UnsavedDialog pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}

/**
 * The yes asked for before a move that would drop typed marks — another
 * student, class, subject or month. Shared with the entry form.
 */
export function UnsavedDialog({
  pending,
  onClose,
}: {
  pending: (() => void) | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('monthlyMark.unsaved.title')}
      description={t('monthlyMark.unsaved.body')}
      confirmLabel={t('monthlyMark.unsaved.discard')}
      tone="danger"
      onConfirm={() => {
        pending?.();
        onClose();
      }}
    />
  );
}
