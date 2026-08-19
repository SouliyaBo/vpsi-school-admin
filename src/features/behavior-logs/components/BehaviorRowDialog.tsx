import { AlertCircle, CalendarOff, Plus, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/error-message';
import { notify } from '@/lib/toast';
import { fullName, localizedName, toDateInput, withNickname } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/common/FormDialog';
import {
  useBehaviorEntryContext,
  useCreateBehaviorLog,
  useUpdateBehaviorLog,
  type BehaviorEntryInput,
  type RosterEntry,
  type SheetRow,
} from '../api';

/** One student being written into the row, before it is submitted. */
interface DraftStudent {
  studentId: string;
  behavior: string;
  action: string;
}

interface BehaviorRowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classroomId: string;
  /** Present when editing; absent for a new row. */
  row?: SheetRow;
  /** Seeds the date of a new row — the month being viewed, not necessarily today. */
  defaultDate: string;
  onSaved?: () => void;
}

/**
 * One row of the register, written or corrected.
 *
 * The row — not the record — is the unit of editing, because that is the unit the
 * form fills in: a note about the class, and the students it was about. The API
 * keeps those records under one group id for exactly this reason.
 *
 * The date and the lesson are fixed once a row exists. Everything denormalized
 * onto its records comes off the lesson, so moving a row to a different one is a
 * withdrawal and a re-entry rather than an edit, and the API refuses it.
 */
