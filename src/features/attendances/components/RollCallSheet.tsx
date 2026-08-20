import {
  AlertCircle,
  CalendarOff,
  CheckCheck,
  ClipboardCheck,
  Clock,
  MapPin,
  Save,
  User,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { errorMessage } from '@/lib/error-message';
import { notify } from '@/lib/toast';
import { cn, fullName, localizedName, toDateInput } from '@/lib/utils';
import { StudentName } from '@/components/common/StudentName';
import {
  ATTENDANCE_STATUSES,
  RECORDABLE_ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from '@/types/enums';
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
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import type { SelectOption } from '@/components/common/fields';
import {
  useDailySheet,
  useRecordAttendance,
  type AttendanceEntryInput,
  type DailySheetEntry,
  type DailySheetLesson,
} from '../api';

/** Tailwind classes for the selected state of each status button. */
const SELECTED_TONE: Record<AttendanceStatus, string> = {
  present: 'bg-success text-success-foreground hover:bg-success/90 border-success',
  absent: 'bg-danger text-danger-foreground hover:bg-danger/90 border-danger',
  late: 'bg-warning text-warning-foreground hover:bg-warning/90 border-warning',
  excused: 'bg-info text-info-foreground hover:bg-info/90 border-info',
  sick: 'bg-info text-info-foreground hover:bg-info/90 border-info',
};

/**
 * The reasons a leave is granted for, in the office's own words.
 *
 * Lao literals rather than translation keys because the text *is* the record: the
 * API stores `reason` as free text and the register is filed in Lao, so a sheet
 * marked from an English interface must not put English into the row. Picking from
 * a list also makes the tally readable — thirteen spellings of "went to the
 * doctor" cannot be counted.
 *
 * Append to the end; existing rows hold whatever was typed before the list
 * existed, and those open under "other" rather than being rewritten.
 */
const EXCUSED_REASONS = [
  'ບໍ່ສະບາຍ',
  'ໄປວຽກຄອບຄົວ',
  'ໄປຫາໝໍ',
  'ຄອບກັບບ້ານກອນ',
  'ເຮັດວຽກສະພາ',
  'ໄປເບີ່ງແຂ່ງ',
  'ໄປຕ່າງປະເທດ',
  'ນັກກິລາ',
  'ໄປທັດສະນະ',
  'ຊ້ອມເຕັ້ນ,ກິລາ',
  'ຄົ້ນຄວ້າເສັງອັງກິດ',
  'ໄປຕ່າງແຂວງ',
  'ບໍ່ມີເຫດຜົນ',
] as const;

/**
 * The "other" option's own value.
 *
 * Not a reason and never submitted — it only tells the select apart from the
 * thirteen above. Prefixed so it can never collide with a real reason.
 */
const OTHER_REASON = '__other__';

/** Whether a stored reason came off the list, rather than being typed. */
function isPresetReason(reason: string | undefined): boolean {
  return EXCUSED_REASONS.includes(reason as (typeof EXCUSED_REASONS)[number]);
}

/** What the user has marked for one student, before it is submitted. */
interface DraftEntry {
  status: AttendanceStatus;
  minutesLate?: number;
  /** Why the student is away; required by the sheet when the status is `excused`. */
  reason?: string;
  /**
   * Set once "other" is picked, so a blank custom reason still reads as a choice
   * made. Without it an empty `reason` would be indistinguishable from "the list
   * has not been opened yet" and the free-text box would vanish mid-typing.
   */
  otherReason?: boolean;
}

/**
 * Roll call for one lesson, on one date.
 *
 * A lesson is picked, not a period number and a subject: the timetable already
 * knows which subject a class has when, and who teaches it, so asking the user to
 * restate it invites a mismatch the API would only reject after the sheet is
 * filled in. Picking the class and the date narrows it to that day's lessons.
 *
 * Nothing is pre-selected within a sheet: an unmarked row means "not yet
 * decided", which is a different fact from "present", and defaulting the whole
 * class to present would let an untouched sheet be saved as a full attendance
 * record. Re-opening a lesson that was already recorded seeds from it instead,
 * because the API upserts — submitting again corrects it rather than duplicating.
 */
export function RollCallSheet() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [date, setDate] = useState(() => toDateInput(new Date()));
  const [teachingAssignmentId, setTeachingAssignmentId] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, DraftEntry>>({});
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const sheet = useDailySheet(classroomId, date);
  const record = useRecordAttendance();

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const lessons = useMemo(() => sheet.data?.lessons ?? [], [sheet.data]);
  const lesson = lessons.find((item) => item.teachingAssignmentId === teachingAssignmentId);

  // Most days hold a single lesson, so selecting it by hand would be a click
  // that never has an alternative. Falling back to the first also recovers from
  // a selection left over from a date whose timetable is different.
  useEffect(() => {
    if (lessons.length === 0) {
      setTeachingAssignmentId(undefined);
      return;
    }
    setTeachingAssignmentId((current) =>
      current && lessons.some((item) => item.teachingAssignmentId === current)
        ? current
        : lessons[0].teachingAssignmentId,
    );
  }, [lessons]);

  // Seed from whatever is already recorded, so a correction opens on the lesson
  // as it stands rather than on a blank sheet that would have to be redone.
  useEffect(() => {
    if (!lesson) return;
    const seeded: Record<string, DraftEntry> = {};
    for (const entry of lesson.entries) {
      if (entry.status) {
        const reason = entry.reason ?? undefined;
        seeded[entry.studentId] = {
          status: entry.status,
          minutesLate: entry.minutesLate ?? undefined,
          reason,
          // Anything not on the list — including every row filed before the list
          // existed — reopens under "other", with the text intact and editable.
          otherReason: Boolean(reason) && !isPresetReason(reason),
        };
      }
    }
    setDraft(seeded);
    setSaveError(null);
  }, [lesson]);

  // Memoised so the fallback `[]` is not a fresh array on every render, which
  // would defeat the tally below.
  const entries = useMemo(() => lesson?.entries ?? [], [lesson]);
  const marked = entries.filter((entry) => draft[entry.studentId]).length;

  // A leave of absence that does not say why is the thing this sheet is meant to
  // stop recording, so it blocks the save rather than being saved and chased up
  // later — by then nobody remembers what the student said.
  const missingReasons = entries.filter((entry) => {
    const chosen = draft[entry.studentId];
    return chosen?.status === 'excused' && !chosen.reason?.trim();
  }).length;

  const counts = useMemo(() => {
    const tally = {} as Record<AttendanceStatus, number>;
    for (const status of ATTENDANCE_STATUSES) tally[status] = 0;
    for (const entry of entries) {
      const chosen = draft[entry.studentId];
      if (chosen) tally[chosen.status] += 1;
    }
    return tally;
  }, [entries, draft]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setDraft((previous) => {
      // Tapping the chosen status again unmarks the row — the way back to
      // "not yet decided" once something has been picked.
      if (previous[studentId]?.status === status) {
        const { [studentId]: _removed, ...rest } = previous;
        return rest;
      }
      // `minutesLate` and `reason` belong to one status each, so switching drops
      // them: a reason typed against a leave must not follow the row to
      // "present". The API nulls them for every other status anyway.
      return { ...previous, [studentId]: { status } };
    });
  }

  /** The free-text box, shown only under "other". */
  function setReason(studentId: string, raw: string) {
    setDraft((previous) => {
      const current = previous[studentId];
      if (!current) return previous;
      return { ...previous, [studentId]: { ...current, reason: raw } };
    });
  }

  /** The list. Picking "other" clears the reason so the box starts empty. */
  function setReasonChoice(studentId: string, choice: string) {
    setDraft((previous) => {
      const current = previous[studentId];
      if (!current) return previous;
      if (choice === OTHER_REASON) {
        return { ...previous, [studentId]: { ...current, reason: '', otherReason: true } };
      }
      return { ...previous, [studentId]: { ...current, reason: choice, otherReason: false } };
    });
  }

  function setMinutesLate(studentId: string, raw: string) {
    setDraft((previous) => {
      const current = previous[studentId];
      if (!current) return previous;
      return {
        ...previous,
        [studentId]: { ...current, minutesLate: raw === '' ? undefined : Number(raw) },
      };
    });
  }

  function markAllPresent() {
    setDraft((previous) => {
      const next = { ...previous };
      // Only fills the gaps: an absence already marked must not be overwritten
      // by a convenience button.
      for (const entry of entries) next[entry.studentId] ??= { status: 'present' };
      return next;
    });
  }

  function submit() {
    if (!teachingAssignmentId) return;
    setConfirmPartial(false);
    setSaveError(null);

    const payload: AttendanceEntryInput[] = entries
      .filter((entry) => draft[entry.studentId])
      .map((entry) => {
        const chosen = draft[entry.studentId];
        const reason = chosen.reason?.trim();
        return {
          studentId: entry.studentId,
          status: chosen.status,
          ...(chosen.status === 'late' && chosen.minutesLate !== undefined
            ? { minutesLate: chosen.minutesLate }
            : {}),
          ...(reason ? { reason } : {}),
        };
      });

    record
      .mutateAsync({ teachingAssignmentId, date, entries: payload })
      .then((result) => {
        notify.success(t('attendance.saved', { count: result.recorded }));
        void sheet.refetch();
      })
      .catch(setSaveError);
  }

  function save() {
    if (missingReasons > 0) return;
    if (marked < entries.length) return setConfirmPartial(true);
    submit();
  }

  const lessonOptions: SelectOption[] = lessons.map((item) => ({
    value: item.teachingAssignmentId,
    label: lessonLabel(item, i18n.language, t('attendance.periodN', { number: item.period })),
  }));

  const canRecord = can('attendances', 'create');

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="rollcall-classroom">{t('attendance.classroom')}</Label>
            <EntitySelect
              id="rollcall-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('attendance.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rollcall-date">{t('attendance.date')}</Label>
            <Input
              id="rollcall-date"
              type="date"
              value={date}
              // Attendance is an observation, so the API rejects a future date;
              // stopping it at the picker is friendlier than a 400.
              max={toDateInput(new Date())}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <PickerSelect
            label={t('attendance.lesson')}
            value={teachingAssignmentId}
            onChange={setTeachingAssignmentId}
            options={lessonOptions}
            placeholder={
              classroomId ? t('attendance.selectLesson') : t('attendance.selectClassroom')
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId ? (
            <EmptyState icon={ClipboardCheck} title={t('attendance.rollCallHint')} />
          ) : sheet.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : sheet.error ? (
            <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
          ) : lessons.length === 0 ? (
            // A day off the timetable, not an empty class: the API would refuse
            // the roll call anyway, so say so before the sheet is filled in.
            <EmptyState
              icon={CalendarOff}
              title={t('attendance.noLessonsToday')}
              description={t('attendance.noLessonsTodayHint')}
            />
          ) : entries.length === 0 ? (
            <EmptyState icon={Users} title={t('attendance.emptyRoster')} />
          ) : (
            <div className="space-y-3">
              {lesson && <LessonHeader lesson={lesson} />}

              <div className="scrollbar-thin overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">{t('attendance.rollNumber')}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t('attendance.studentCode')}
                      </TableHead>
                      <TableHead>{t('attendance.student')}</TableHead>
                      <TableHead>{t('attendance.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <StudentRow
                        key={entry.studentId}
                        entry={entry}
                        draft={draft[entry.studentId]}
                        disabled={!canRecord}
                        onSelect={(status) => setStatus(entry.studentId, status)}
                        onMinutesLate={(raw) => setMinutesLate(entry.studentId, raw)}
                        onReason={(raw) => setReason(entry.studentId, raw)}
                        onReasonChoice={(choice) => setReasonChoice(entry.studentId, choice)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {saveError !== null && (
                <p className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-sm text-danger">
                  <AlertCircle className="size-4 shrink-0" />
                  {errorMessage(saveError)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ATTENDANCE_STATUSES.filter((status) => counts[status] > 0).map((status) => (
                    <Badge key={status} variant={status === 'absent' ? 'danger' : 'secondary'}>
                      {t(`attendanceStatus.${status}`)} {counts[status]}
                    </Badge>
                  ))}
                  <span className="text-xs text-muted-foreground">
                    {t('attendance.markedOf', { marked, total: entries.length })}
                  </span>
                  {missingReasons > 0 && (
                    <span className="text-xs text-danger">
                      {t('attendance.reasonRequired', { count: missingReasons })}
                    </span>
                  )}
                </div>

                {canRecord && (
                  <div className="ms-auto flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={markAllPresent}>
                      <CheckCheck />
                      {t('attendance.markAllPresent')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={save}
                      loading={record.isPending}
                      disabled={marked === 0 || missingReasons > 0 || !teachingAssignmentId}
                    >
                      <Save />
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('attendance.correctionNote')}</p>

      <ConfirmDialog
        open={confirmPartial}
        onOpenChange={setConfirmPartial}
        tone="default"
        title={t('attendance.partialTitle')}
        description={t('attendance.partialBody', { count: entries.length - marked })}
        confirmLabel={t('attendance.partialConfirm')}
        isPending={record.isPending}
        onConfirm={submit}
      />
    </div>
  );
}

/** `Period 1 · Mathematics · 15:10–16:55`, for the lesson dropdown. */
function lessonLabel(lesson: DailySheetLesson, language: string, periodLabel: string): string {
  const subject = lesson.subject ? localizedName(lesson.subject, language) : '—';
  return `${periodLabel} · ${subject} · ${lesson.startTime}–${lesson.endTime}`;
}

/**
 * What is being registered, restated above the roster.
 *
 * The dropdown shows it too, but it scrolls out of sight on a long class, and a
 * sheet saved against the wrong lesson is corrected by hand afterwards. The
 * teacher's name is here because it is the timetabled teacher, not the person
 * signed in — an office user recording on their behalf should see whose lesson
 * they are filing.
 */
function LessonHeader({ lesson }: { lesson: DailySheetLesson }) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">
        {lesson.subject ? localizedName(lesson.subject, i18n.language) : '—'}
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Clock className="size-3.5 shrink-0" />
        <span className="tabular-nums">
          {lesson.startTime}–{lesson.endTime}
        </span>
        <span>({t('attendance.periodN', { number: lesson.period })})</span>
      </span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <User className="size-3.5 shrink-0" />
        {lesson.teacher ? fullName(lesson.teacher, i18n.language) : '—'}
      </span>
      {lesson.room && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          {lesson.room}
        </span>
      )}
    </div>
  );
}

/**
 * Labelled dropdown for a setting, not a filter.
 *
 * `FilterSelect` cannot stand in: it always offers an "all" entry, which is
 * meaningless for a period or a semester the sheet has to be recorded against.
 */
function PickerSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  clearable = false,
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: SelectOption[];
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const CLEAR = '__clear__';

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      <Select
        value={value ?? ''}
        onValueChange={(next) => onChange(next === CLEAR ? undefined : next)}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {clearable && (
            <SelectItem value={CLEAR} className="text-muted-foreground">
              —
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface StudentRowProps {
  entry: DailySheetEntry;
  draft: DraftEntry | undefined;
  disabled: boolean;
  onSelect: (status: AttendanceStatus) => void;
  onMinutesLate: (raw: string) => void;
  onReason: (raw: string) => void;
  onReasonChoice: (choice: string) => void;
}

/**
 * One student, marked by tapping a status.
 *
 * The statuses are laid out as buttons rather than a dropdown: roll call is one
 * pass down a class of forty, and a select costs two interactions per row.
 */
function StudentRow({
  entry,
  draft,
  disabled,
  onSelect,
  onMinutesLate,
  onReason,
  onReasonChoice,
}: StudentRowProps) {
  const { t } = useTranslation();

  // A row already filed as `sick` keeps its button so the record reads back as it
  // was recorded, and so re-marking it is a tap rather than a puzzle. The button
  // is gone the moment the row moves to anything else.
  const statuses: readonly AttendanceStatus[] =
    draft?.status === 'sick'
      ? [...RECORDABLE_ATTENDANCE_STATUSES, 'sick']
      : RECORDABLE_ATTENDANCE_STATUSES;

  return (
    <TableRow className={cn(!draft && 'bg-warning-subtle/30')}>
      <TableCell className="tabular-nums text-muted-foreground">
        {entry.rollNumber ?? '—'}
      </TableCell>
      <TableCell className="hidden font-medium md:table-cell">{entry.studentCode}</TableCell>
      <TableCell>
        <p>
          <StudentName name={entry.studentNameLo} nickname={entry.studentNickname} />
        </p>
        <p className="text-xs text-muted-foreground md:hidden">{entry.studentCode}</p>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          {statuses.map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              aria-pressed={draft?.status === status}
              className={cn('px-2', draft?.status === status && SELECTED_TONE[status])}
              onClick={() => onSelect(status)}
            >
              {t(`attendanceStatus.${status}`)}
            </Button>
          ))}

          {draft?.status === 'late' && (
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              disabled={disabled}
              value={draft.minutesLate ?? ''}
              onChange={(event) => onMinutesLate(event.target.value)}
              placeholder={t('attendance.minutesLate')}
              aria-label={t('attendance.minutesLate')}
              className="h-8 w-28 text-xs"
            />
          )}

          {draft?.status === 'excused' && (
            <>
              {/* A list rather than a box: these are the same thirteen reasons
                  every term, and typing them out is both slower and unaggregatable. */}
              <Select
                disabled={disabled}
                value={draft.otherReason ? OTHER_REASON : (draft.reason ?? '')}
                onValueChange={onReasonChoice}
              >
                <SelectTrigger
                  aria-invalid={!draft.reason?.trim()}
                  aria-label={t('attendance.reason')}
                  className="h-8 w-full text-xs sm:w-44"
                >
                  <SelectValue placeholder={t('attendance.reason')} />
                </SelectTrigger>
                <SelectContent>
                  {EXCUSED_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason} className="text-xs">
                      {reason}
                    </SelectItem>
                  ))}
                  {/* Last, and the only one that opens a box — the list is meant to
                      answer for almost every leave. */}
                  <SelectItem value={OTHER_REASON} className="text-xs">
                    {t('attendance.otherReason')}
                  </SelectItem>
                </SelectContent>
              </Select>

              {draft.otherReason && (
                <Input
                  disabled={disabled}
                  value={draft.reason ?? ''}
                  onChange={(event) => onReason(event.target.value)}
                  // The API caps it at 300; stopping it here spares the teacher a
                  // rejected sheet after the whole class has been marked.
                  maxLength={300}
                  aria-invalid={!draft.reason?.trim()}
                  placeholder={t('attendance.otherReasonDetail')}
                  aria-label={t('attendance.otherReasonDetail')}
                  className="h-8 w-full text-xs sm:w-44"
                />
              )}
            </>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
