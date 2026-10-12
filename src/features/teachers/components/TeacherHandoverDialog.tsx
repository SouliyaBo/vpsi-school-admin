import { AlertCircle, BookMarked, Boxes, UserCheck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from '@/lib/toast';
import { fullName } from '@/lib/utils';
import type { Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EntitySelect } from '@/components/common/EntitySelect';
import { FormDialog } from '@/components/common/FormDialog';
import {
  useTeacherCommitments,
  useTeacherHandover,
  useTeacherOptions,
  type TeacherCommitments,
} from '../api';

/**
 * ສົ່ງມອບການສອນ — a departing teacher's posts passed to the one taking over.
 *
 * Shows what will move before it moves it, because the office is checking this
 * against a conversation they had with the head rather than against the screen:
 * "4 lessons and ມ.4/ກ" is the sentence they need to agree with, and a dialog that
 * only asked for a name would be asking them to trust a list they cannot see.
 *
 * Everything is ticked by default except a department headship. The case this
 * exists for is a teacher who has left and a replacement starting on Monday —
 * anything the office has to remember to tick is something they will forget on the
 * day they are busiest — while who the next head of department is, is a decision
 * rather than a consequence.
 */
export function TeacherHandoverDialog({
  open,
  onOpenChange,
  teacher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher: Teacher | null;
}) {
  const { t, i18n } = useTranslation();
  const commitments = useTeacherCommitments(teacher?.id, open);
  const handover = useTeacherHandover(teacher?.id);

  const [toTeacherId, setToTeacherId] = useState<string | null>(null);
  const [moveAssignments, setMoveAssignments] = useState(true);
  const [moveHomerooms, setMoveHomerooms] = useState(true);
  const [moveSubjectGroups, setMoveSubjectGroups] = useState(false);
  const [resign, setResign] = useState(true);
  const [note, setNote] = useState('');

  // Reset on open rather than on close, so a dialog reopened after a refusal does
  // not come back carrying the choices that were refused.
  useEffect(() => {
    if (!open) return;
    setToTeacherId(null);
    setMoveAssignments(true);
    setMoveHomerooms(true);
    setMoveSubjectGroups(false);
    setResign(true);
    setNote('');
  }, [open]);

  const held = commitments.data;
  const nothingToMove =
    held !== undefined &&
    held.assignments.length === 0 &&
    held.homerooms.length === 0 &&
    held.subjectGroups.length === 0;

  const submit = () => {
    if (!toTeacherId) return;
    handover.mutate(
      {
        toTeacherId,
        assignments: moveAssignments,
        homerooms: moveHomerooms,
        subjectGroups: moveSubjectGroups,
        resign,
        note: note.trim() || undefined,
      },
      {
        onSuccess: (result) => {
          notify.success(
            t('handover.done', {
              assignments: result.assignmentsMoved,
              homerooms: result.homeroomsMoved,
            }),
          );
          onOpenChange(false);
        },
        onError: (error) => notify.error(error),
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('handover.title')}
      description={
        teacher
          ? t('handover.subtitle', { name: fullName(teacher, i18n.language) })
          : t('handover.title')
      }
      submitLabel={t('handover.submit')}
      isSubmitting={handover.isPending}
      // Nothing to move is not a form to submit: the API refuses it, and the
      // office's next move is to look at a different teacher.
      submitDisabled={!toTeacherId || nothingToMove}
      onSubmit={submit}
    >
      <div className="space-y-4">
        {commitments.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : nothingToMove ? (
          <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <AlertCircle className="size-4 shrink-0" />
            {t('handover.nothingToMove')}
          </p>
        ) : (
          held && <HeldSummary held={held} />
        )}

        <div className="space-y-1.5">
          <Label htmlFor="handover-to">{t('handover.toTeacher')}</Label>
          <EntitySelect
            id="handover-to"
            value={toTeacherId}
            onChange={(value) => setToTeacherId(value ?? null)}
            useOptions={useTeacherOptions}
            placeholder={t('handover.selectTeacher')}
          />
          {/* The picker lists active teachers only, which is also what the API
              requires: handing a timetable to somebody who has left themselves
              would move the problem rather than solve it. */}
          <p className="text-xs text-muted-foreground">{t('handover.toTeacherHint')}</p>
        </div>

        {!nothingToMove && held && (
          <div className="space-y-2 rounded-md border border-border px-3 py-3">
            <ToggleRow
              id="handover-assignments"
              checked={moveAssignments}
              onChange={setMoveAssignments}
              disabled={held.assignments.length === 0}
              label={t('handover.moveAssignments', { count: held.assignments.length })}
            />
            <ToggleRow
              id="handover-homerooms"
              checked={moveHomerooms}
              onChange={setMoveHomerooms}
              disabled={held.homerooms.length === 0}
              label={t('handover.moveHomerooms', { count: held.homerooms.length })}
            />
            {held.subjectGroups.length > 0 && (
              <ToggleRow
                id="handover-groups"
                checked={moveSubjectGroups}
                onChange={setMoveSubjectGroups}
                label={t('handover.moveSubjectGroups', { count: held.subjectGroups.length })}
                hint={t('handover.moveSubjectGroupsHint')}
              />
            )}
            <ToggleRow
              id="handover-resign"
              checked={resign}
              onChange={setResign}
              label={t('handover.resign')}
              hint={t('handover.resignHint')}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="handover-note">{t('handover.note')}</Label>
          <Input
            id="handover-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('handover.notePlaceholder')}
            maxLength={300}
          />
          <p className="text-xs text-muted-foreground">{t('handover.noteHint')}</p>
        </div>

        {/* Said before the button is pressed, because neither is obvious and both
            are the kind of thing somebody would otherwise discover afterwards. */}
        <p className="text-xs text-muted-foreground">{t('handover.keepsHistory')}</p>
      </div>
    </FormDialog>
  );
}

/** What is about to move, in the office's own units. */
function HeldSummary({ held }: { held: TeacherCommitments }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
      {held.assignments.length > 0 && (
        <div className="flex items-start gap-2">
          <BookMarked className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{t('handover.lessonsHeld', { count: held.assignments.length })}</p>
            <div className="flex flex-wrap gap-1">
              {held.assignments.map((lesson) => (
                <Badge key={lesson.id} variant="secondary">
                  {lesson.subjectNameLo} ·{' '}
                  {[lesson.gradeLevelCode, lesson.classroomName].filter(Boolean).join('/')}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {held.homerooms.length > 0 && (
        <div className="flex items-start gap-2">
          <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p className="font-medium">{t('handover.homeroomsHeld')}</p>
            <div className="flex flex-wrap gap-1">
              {held.homerooms.map((room) => (
                <Badge key={room.id} variant="secondary">
                  {[room.gradeLevelCode, room.name].filter(Boolean).join('/')} ·{' '}
                  {t('handover.studentsCount', { count: room.studentCount })}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {held.subjectGroups.length > 0 && (
        <div className="flex items-start gap-2">
          <Boxes className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p>
            {t('handover.headOf')}{' '}
            {held.subjectGroups.map((group) => group.nameLo).join(', ')}
          </p>
        </div>
      )}

      {/* Two standing facts that a handover does not change, surfaced here because
          they are the ones the office would otherwise miss until later. */}
      {held.isAcademicHead && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {t('handover.isAcademicHead')}
        </p>
      )}
      {held.hasActiveAccount && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <UserCheck className="mt-0.5 size-3.5 shrink-0" />
          {t('handover.accountStillActive')}
        </p>
      )}
    </div>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked && !disabled}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <div className="min-w-0 space-y-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
