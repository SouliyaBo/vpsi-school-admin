import {
  CheckCircle2,
  Download,
  Paperclip,
  Send,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { formatBytes, formatDate, formatDateTime, refObject } from '@/lib/utils';
import type { Classroom, Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { DetailDrawer, DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { FileUpload } from '@/components/common/FileUpload';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  isEditable,
  isSubmittable,
  taughtCount,
  useLessonPlan,
  useLessonPlanAttachments,
  useMarkActivity,
  useReviewLessonPlan,
  useSubmitLessonPlan,
  useUploadAttachment,
} from '../api';
import { ACCEPTED_DOCUMENTS, MAX_DOCUMENT_BYTES } from './AttachmentPicker';

interface Props {
  /** `null` keeps the drawer closed. */
  planId: string | null;
  onClose: () => void;
  /**
   * `review` shows approve/return; `own` shows submit, upload and the
   * mark-as-taught controls. The distinction is the caller's, but the API
   * enforces it independently — a teacher without `approve` cannot review
   * whichever buttons the UI renders.
   */
  mode: 'review' | 'own';
}

/**
 * One week's plan, opened from the matrix or from a teacher's own list.
 *
 * The two modes share everything except the footer, because the underlying
 * record is the same and a head who is also a teacher should not see a different
 * plan depending on which tab they came from.
 */
export function PlanDetailDrawer({ planId, onClose, mode }: Props) {
  const { t } = useTranslation();
  const can = useCan();

  const [comment, setComment] = useState('');

  const query = useLessonPlan(planId ?? undefined);
  const attachments = useLessonPlanAttachments(planId ?? undefined);
  const submit = useSubmitLessonPlan();
  const review = useReviewLessonPlan();
  const markActivity = useMarkActivity();
  const uploadAttachment = useUploadAttachment();

  const plan = query.data;

  function close() {
    setComment('');
    onClose();
  }

  const teacher = refObject<Teacher>(plan?.teacherId);
  const subject = refObject<Subject>(plan?.subjectId);
  const classroom = refObject<Classroom>(plan?.classroomId);

  const canReview = mode === 'review' && can('lesson-plans', 'approve');
  const awaitingDecision =
    plan?.status === 'submitted' || plan?.status === 'under_review';

  return (
    <DetailDrawer
      open={planId !== null}
      onOpenChange={(open) => !open && close()}
      title={plan?.title ?? t('lessonPlan.title')}
      description={
        plan
          ? `${formatDate(plan.weekStartDate)} – ${formatDate(plan.weekEndDate)}`
          : undefined
      }
      isLoading={query.isLoading}
      error={query.error}
      onRetry={query.refetch}
      footer={
        plan && (
          <div className="flex w-full flex-col gap-2">
            {canReview && awaitingDecision && (
              <>
                {/* Sits above the buttons because returning *requires* it — the
                    API rejects a return with no comment, and a teacher cannot act
                    on "sent back" alone. */}
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t('lessonPlan.commentPlaceholder')}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={review.isPending}
                    onClick={() =>
                      void review
                        .mutateAsync({
                          id: plan.id,
                          body: { decision: 'approved', comment: comment.trim() || undefined },
                        })
                        .then(close)
                        .catch(() => {})
                    }
                  >
                    <CheckCircle2 />
                    {t('lessonPlan.approve')}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={review.isPending || comment.trim().length === 0}
                    title={comment.trim() ? undefined : t('lessonPlan.commentRequired')}
                    onClick={() =>
                      void review
                        .mutateAsync({
                          id: plan.id,
                          body: { decision: 'returned', comment: comment.trim() },
                        })
                        .then(close)
                        .catch(() => {})
                    }
                  >
                    <Undo2 />
                    {t('lessonPlan.return')}
                  </Button>
                </div>
              </>
            )}

            {mode === 'own' && isEditable(plan.status) && (
              <Button
                disabled={!isSubmittable(plan) || submit.isPending}
                title={isSubmittable(plan) ? undefined : t('lessonPlan.needsActivity')}
                onClick={() => void submit.mutateAsync(plan.id).then(close).catch(() => {})}
              >
                <Send />
                {t('lessonPlan.submit')}
              </Button>
            )}
          </div>
        )
      }
    >
      {plan && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={plan.status} namespace="lessonPlanStatus" />
            {plan.isLate && <Badge variant="danger">{t('lessonPlan.late')}</Badge>}
            {plan.submittedAt && (
              <Badge variant="outline">
                {t('lessonPlan.submittedAt')}: {formatDateTime(plan.submittedAt)}
              </Badge>
            )}
          </div>

          <DetailSection title={t('common.details')}>
            <DetailRow label={t('teacher.title')}>{teacher?.teacherCode ?? '—'}</DetailRow>
            <DetailRow label={t('subject.title')}>{subject?.nameLo ?? '—'}</DetailRow>
            <DetailRow label={t('classroom.title')}>{classroom?.name ?? '—'}</DetailRow>
            <DetailRow label={t('lessonPlan.due')}>{formatDate(plan.dueDate)}</DetailRow>
            {plan.description && (
              <DetailRow label={t('common.description')}>{plan.description}</DetailRow>
            )}
          </DetailSection>

          <Separator />

          <ListSection
            title={`${t('lessonPlan.activities')} (${taughtCount(plan.activities)}/${plan.activities.length})`}
          >
            <ul className="space-y-2">
              {plan.activities.map((activity) => (
                <li
                  key={activity.id ?? `${activity.topic}-${activity.date}`}
                  className="rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{activity.topic}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.date)}
                        {activity.durationMinutes ? ` · ${activity.durationMinutes} ${t('lessonPlan.minutes')}` : ''}
                      </p>
                    </div>
                    {activity.isCompleted ? (
                      <Badge variant="success">{t('lessonPlan.taught')}</Badge>
                    ) : (
                      mode === 'own' &&
                      activity.id && (
                        // Marking a session taught is the one write allowed on an
                        // approved plan — the record of what happened is not the
                        // plan being changed.
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={markActivity.isPending}
                          onClick={() =>
                            void markActivity
                              .mutateAsync({
                                id: plan.id,
                                body: { activityId: activity.id!, isCompleted: true },
                              })
                              .catch(() => {})
                          }
                        >
                          {t('lessonPlan.markTaught')}
                        </Button>
                      )
                    )}
                  </div>
                  {activity.objectives && (
                    <p className="mt-2 text-xs text-muted-foreground">{activity.objectives}</p>
                  )}
                  {activity.reflection && (
                    <p className="mt-2 text-xs italic text-muted-foreground">
                      {activity.reflection}
                    </p>
                  )}
                </li>
              ))}
              {plan.activities.length === 0 && (
                <li className="text-sm text-muted-foreground">{t('lessonPlan.noActivities')}</li>
              )}
            </ul>
          </ListSection>

          <Separator />

          <ListSection title={t('lessonPlan.attachments')}>
            <ul className="space-y-1.5">
              {(attachments.data ?? []).map((file) => (
                <li key={file.filename} className="flex items-center gap-2 text-sm">
                  <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                  {file.url && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={file.url} target="_blank" rel="noreferrer">
                        <Download />
                        {t('common.download')}
                      </a>
                    </Button>
                  )}
                </li>
              ))}
              {(attachments.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">{t('lessonPlan.noAttachments')}</li>
              )}
            </ul>

            {mode === 'own' && isEditable(plan.status) && (
              <FileUpload
                className="mt-3"
                accept={ACCEPTED_DOCUMENTS}
                maxSizeBytes={MAX_DOCUMENT_BYTES}
                label={t('lessonPlan.uploadLabel')}
                disabled={uploadAttachment.isPending}
                onUpload={(file, onProgress) =>
                  uploadAttachment.mutateAsync({ id: plan.id, file, onProgress })
                }
                onUploaded={() => void attachments.refetch()}
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t('lessonPlan.uploadHint', { max: formatBytes(MAX_DOCUMENT_BYTES) })}
            </p>
          </ListSection>

          {plan.reviews.length > 0 && (
            <>
              <Separator />
              <ListSection title={t('lessonPlan.reviewHistory')}>
                <ul className="space-y-2">
                  {[...plan.reviews].reverse().map((entry, index) => (
                    <li
                      key={entry.id ?? `${entry.reviewedAt}-${index}`}
                      className="rounded-md border border-border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{entry.reviewerName}</span>
                        <StatusBadge status={entry.decision} namespace="lessonPlanStatus" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.reviewedAt)}
                      </p>
                      {entry.comment && <p className="mt-1.5">{entry.comment}</p>}
                    </li>
                  ))}
                </ul>
              </ListSection>
            </>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

/**
 * A titled section holding a list.
 *
 * `DetailSection` wraps its children in a `<dl>`, which is right for label/value
 * rows and wrong for the `<ul>`s below — so the heading is reproduced here rather
 * than nesting a list inside a definition list.
 */
function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
