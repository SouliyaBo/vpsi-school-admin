import { Eraser, Lock, LockOpen, Save, Table2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';
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
  displayTotal,
  localTotal,
  MARK_COLUMNS,
  useLockMonth,
  useMonthGrid,
  useSaveMonthGrid,
  useUnlockMonth,
  type MarkColumn,
  type MonthCells,
  type SaveMarksResult,
} from '../api';
import { MarkInput, SheetPickers, type SheetTargetState } from './SheetPickers';

const EMPTY: MonthCells = { attendance: null, notebook: null, activity: null, test: null };

/**
 * The monthly form — ຂື້ນຫ້ອງ, ປື້ມ, ກິດຈະກຳ, ກວດກາ for a whole class.
 *
 * Marks are held as a draft until the teacher saves: the sheet is filled in
 * across a sitting, and a request per keystroke would make every correction a
 * network round trip on a connection that is not always there. Only the rows
 * that actually changed are sent, so saving twice writes nothing the second
 * time and cannot overwrite a colleague's row that was never touched here.
 *
 * ລວມ is the one figure computed on this side, because it has to answer under
 * the fingers of whoever is typing. Everything above it — ສະເລ່ຍ, 3 ເດືອນ,
 * ພາກຮຽນ — is the API's, so no two screens can disagree about the term mark.
 * It is shown as a whole mark, the way the office writes a month's total, but
 * only here on the screen: the exact figure is what is saved and what every
 * average above is built from.
 *
 * An unmarked row opens on ຄະແນນເຕັມ rather than on four blanks, because that is
 * what most of a class gets: the teacher then types only where a mark was lost.
 * Those cells are drawn faintly and are still only a draft — nothing reaches the
 * API until ບັນທຶກ — and ລ້າງ puts the sheet back to what is actually saved.
 *
 * ເຫດຜົນ sits at the end of each row, saved with the marks and printed under the
 * subject on ໃບລາຍງານຜູ້ປົກຄອງ. It is where a lost mark gets explained while the
 * teacher still remembers why: the letter home used to take a remark typed at
 * the moment of export and kept nowhere, so the same month sent twice could say
 * two different things and the office held no record of either.
 *
 * Which columns are drawn is the API's answer, not the four constants: ສັງຄົມ
 * keeps no ປື້ມ — the ສາຍວິຊາ itself at ມ.1–ມ.3, and ພູມສາດ / ສຶກສາພົນລະເມືອງ /
 * ປະຫວັດສາດ at ມ.5 and ມ.6 — and a cell for it would invite a mark the save
 * refuses and a ຄະແນນເຕັມ prefill of 0 that reads as a notebook the student lost
 * rather than one nobody keeps.
 */