export function BehaviorRowDialog({
  open,
  onOpenChange,
  classroomId,
  row,
  defaultDate,
  onSaved,
}: BehaviorRowDialogProps) {
  const { t, i18n } = useTranslation();
  const isEdit = Boolean(row);

  const [date, setDate] = useState(defaultDate);
  const [teachingAssignmentId, setTeachingAssignmentId] = useState<string | undefined>();
  const [classNote, setClassNote] = useState('');
  const [remark, setRemark] = useState('');
  const [students, setStudents] = useState<DraftStudent[]>([]);
  const [saveError, setSaveError] = useState<unknown>(null);

  const create = useCreateBehaviorLog();
  const update = useUpdateBehaviorLog();
  const isPending = create.isPending || update.isPending;

  const context = useBehaviorEntryContext(open ? classroomId : undefined, date);
  const lessons = useMemo(() => context.data?.lessons ?? [], [context.data]);
  const roster = useMemo(() => context.data?.roster ?? [], [context.data]);

  // Re-seeded whenever the dialog opens, so a cancelled edit does not leak into
  // the next one and a new row does not open on the previous row's students.
  useEffect(() => {
    if (!open) return;
    setDate(row?.date ?? defaultDate);
    setTeachingAssignmentId(row?.teachingAssignmentId);
    setClassNote(row?.classNote ?? '');
    setRemark(row?.remark ?? '');
    setStudents(
      (row?.students ?? []).map((student) => ({
        studentId: student.studentId,
        behavior: student.behavior ?? '',
        action: student.action ?? '',
      })),
    );
    setSaveError(null);
  }, [open, row, defaultDate]);

  // Most school days hold one lesson, so picking it by hand would be a click with
  // no alternative. Also recovers from a lesson left selected after the date
  // moved to a day with a different timetable.
  useEffect(() => {
    if (isEdit || lessons.length === 0) return;
    setTeachingAssignmentId((current) =>
      current && lessons.some((lesson) => lesson.teachingAssignmentId === current)
        ? current
        : lessons[0].teachingAssignmentId,
    );
  }, [lessons, isEdit]);

  const byId = useMemo(
    () => new Map(roster.map((entry) => [entry.studentId, entry])),
    [roster],
  );
  const unlisted = roster.filter(
    (entry) => !students.some((student) => student.studentId === entry.studentId),
  );

  // A row has to say something. Either half will do — the paper form is full of
  // rows that only describe the class — but not neither.
  const isEmpty = students.length === 0 && !classNote.trim();

  function addStudent(studentId: string) {
    setStudents((previous) => [...previous, { studentId, behavior: '', action: '' }]);
  }

  function patchStudent(studentId: string, patch: Partial<DraftStudent>) {
    setStudents((previous) =>
      previous.map((student) =>
        student.studentId === studentId ? { ...student, ...patch } : student,
      ),
    );
  }

  function removeStudent(studentId: string) {
    setStudents((previous) => previous.filter((student) => student.studentId !== studentId));
  }

  function submit() {
    // Guarded here rather than by disabling the button: the two conditions have
    // their own hints on screen, and a dead submit button explains neither.
    if (isEmpty) return;
    if (!isEdit && !teachingAssignmentId) return;
    setSaveError(null);

    const entries: BehaviorEntryInput[] = students.map((student) => ({
      studentId: student.studentId,
      ...(student.behavior.trim() ? { behavior: student.behavior.trim() } : {}),
      ...(student.action.trim() ? { action: student.action.trim() } : {}),
    }));

    const request = row
      ? update.mutateAsync({
          groupId: row.groupId,
          body: { classNote: classNote.trim(), remark: remark.trim(), entries },
        })
      : create.mutateAsync({
          teachingAssignmentId: teachingAssignmentId!,
          date,
          classNote: classNote.trim(),
          remark: remark.trim(),
          entries,
        });

    request
      .then(() => {
        notify.success(t(row ? 'toast.updated' : 'toast.created'));
        onOpenChange(false);
        onSaved?.();
      })
      .catch(setSaveError);
  }

  const noLessons = !isEdit && !context.isLoading && lessons.length === 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={t(row ? 'behaviorLog.editRow' : 'behaviorLog.addRow')}
      description={t('behaviorLog.rowHint')}
      isSubmitting={isPending}
      onSubmit={submit}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="behavior-date">{t('behaviorLog.date')}</Label>
            <Input
              id="behavior-date"
              type="date"
              value={date}
              // The register records what happened, so the API refuses a future
              // date; stopping it at the picker beats a 400 after the row is typed.
              max={toDateInput(new Date())}
              // Every denormalized field hangs off the lesson, which hangs off the
              // date — so an existing row's date is fixed, not merely discouraged.
              disabled={isEdit}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="behavior-lesson">{t('behaviorLog.lesson')}</Label>
            {isEdit ? (
              <p
                id="behavior-lesson"
                className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm"
              >
                {row?.subject ? localizedName(row.subject, i18n.language) : '—'}
                <span className="ms-2 text-muted-foreground">
                  ({t('behaviorLog.periodN', { number: row?.period })})
                </span>
              </p>
            ) : (
              <Select
                value={teachingAssignmentId ?? ''}
                onValueChange={setTeachingAssignmentId}
                disabled={lessons.length === 0}
              >
                <SelectTrigger id="behavior-lesson">
                  <SelectValue placeholder={t('behaviorLog.selectLesson')} />
                </SelectTrigger>
                <SelectContent>
                  {lessons.map((lesson) => (
                    <SelectItem
                      key={lesson.teachingAssignmentId}
                      value={lesson.teachingAssignmentId}
                    >
                      {t('behaviorLog.periodN', { number: lesson.period })} ·{' '}
                      {lesson.subject ? localizedName(lesson.subject, i18n.language) : '—'} ·{' '}
                      {lesson.teacher ? fullName(lesson.teacher, i18n.language) : '—'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {noLessons && (
          <p className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning-subtle px-3 py-2 text-sm text-warning">
            <CalendarOff className="size-4 shrink-0" />
            {t('behaviorLog.noLessonsHint')}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="behavior-class-note">{t('behaviorLog.classNote')}</Label>
          <Textarea
            id="behavior-class-note"
            rows={2}
            value={classNote}
            maxLength={1000}
            placeholder={t('behaviorLog.classNotePlaceholder')}
            onChange={(event) => setClassNote(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label>{t('behaviorLog.students')}</Label>
            <span className="text-xs text-muted-foreground">
              {t('behaviorLog.studentsOptional')}
            </span>

            <div className="ms-auto w-56">
              <Select
                // Kept at `''` so the trigger always reads as "add a student"
                // rather than latching onto whoever was added last.
                value=""
                onValueChange={addStudent}
                disabled={unlisted.length === 0}
              >
                <SelectTrigger aria-label={t('behaviorLog.addStudent')}>
                  <span className="flex items-center gap-1.5 text-sm">
                    <UserPlus className="size-4" />
                    {t('behaviorLog.addStudent')}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {unlisted.map((entry) => (
                    <SelectItem key={entry.studentId} value={entry.studentId}>
                      {rosterLabel(entry)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {students.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              {t('behaviorLog.noStudentsYet')}
            </p>
          ) : (
            <div className="space-y-2">
              {students.map((student) => (
                <div
                  key={student.studentId}
                  className="grid items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_auto]"
                >
                  <p className="truncate text-sm font-medium sm:pb-2">
                    {byId.has(student.studentId)
                      ? rosterLabel(byId.get(student.studentId)!)
                      : student.studentId}
                  </p>
                  <div className="space-y-1">
                    {/* Ids carry the student, so each row's two labels name their
                        own inputs rather than every row's — the list repeats the
                        same two fields, and a bare label would name none of them. */}
                    <Label
                      htmlFor={`behavior-${student.studentId}`}
                      className="text-xs text-muted-foreground"
                    >
                      {t('behaviorLog.behavior')}
                    </Label>
                    <Input
                      id={`behavior-${student.studentId}`}
                      value={student.behavior}
                      maxLength={500}
                      placeholder={t('behaviorLog.behaviorPlaceholder')}
                      onChange={(event) =>
                        patchStudent(student.studentId, { behavior: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`action-${student.studentId}`}
                      className="text-xs text-muted-foreground"
                    >
                      {t('behaviorLog.action')}
                    </Label>
                    <Input
                      id={`action-${student.studentId}`}
                      value={student.action}
                      maxLength={200}
                      placeholder={t('behaviorLog.actionPlaceholder')}
                      onChange={(event) =>
                        patchStudent(student.studentId, { action: event.target.value })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('common.delete')}
                    onClick={() => removeStudent(student.studentId)}
                  >
                    <Trash2 className="text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="behavior-remark">{t('behaviorLog.remark')}</Label>
          <Input
            id="behavior-remark"
            value={remark}
            maxLength={500}
            onChange={(event) => setRemark(event.target.value)}
          />
        </div>

        {isEmpty && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Plus className="size-3.5 shrink-0" />
            {t('behaviorLog.emptyRowHint')}
          </p>
        )}

        {saveError !== null && (
          <p className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-sm text-danger">
            <AlertCircle className="size-4 shrink-0" />
            {errorMessage(saveError)}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

/**
 * `0012 — ທ້າວ ແດນມີ (ລິຕ້າ) (12)`, the roster's own ordering made visible.
 *
 * The nickname is in here because this is the picker a teacher uses to say which
 * child a row is about, and the register name is the one they are least sure of.
 */
function rosterLabel(entry: RosterEntry): string {
  const roll = entry.rollNumber == null ? '' : ` (${entry.rollNumber})`;
  return `${entry.studentCode} — ${withNickname(entry.studentNameLo, entry.studentNickname)}${roll}`;
}
