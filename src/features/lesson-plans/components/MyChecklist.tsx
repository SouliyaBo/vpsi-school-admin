import { ClipboardList, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/hooks';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { FileUpload } from '@/components/common/FileUpload';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect } from '@/components/common/TableToolbar';
import {
  useLessonPlanMonths,
  useMonthChecklist,
  useUploadChecklistFile,
  type ChecklistTask,
} from '../api';
import { ACCEPTED_DOCUMENTS, MAX_DOCUMENT_BYTES } from './AttachmentPicker';
import { ChecklistSummary } from './ChecklistSummary';

/**
 * A teacher's own lines on the published checklist.
 *
 * One action per line — upload the document — because that is the whole of what
 * is asked for here. The plan record, its title and its submission are the API's
 * job on this path, so the teacher never sees a form: they see the week they owe
 * and a place to put the file.
 */
export function MyChecklist() {
  const { t, i18n } = useTranslation();
  const me = useCurrentUser();

  const months = useLessonPlanMonths();
  const [monthId, setMonthId] = useState<string | undefined>();

  // The newest published month, until the teacher picks another.
  useEffect(() => {
    if (!monthId && months.data?.length) setMonthId(months.data[0].id);
  }, [months.data, monthId]);

  const checklist = useMonthChecklist(monthId);
  const [uploadTarget, setUploadTarget] = useState<ChecklistTask | null>(null);
  const uploadFile = useUploadChecklistFile();

  if (me?.personType !== 'teacher') {
    return (
      <EmptyState title={t('lessonPlan.notATeacher')} description={t('lessonPlan.notATeacherHint')} />
    );
  }

  if (!months.isLoading && (months.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title={t('lessonPlan.noPublishedMonth')}
        description={t('lessonPlan.noPublishedMonthHint')}
      />
    );
  }

  const tasks = checklist.data?.tasks ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('lessonPlan.myChecklist')}
        description={t('lessonPlan.myChecklistHint')}
        actions={
          <FilterSelect
            value={monthId}
            onChange={(value) => setMonthId(value)}
            options={(months.data ?? []).map((month) => ({
              value: month.id,
              label: `${month.month}/${month.year}`,
            }))}
            placeholder={t('lessonPlan.month')}
          />
        }
      />

      {checklist.data?.month.note && (
        <Card>
          <CardContent className="pt-6 text-sm">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              {t('lessonPlan.monthNote')}
            </p>
            {checklist.data.month.note}
          </CardContent>
        </Card>
      )}

      <ChecklistSummary
        summary={
          checklist.data?.summary ?? {
            total: 0,
            submitted: 0,
            approved: 0,
            outstanding: 0,
            overdue: 0,
            withFiles: 0,
          }
        }
      />

      <div className="space-y-2">
        {tasks.map((task) => (
          <Card key={task.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="min-w-0">
                <p className="font-medium">
                  {t('lessonPlan.weekNumber', { index: task.weekIndex })}
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    {formatDate(task.weekStartDate)} – {formatDate(task.weekEndDate)}
                  </span>
                </p>
                <p className="text-sm">
                  {i18n.language === 'en' && task.subjectNameEn
                    ? task.subjectNameEn
                    : task.subjectNameLo}
                  <span className="text-muted-foreground"> · {task.classroomName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('lessonPlan.due')}: {formatDateTime(task.dueDate)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {task.status === 'missing' ? (
                  <Badge variant={task.isOverdue ? 'danger' : 'secondary'}>
                    {task.isOverdue ? t('lessonPlan.overdue') : t('lessonPlanStatus.missing')}
                  </Badge>
                ) : (
                  <StatusBadge status={task.status} namespace="lessonPlanStatus" />
                )}
                {task.isLate && <Badge variant="warning">{t('lessonPlan.late')}</Badge>}
                {task.attachmentCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {task.attachmentCount} {t('lessonPlan.files')}
                  </span>
                )}
                {/* An approved plan is the agreed record — the API refuses to
                    reopen it, so no upload is offered. */}
                {task.status !== 'approved' && (
                  <Button size="sm" variant="outline" onClick={() => setUploadTarget(task)}>
                    <Upload />
                    {task.attachmentCount > 0
                      ? t('lessonPlan.uploadAnother')
                      : t('lessonPlan.uploadPlan')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {tasks.length === 0 && !checklist.isLoading && (
          <EmptyState
            icon={ClipboardList}
            title={t('lessonPlan.noLinesForYou')}
            description={t('lessonPlan.noLinesForYouHint')}
          />
        )}
      </div>

      <Dialog
        open={uploadTarget !== null}
        onOpenChange={(open) => !open && setUploadTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('lessonPlan.uploadPlan')}</DialogTitle>
            <DialogDescription>
              {uploadTarget
                ? t('lessonPlan.uploadForWeek', {
                    index: uploadTarget.weekIndex,
                    subject:
                      i18n.language === 'en' && uploadTarget.subjectNameEn
                        ? uploadTarget.subjectNameEn
                        : uploadTarget.subjectNameLo,
                    classroom: uploadTarget.classroomName,
                  })
                : undefined}
            </DialogDescription>
          </DialogHeader>

          <FileUpload
            accept={ACCEPTED_DOCUMENTS}
            maxSizeBytes={MAX_DOCUMENT_BYTES}
            label={t('lessonPlan.uploadLabel')}
            disabled={uploadFile.isPending}
            onUpload={(file, onProgress) =>
              uploadFile.mutateAsync({ taskId: uploadTarget!.id, file, onProgress })
            }
            // Handing in submits the plan, so the row behind the dialog has
            // changed by the time it closes.
            onUploaded={() => setUploadTarget(null)}
          />
          <p className="text-xs text-muted-foreground">{t('lessonPlan.uploadSubmitsHint')}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