export function MonthGridForm() {
  const { t } = useTranslation();
  const can = useCan();

  const [target, setTarget] = useState<SheetTargetState>({});
  // Starts on the current calendar month; corrected below once the API says
  // which months this term actually collects.
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [strand, setStrand] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, MonthCells>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<SaveMarksResult | null>(null);
  const [reopening, setReopening] = useState(false);

  const grid = useMonthGrid({ ...target, month });
  const save = useSaveMonthGrid();
  const lock = useLockMonth();
  const unlock = useUnlockMonth();

  const data = grid.data;
  const strands = data?.subject.strands ?? [];
  const activeStrand = strands.length > 0 ? (strand ?? strands[0]) : undefined;

  // A term that does not collect the current month — the school breaks for exams
  // in ທັນວາ and ມັງກອນ — lands on its last month rather than on an empty grid.
  useEffect(() => {
    if (data && !data.months.includes(month) && data.months.length > 0) {
      setMonth(data.months[data.months.length - 1]);
    }
  }, [data, month]);

  /** The saved marks for the strand on screen. */
  const saved = useMemo(() => {
    const rows: Record<string, MonthCells> = {};
    for (const row of data?.rows ?? []) {
      const cell = row.strands.find((entry) => (entry.strand ?? undefined) === activeStrand);
      rows[row.studentId] = cell?.cells ?? EMPTY;
    }
    return rows;
  }, [data, activeStrand]);

  /** ເຫດຜົນ as it stands on the server, so only edited ones are ever sent. */
  const savedRemarks = useMemo(() => {
    const rows: Record<string, string> = {};
    for (const row of data?.rows ?? []) {
      const cell = row.strands.find((entry) => (entry.strand ?? undefined) === activeStrand);
      rows[row.studentId] = cell?.remark ?? '';
    }
    return rows;
  }, [data, activeStrand]);

  const isLocked = (data?.rows ?? []).some((row) =>
    row.strands.some((cell) => (cell.strand ?? undefined) === activeStrand && cell.isLocked),
  );
  const canWrite = Boolean(data?.canEdit) && !isLocked;

  /**
   * The columns to draw — the subject's own where the API names them, and all
   * four for an API that predates a subject being able to drop one.
   */
  const columns = useMemo<readonly MarkColumn[]>(
    () => (data?.columns?.length ? data.columns : MARK_COLUMNS),
    [data],
  );

  /**
   * ຄະແນນເຕັມ of every column the subject keeps, as the API states them.
   *
   * A column it does not keep stays `null` rather than taking its max of 0: the
   * prefill must leave it unwritten, since 0 there would be a mark nobody gave.
   */
  const fullMarks = useMemo<MonthCells>(() => {
    if (!data) return EMPTY;
    return Object.fromEntries(
      MARK_COLUMNS.map((column) => [
        column,
        columns.includes(column) ? (data.columnMax[column] ?? null) : null,
      ]),
    ) as MonthCells;
  }, [data, columns]);

  /** Fill the blanks of one row with full marks, leaving written marks alone. */
  const withFullMarks = (cells: MonthCells): MonthCells =>
    Object.fromEntries(
      MARK_COLUMNS.map((column) => [column, cells[column] ?? fullMarks[column]]),
    ) as MonthCells;

  /**
   * What the draft starts out as: the saved marks, with full marks standing in
   * for every row of the class that has none yet.
   *
   * A row that is partly marked is left as it was — someone was in the middle of
   * it, and a stand-in there would read as a mark they had already given.
   */
  const opening = useMemo(() => {
    const rows: Record<string, MonthCells> = { ...saved };
    if (!canWrite) return rows;
    for (const row of data?.rows ?? []) {
      if (!row.isEnrolled) continue;
      const cells = saved[row.studentId] ?? EMPTY;
      if (columns.every((column) => cells[column] === null)) {
        rows[row.studentId] = fullMarks;
      }
    }
    return rows;
  }, [saved, data, canWrite, fullMarks, columns]);

  useEffect(() => {
    setDraft(opening);
    setOutcome(null);
  }, [opening]);

  useEffect(() => {
    setRemarks(savedRemarks);
  }, [savedRemarks]);

  /**
   * The rows ບັນທຶກ would send — a changed mark or a changed ເຫດຜົນ is equally a
   * change, so a teacher who only explains a month still has something to save.
   */
  const dirty = [...new Set([...Object.keys(draft), ...Object.keys(remarks)])].filter(
    (studentId) =>
      MARK_COLUMNS.some((column) => draft[studentId]?.[column] !== saved[studentId]?.[column]) ||
      (remarks[studentId] ?? '') !== (savedRemarks[studentId] ?? ''),
  );

  /** A cell holding a stand-in rather than a mark anyone has given. */
  const isSuggested = (studentId: string, column: MarkColumn) =>
    saved[studentId]?.[column] == null && draft[studentId]?.[column] === fullMarks[column];

  /** How many rows are sitting on untouched full marks — what ບັນທຶກ would write. */
  const suggestedRows = (data?.rows ?? []).filter(
    (row) => row.isEnrolled && columns.every((column) => isSuggested(row.studentId, column)),
  ).length;

  /** ໃສ່ຄະແນນເຕັມ — every blank on the sheet, including half-marked rows. */
  function fillEveryBlank() {
    setDraft((previous) => {
      const next: Record<string, MonthCells> = { ...previous };
      for (const row of data?.rows ?? []) {
        if (!row.isEnrolled) continue;
        next[row.studentId] = withFullMarks(previous[row.studentId] ?? EMPTY);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!data || dirty.length === 0) return;
    const result = await save.mutateAsync({
      subjectId: data.subject.id,
      classroomId: data.classroom.id,
      semesterId: data.semester.id,
      month,
      strand: activeStrand,
      entries: dirty.map((studentId) => ({
        studentId,
        // Falls back to what is saved rather than to blanks: a row that reached
        // this list on its ເຫດຜົນ alone must not arrive with four nulls, which
        // would clear marks nobody touched.
        ...(draft[studentId] ?? saved[studentId] ?? EMPTY),
        remark: remarks[studentId]?.trim() || null,
      })),
    });
    setOutcome(result);
  }

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          <SheetPickers value={target} onChange={setTarget} />

          {data && (
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="grid-month">{t('monthlyMark.month')}</Label>
                <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                  <SelectTrigger id="grid-month" className="w-36">
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

              {strands.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="grid-strand">{t('monthlyMark.strand')}</Label>
                  <Select value={activeStrand} onValueChange={setStrand}>
                    <SelectTrigger id="grid-strand" className="w-40">
                      <SelectValue placeholder={t('monthlyMark.strand')} />
                    </SelectTrigger>
                    <SelectContent>
                      {strands.map((entry) => (
                        <SelectItem key={entry} value={entry}>
                          {entry}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="ms-auto flex items-center gap-2">
                {canWrite && (
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
                {isLocked && (
                  <Badge variant="secondary">
                    <Lock className="me-1 size-3" />
                    {t('monthlyMark.submitted')}
                  </Badge>
                )}
                {isLocked && can('scores', 'manage') && (
                  <Button variant="outline" onClick={() => setReopening(true)}>
                    <LockOpen />
                    {t('monthlyMark.reopen')}
                  </Button>
                )}
                {!isLocked && data.canEdit && (
                  <Button
                    variant="outline"
                    disabled={dirty.length > 0 || lock.isPending}
                    onClick={() =>
                      lock.mutate({
                        subjectId: data.subject.id,
                        classroomId: data.classroom.id,
                        semesterId: data.semester.id,
                        month,
                        strand: activeStrand,
                      })
                    }
                  >
                    <Lock />
                    {t('monthlyMark.submit')}
                  </Button>
                )}
                <Button
                  disabled={!canWrite || dirty.length === 0 || save.isPending}
                  onClick={handleSave}
                >
                  <Save />
                  {dirty.length > 0
                    ? t('monthlyMark.saveCount', { count: dirty.length })
                    : t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canWrite && suggestedRows > 0 && (
        <p className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info print:hidden">
          {t('monthlyMark.prefilledFull', { count: suggestedRows })}
        </p>
      )}

      {outcome && (
        <p
          className={cn(
            'rounded-md px-3 py-2 text-sm',
            outcome.errors.length > 0
              ? 'bg-warning-subtle text-warning'
              : 'bg-success-subtle text-success',
          )}
        >
          {t('monthlyMark.saved', { count: outcome.saved })}
          {outcome.errors.length > 0 &&
            ` · ${t('monthlyMark.skipped', { count: outcome.skipped })}`}
        </p>
      )}

      <Card>
        <CardContent className="pt-5">
          {!target.subjectId || !target.classroomId ? (
            <EmptyState icon={Table2} title={t('monthlyMark.pickSheet')} />
          ) : grid.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : grid.error ? (
            <ErrorState error={grid.error} onRetry={grid.refetch} compact />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              icon={Table2}
              title={t('monthlyMark.emptyRoster')}
              description={t('monthlyMark.emptyRosterHint')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('monthlyMark.rollNumber')}</TableHead>
                  <TableHead className="w-24">{t('monthlyMark.studentCode')}</TableHead>
                  <TableHead>{t('monthlyMark.studentName')}</TableHead>
                  {columns.map((column) => (
                    <TableHead key={column} className="w-20 text-center">
                      {t(`monthlyMark.column.${column}`)}
                      <span className="ms-1 font-normal text-muted-foreground">
                        /{data?.columnMax[column]}
                      </span>
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-center">{t('monthlyMark.total')}</TableHead>
                  <TableHead className="min-w-56">{t('monthlyMark.remark')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((row) => {
                  const cells = draft[row.studentId] ?? EMPTY;
                  const total = displayTotal(localTotal(cells));
                  return (
                    <TableRow key={row.studentId} className={cn(!row.isEnrolled && 'opacity-60')}>
                      <TableCell className="tabular-nums">{row.rollNumber ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
                        {!row.isEnrolled && (
                          <p className="text-xs text-muted-foreground">{t('monthlyMark.left')}</p>
                        )}
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell key={column} className="text-center">
                          <MarkInput
                            value={cells[column]}
                            max={data?.columnMax[column] ?? 10}
                            disabled={!canWrite || !row.isEnrolled}
                            suggested={isSuggested(row.studentId, column)}
                            label={`${row.studentNameLo} · ${t(`monthlyMark.column.${column}`)}`}
                            onChange={(next) =>
                              setDraft((previous) => ({
                                ...previous,
                                [row.studentId]: { ...cells, [column]: next },
                              }))
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-medium tabular-nums">
                        {total ?? '—'}
                      </TableCell>
                      {/* ເຫດຜົນ — saved with the marks and printed under this
                          subject on the month's letter to the guardian. */}
                      <TableCell>
                        <Input
                          value={remarks[row.studentId] ?? ''}
                          maxLength={300}
                          disabled={!canWrite || !row.isEnrolled}
                          aria-label={`${row.studentNameLo} · ${t('monthlyMark.remark')}`}
                          placeholder={t('monthlyMark.remarkPlaceholder')}
                          className="h-9"
                          onChange={(event) =>
                            setRemarks((previous) => ({
                              ...previous,
                              [row.studentId]: event.target.value,
                            }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && !data.canEdit && (
        <p className="text-xs text-muted-foreground">{t('monthlyMark.readOnly')}</p>
      )}

      <ConfirmDialog
        open={reopening}
        onOpenChange={setReopening}
        title={t('monthlyMark.reopen')}
        description={t('monthlyMark.reopenConfirm')}
        isPending={unlock.isPending}
        onConfirm={() => {
          if (!data) return;
          void unlock
            .mutateAsync({
              subjectId: data.subject.id,
              classroomId: data.classroom.id,
              semesterId: data.semester.id,
              month,
              strand: activeStrand,
              reason: t('monthlyMark.reopenReason'),
            })
            .finally(() => setReopening(false));
        }}
      />
    </div>
  );
}
