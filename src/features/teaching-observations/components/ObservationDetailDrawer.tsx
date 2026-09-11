import { CheckCircle2, Pencil, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { formatDate, formatDateTime, fullName, localizedName, refId, refObject } from '@/lib/utils';
import type { Classroom, Subject, SubjectGroup, Teacher, TeachingObservation } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DetailDrawer, DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  isEditable,
  scoreMap,
  useAcknowledgeObservation,
  useObservation,
  useObservationRubric,
  useSubmitObservation,
} from '../api';
import { ObservationScoreTable } from './ObservationScoreTable';

interface Props {
  /** `null` closes the drawer. */
  id: string | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (observation: TeachingObservation) => void;
}

/**
 * One sheet, read as the paper form reads: who, whose lesson, and the six marks.
 *
 * The two workflow buttons are deliberately asymmetric. Filing is the observer's
 * (or the office's), because it is their judgement; confirming it has been read
 * belongs to the observed teacher alone, so it appears only on their own screen
 * and is never offered to an administrator looking at somebody else's sheet.
 */
export function ObservationDetailDrawer({ id, onOpenChange, onEdit }: Props) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const me = useCurrentUser();
  const detail = useObservation(id ?? undefined);
  const rubric = useObservationRubric();
  const submit = useSubmitObservation();
  const acknowledge = useAcknowledgeObservation();

  const sheet = detail.data;
  const ownTeacherId = me?.personType === 'teacher' ? me.personId : null;
  const isObserver = sheet ? refId(sheet.observerId) === ownTeacherId : false;
  const isObserved = sheet ? refId(sheet.teacherId) === ownTeacherId : false;
  const mayWrite = isObserver || can('teaching-observations', 'manage');

  const observed = refObject<Teacher>(sheet?.teacherId);
  const observer = refObject<Teacher>(sheet?.observerId);
  const subject = refObject<Subject>(sheet?.subjectId);
  const group = refObject<SubjectGroup>(sheet?.subjectGroupId ?? undefined);
  const classroom = refObject<Classroom>(sheet?.classroomId);

  return (
    <DetailDrawer
      open={id !== null}
      onOpenChange={onOpenChange}
      title={t('observation.sheetTitle')}
      description={
        sheet ? t('observation.visitOrdinal', { number: sheet.visitNumber }) : undefined
      }
      isLoading={detail.isLoading}
      error={detail.error}
      onRetry={detail.refetch}
      className="sm:max-w-2xl"
      footer={
        sheet && (
          <div className="flex flex-wrap gap-2">
            {mayWrite && isEditable(sheet) && (
              <Button variant="outline" onClick={() => onEdit(sheet)}>
                <Pencil />
                {t('common.edit')}
              </Button>
            )}
            {mayWrite && isEditable(sheet) && (
              <Button loading={submit.isPending} onClick={() => submit.mutate(sheet.id)}>
                <Send />
                {t('observation.submit')}
              </Button>
            )}
            {isObserved && sheet.status === 'submitted' && (
              <Button loading={acknowledge.isPending} onClick={() => acknowledge.mutate(sheet.id)}>
                <CheckCircle2 />
                {t('observation.acknowledge')}
              </Button>
            )}
          </div>
        )
      }
    >
      {sheet && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={sheet.status} namespace="observationStatus" />
            <span className="text-sm text-muted-foreground">
              {sheet.totalScore} / {sheet.maxScore || '—'}
            </span>
          </div>

          <DetailSection title={t('observation.headingSection')}>
            <DetailRow label={t('observation.observedTeacher')}>
              {fullName(observed, i18n.language)}
            </DetailRow>
            {/* The line the paper form leaves out. */}
            <DetailRow label={t('observation.observer')}>
              {fullName(observer, i18n.language)}
            </DetailRow>
            <DetailRow label={t('observation.subjectGroup')}>
              {group ? localizedName(group, i18n.language) : '—'}
            </DetailRow>
            <DetailRow label={t('observation.subject')}>
              {subject ? localizedName(subject, i18n.language) : '—'}
            </DetailRow>
            <DetailRow label={t('observation.classroom')}>{classroom?.name ?? '—'}</DetailRow>
            <DetailRow label={t('observation.observedAt')}>
              {formatDate(sheet.observedAt)}
            </DetailRow>
            <DetailRow label={t('observation.visitNumber')}>{sheet.visitNumber}</DetailRow>
          </DetailSection>

          {rubric.isLoading || !rubric.data ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <ObservationScoreTable
              criteria={rubric.data.criteria}
              values={Object.fromEntries(scoreMap(sheet))}
              criterionMaxScore={rubric.data.criterionMaxScore}
              maxTotal={rubric.data.maxTotal}
            />
          )}

          {sheet.note && (
            <DetailSection title={t('observation.note')}>
              <p className="whitespace-pre-wrap py-1.5 text-sm">{sheet.note}</p>
            </DetailSection>
          )}

          <DetailSection title={t('observation.trailSection')}>
            <DetailRow label={t('observation.submittedAt')}>
              {sheet.submittedAt ? formatDateTime(sheet.submittedAt) : '—'}
            </DetailRow>
            <DetailRow label={t('observation.acknowledgedAt')}>
              {sheet.acknowledgedAt ? formatDateTime(sheet.acknowledgedAt) : '—'}
            </DetailRow>
          </DetailSection>
        </div>
      )}
    </DetailDrawer>
  );
}
