import { CalendarPlus, ClipboardList, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSemester } from '@/features/semesters/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableToolbar } from '@/components/common/TableToolbar';
import {
  useDraftMonth,
  useLessonPlanMonths,
  useMonthChecklist,
  usePublishMonth,
  useRemoveChecklistTasks,
  useSetMonthNote,
  type ChecklistTask,
} from '../api';
import { ChecklistSummary } from './ChecklistSummary';
import { MonthPicker } from './MonthPicker';

/**
 * The academic office's monthly checklist.
 *
 * Three actions in order, which is also the order the office works in: draft the
 * month from the timetable, drop the weeks that are not owed (exams, holidays, a
 * teacher on leave), then publish — after which the teachers can see it and the
 * count means something. Publishing is one-way, so the trimming happens first.
 */
export function MonthlyChecklist() {
  const { t, i18n } = useTranslation();
  const activeSemester = useActiveSemester();

  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  /** Lines ticked for removal — only ever ones nothing has been handed in for. */
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const months = useLessonPlanMonths({ semesterId: activeSemester.data?.id });
  const draft = useDraftMonth();
  const publish = usePublishMonth();
  const removeTasks = useRemoveChecklistTasks();
  const setMonthNote = useSetMonthNote();

  const month = months.data?.find(
    (entry) => entry.year === period.year && entry.month === period.month,
  );
  const checklist = useMonthChecklist(month?.id);

  /** The years the running term spans — a term crossing new year has two. */
  const years = useMemo(() => {
    const semester = activeSemester.data;
    if (!semester) return [period.year];
    const from = new Date(semester.startDate).getFullYear();
    const to = new Date(semester.endDate).getFullYear();
    return from === to ? [from] : [from, to];
  }, [activeSemester.data, period.year]);

  const tasks = checklist.data?.tasks ?? [];
  const isDraft = month?.status === 'draft';
  const removable = tasks.filter((task) => task.status === 'missing');

  function toggle(task: ChecklistTask) {
    setSelected((previous) =>
      previous.includes(task.id)
        ? previous.filter((id) => id !== task.id)
        : [...previous, task.id],
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('lessonPlan.checklistTitle')}
        description={t('lessonPlan.checklistHint')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker
              year={period.year}
              month={period.month}
              years={years}
              onChange={(next) => {
                setPeriod(next);
                setSelected([]);
                setNote(null);
              }}
            />
            {month ? (
              <>
                <Badge variant={isDraft ? 'secondary' : 'success'}>
                  {isDraft ? t('lessonPlan.monthDraft') : t('lessonPlan.monthPublished')}
                </Badge>
                {isDraft && (
                  <>
                    <Button
                      variant="outline"
                      disabled={draft.isPending}
                      onClick={() => void draft.mutateAsync(period).catch(() => {})}
                    >
                      <CalendarPlus />
                      {t('lessonPlan.refreshDraft')}
                    </Button>
                    <Button disabled={publish.isPending} onClick={() => setConfirmPublish(true)}>
                      <Send />
                      {t('lessonPlan.publish')}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <Button
                disabled={draft.isPending}
                onClick={() => void draft.mutateAsync(period).catch(() => {})}
              >
                <CalendarPlus />
                {t('lessonPlan.createDraft')}
              </Button>
            )}
          </div>
        }
      />

      {!month ? (
        <EmptyState
          icon={ClipboardList}
          title={t('lessonPlan.noMonthYet')}
          description={t('lessonPlan.noMonthYetHint')}
        />
      ) : (
        <>
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
            <p className="text-sm font-medium">{t('lessonPlan.monthNote')}</p>
            <Textarea
              value={note ?? month.note ?? ''}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('lessonPlan.monthNotePlaceholder')}
              rows={2}
            />
            {note !== null && note !== (month.note ?? '') && (
              <Button
                size="sm"
                variant="outline"
                disabled={setMonthNote.isPending}
                onClick={() =>
                  void setMonthNote
                    .mutateAsync({ id: month.id, note })
                    .then(() => setNote(null))
                    .catch(() => {})
                }
              >
                {t('common.save')}
              </Button>
            )}
          </div>

          <TableToolbar
            hasActiveFilters={selected.length > 0}
            onClearFilters={() => setSelected([])}
          >
            <Button
              variant="outline"
              size="sm"
              // Only lines nothing has been handed in against: dropping an answered
              // one would hide a plan a reviewer may already have approved, which
              // the API refuses anyway.
              disabled={selected.length === 0 || removeTasks.isPending}
              onClick={() =>
                void removeTasks
                  .mutateAsync({ id: month.id, taskIds: selected })
                  .then(() => setSelected([]))
                  .catch(() => {})
              }
            >
              <Trash2 />
              {t('lessonPlan.removeLines', { count: selected.length })}
            </Button>
            <span className="text-xs text-muted-foreground">
              {t('lessonPlan.removableHint', { count: removable.length })}
            </span>
          </TableToolbar>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-start">
                <tr>
                  <th className="w-10 p-2" />
                  <th className="p-2 text-start font-medium">{t('teacher.title')}</th>
                  <th className="p-2 text-start font-medium">{t('lessonPlan.lesson')}</th>
                  <th className="p-2 text-start font-medium">{t('lessonPlan.week')}</th>
                  <th className="p-2 text-start font-medium">{t('lessonPlan.due')}</th>
                  <th className="p-2 text-start font-medium">{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t border-border">
                    <td className="p-2">
                      <Checkbox
                        checked={selected.includes(task.id)}
                        disabled={task.status !== 'missing'}
                        onCheckedChange={() => toggle(task)}
                        aria-label={t('lessonPlan.removeLine')}
                      />
                    </td>
                    <td className="p-2">
                      <span className="font-medium">{task.teacherName}</span>
                      <span className="ms-1 text-xs text-muted-foreground">{task.teacherCode}</span>
                    </td>
                    <td className="p-2">
                      {i18n.language === 'en' && task.subjectNameEn
                        ? task.subjectNameEn
                        : task.subjectNameLo}
                      <span className="text-muted-foreground"> · {task.classroomName}</span>
                    </td>
                    <td className="whitespace-nowrap p-2">
                      {t('lessonPlan.weekNumber', { index: task.weekIndex })}
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(task.weekStartDate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-2 text-xs">
                      {formatDateTime(task.dueDate)}
                    </td>
                    <td className="p-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {task.status === 'missing' ? (
                          <Badge variant={task.isOverdue ? 'danger' : 'secondary'}>
                            {task.isOverdue
                              ? t('lessonPlan.overdue')
                              : t('lessonPlanStatus.missing')}
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
                      </span>
                    </td>
                  </tr>
                ))}
                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      {t('common.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t('lessonPlan.publish')}
        description={t('lessonPlan.publishConfirm', { count: tasks.length })}
        tone="default"
        isPending={publish.isPending}
        onConfirm={() => {
          if (!month) return;
          void publish.mutateAsync(month.id).finally(() => setConfirmPublish(false));
        }}
      />
    </div>
  );
}
