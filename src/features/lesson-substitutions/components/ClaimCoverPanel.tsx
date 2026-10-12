import { AlertCircle, UserCheck, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useTeacherOptions } from '@/features/teachers/api';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EntitySelect } from '@/components/common/EntitySelect';
import { useClaimLessonCover, useLessonClaimability } from '../api';

/**
 * ເຫດຜົນ — why the timetabled teacher was not there.
 *
 * The office's own shortlist, in the order they say it. Offered rather than
 * demanded: the point of this panel is that a teacher standing in front of a class
 * reaches the register in one click, and a required category would put a form in
 * front of the one thing that has to be quick.
 */
const COVER_REASONS = ['sickLeave', 'personalLeave', 'officialDuty', 'notArrived'] as const;

const OTHER_REASON = '__other__';

/**
 * The claim affordance, wherever a lesson is written up.
 *
 * Both per-lesson logs need it in the same place and for the same reason: the
 * teacher who is actually in the room is refused the save, and until now the only
 * way through was to telephone the office. So the screen offers the way through at
 * the point it would otherwise say no.
 *
 * Two audiences, deliberately shaped differently:
 *
 * - a **teacher** who does not hold the lesson is prompted, because they are
 *   looking at a refusal and this is what to do about it;
 * - the **office** holds every lesson already, so nothing prompts them — they get
 *   one quiet link, which is the fallback the teacher's refusal points at once a
 *   claim window has shut. Prompting them on every lesson they open would be a
 *   feature about somebody's absence shown to the one party it is never about.
 *
 * Once cover is on file it says nothing to anybody: the lesson header names the
 * stand-in, which is all that is left to know.
 */
export function ClaimCoverPanel({
  teachingAssignmentId,
  date,
  enabled,
}: {
  teachingAssignmentId: string | undefined;
  /** `yyyy-MM-dd` of the lesson. */
  date: string;
  /** Whether the caller holds `lesson-substitutions:read` — see `useLessonClaimability`. */
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const claim = useClaimLessonCover();
  const claimability = useLessonClaimability(teachingAssignmentId, date, enabled);

  const [reason, setReason] = useState<string>(COVER_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  /** Who took the lesson — the office's field, and only the office's. */
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);

  const oversees = can('lesson-substitutions', 'manage');
  const state = claimability.data;

  // Nothing to say while it loads. A failed or unrecognised read is silence too:
  // the save button is the server's call, and this panel's other mode is a
  // refusal — one shown because a response arrived in an unexpected shape is
  // worse than nothing at all.
  if (!teachingAssignmentId) return null;
  if (!state || typeof state.canRecord !== 'boolean') return null;
  // Cover is already on file; the lesson header names who took it.
  if (state.claimedByTeacherId) return null;

  const submit = () => {
    const text = reason === OTHER_REASON ? otherReason.trim() : t(`cover.reason.${reason}`);
    claim.mutate(
      {
        teachingAssignmentId,
        date,
        reason: text || undefined,
        // Omitted means "me", which is what a teacher always sends.
        substituteTeacherId: filing ? (substituteTeacherId ?? undefined) : undefined,
      },
      {
        onSuccess: () => {
          notify.success(t(filing ? 'cover.filed' : 'cover.claimed'));
          setFiling(false);
          setSubstituteTeacherId(null);
        },
        onError: (error) => notify.error(error),
      },
    );
  };

  const form = (
    <div className="flex flex-wrap items-end gap-2">
      {filing && (
        <EntitySelect
          className="min-w-56"
          value={substituteTeacherId}
          onChange={(value) => setSubstituteTeacherId(value ?? null)}
          useOptions={useTeacherOptions}
          placeholder={t('cover.selectSubstitute')}
        />
      )}

      <Select value={reason} onValueChange={setReason}>
        <SelectTrigger className="min-w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COVER_REASONS.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`cover.reason.${value}`)}
            </SelectItem>
          ))}
          <SelectItem value={OTHER_REASON}>{t('cover.reason.other')}</SelectItem>
        </SelectContent>
      </Select>

      {reason === OTHER_REASON && (
        <Input
          className="min-w-52 flex-1"
          value={otherReason}
          onChange={(event) => setOtherReason(event.target.value)}
          placeholder={t('cover.reasonPlaceholder')}
          maxLength={300}
        />
      )}

      <Button
        size="sm"
        onClick={submit}
        loading={claim.isPending}
        // The office has to say who took it; a teacher is already the answer.
        disabled={filing && !substituteTeacherId}
      >
        <UserPlus />
        {t(filing ? 'cover.file' : 'cover.claim')}
      </Button>
    </div>
  );

  /**
   * The office already holds every lesson, so there is no refusal to explain —
   * only the one thing they may do that a teacher may not: file cover under a
   * colleague's name, including after the claim window has shut.
   */
  if (state.canRecord) {
    if (!oversees) return null;
    if (!filing) {
      return (
        <Button variant="ghost" size="sm" className="-ms-2" onClick={() => setFiling(true)}>
          <UserCheck />
          {t('cover.fileForTeacher')}
        </Button>
      );
    }
    return (
      <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3">
        <p className="text-sm font-medium">{t('cover.fileForTeacher')}</p>
        <p className="text-xs text-muted-foreground">{t('cover.fileExplainer')}</p>
        {form}
      </div>
    );
  }

  if (!state.canClaim) {
    return (
      <p className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning-subtle px-3 py-2 text-sm text-warning">
        <AlertCircle className="size-4 shrink-0" />
        {/* The server's own refusal, translated by its key — so the reason on
            screen is the reason the API would give, not a second guess at it. */}
        {state.blockedBy ? t(`errors.${state.blockedBy}`) : t('cover.cannotClaim')}
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 px-3 py-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <UserCheck className="size-4 shrink-0" />
        {t('cover.notYourLesson')}
      </p>
      <p className="text-xs text-muted-foreground">{t('cover.claimExplainer')}</p>
      {form}
      {/* Said out loud, because a claim is not a private note: the colleague whose
          lesson it is gets a message the moment this is pressed. */}
      <p className="text-xs text-muted-foreground">{t('cover.notifiesOwner')}</p>
    </div>
  );
}
