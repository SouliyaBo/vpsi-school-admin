import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate, formatDateTime } from '@/lib/utils';
import { notify } from '@/lib/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  useSaveMonthlyReport,
  type MonthlyReport,
  type MonthlyReportStatus,
  type MonthlyReportSubmission,
} from '../api';

interface ExtraClassRow {
  studentId: string;
  subject: string;
  teacherName: string;
}

interface ActivityRow {
  studentId: string;
  date: string;
  detail: string;
}

/** The four tones the review grid uses, so a late report reads the same as a late review. */
export function ReportStatusChip({ status }: { status: MonthlyReportStatus }) {
  const { t } = useTranslation();
  const variant =
    status === 'submitted'
      ? 'success'
      : status === 'late'
        ? 'warning'
        : status === 'missing'
          ? 'danger'
          : 'outline';
  const Icon =
    status === 'submitted'
      ? CheckCircle2
      : status === 'late'
        ? Clock
        : status === 'missing'
          ? AlertTriangle
          : Hourglass;
  return (
    <Badge variant={variant}>
      <Icon className="size-3.5" />
      {t(`homeroomReview.report.statuses.${status}`)}
    </Badge>
  );
}

/** Where the report stands against the 5th — shown above the form. */
export function SubmissionBar({ submission }: { submission: MonthlyReportSubmission }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <ReportStatusChip status={submission.status} />
      <span>
        <span className="text-muted-foreground">{t('homeroomReview.report.dueBy')} </span>
        <span className="font-medium">{formatDate(submission.dueDate)}</span>
      </span>
      {submission.firstSubmittedAt && (
        <span>
          <span className="text-muted-foreground">{t('homeroomReview.report.sentAt')} </span>
          <span className="font-medium">{formatDateTime(submission.firstSubmittedAt)}</span>
        </span>
      )}
      {submission.daysLate > 0 && (
        <span className="font-medium text-warning">
          {t('homeroomReview.report.daysLate', { n: submission.daysLate })}
        </span>
      )}
      {submission.lastSubmittedAt && submission.lastSubmittedAt !== submission.firstSubmittedAt && (
        <span className="text-muted-foreground">
          {t('homeroomReview.report.resentAt', {
            at: formatDateTime(submission.lastSubmittedAt),
          })}
        </span>
      )}
    </div>
  );
}

/**
 * The four sections nobody else records — ສະພາບລວມ, ນັກຮຽນທີ່ຮຽນເພີ່ມ,
 * ການເຄື່ອນໄຫວພາຍນອກ and ຂໍ້ສະເໜີ — and the two buttons: keep a draft, or send.
 *
 * Held in local state and sent whole; the parent remounts this per room and
 * month (`key`), so switching month never carries one month's text into another.
 */
export function ReportEntryForm({ data }: { data: MonthlyReport }) {
  const { t } = useTranslation();
  const save = useSaveMonthlyReport();
  const [overview, setOverview] = useState(data.entry.overview ?? '');
  const [suggestions, setSuggestions] = useState(data.entry.suggestions ?? '');
  const [extraClasses, setExtraClasses] = useState<ExtraClassRow[]>(
    data.entry.extraClasses.map((row) => ({
      studentId: row.studentId,
      subject: row.subject,
      teacherName: row.teacherName ?? '',
    })),
  );
  const [activities, setActivities] = useState<ActivityRow[]>(
    data.entry.outsideActivities.map((row) => ({
      studentId: row.studentId,
      date: row.date ?? '',
      detail: row.detail,
    })),
  );

  const submission = data.submission;

  const send = async (submit: boolean) => {
    // A row with nothing in it is a row the teacher added and did not use; one
    // with text but no child cannot be filed against anybody.
    const usedClasses = extraClasses.filter((row) => row.studentId || row.subject.trim());
    const usedActivities = activities.filter((row) => row.studentId || row.detail.trim());
    if (
      usedClasses.some((row) => !row.studentId || !row.subject.trim()) ||
      usedActivities.some((row) => !row.studentId || !row.detail.trim())
    ) {
      notify.warning(t('homeroomReview.report.incompleteRow'));
      return;
    }
    try {
      await save.mutateAsync({
        submit,
        classroomId: data.classroom.id,
        month: data.month,
        semesterId: data.semester.id,
        overview: overview.trim() || undefined,
        suggestions: suggestions.trim() || undefined,
        extraClasses: usedClasses.map((row) => ({
          studentId: row.studentId,
          subject: row.subject.trim(),
          ...(row.teacherName.trim() ? { teacherName: row.teacherName.trim() } : {}),
        })),
        outsideActivities: usedActivities.map((row) => ({
          studentId: row.studentId,
          detail: row.detail.trim(),
          ...(row.date ? { date: row.date } : {}),
        })),
      });
      notify.success(t(submit ? 'homeroomReview.report.submitted' : 'homeroomReview.report.saved'));
    } catch {
      // `api-client` surfaces the API's `messageKey`.
    }
  };

  const studentPicker = (value: string, onChange: (value: string) => void, id: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-w-48" aria-label={t('homeroomReview.report.name')}>
        <SelectValue placeholder={t('homeroomReview.report.pickStudent')} />
      </SelectTrigger>
      <SelectContent>
        {data.roster.map((student) => (
          <SelectItem key={student.studentId} value={student.studentId}>
            {student.studentNameLo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle>{t('homeroomReview.report.teacherSections')}</CardTitle>
        <SubmissionBar submission={submission} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="report-overview">{t('homeroomReview.report.overview')}</Label>
          <Textarea
            id="report-overview"
            rows={3}
            value={overview}
            onChange={(event) => setOverview(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('homeroomReview.report.extraClasses')}</p>
          {extraClasses.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              {studentPicker(
                row.studentId,
                (value) =>
                  setExtraClasses((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, studentId: value } : r)),
                  ),
                `extra-student-${index}`,
              )}
              <Input
                className="w-48"
                aria-label={t('homeroomReview.report.subject')}
                placeholder={t('homeroomReview.report.subject')}
                value={row.subject}
                onChange={(event) =>
                  setExtraClasses((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, subject: event.target.value } : r)),
                  )
                }
              />
              <Input
                className="w-48"
                aria-label={t('homeroomReview.report.tutor')}
                placeholder={t('homeroomReview.report.tutor')}
                value={row.teacherName}
                onChange={(event) =>
                  setExtraClasses((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, teacherName: event.target.value } : r,
                    ),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => setExtraClasses((rows) => rows.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setExtraClasses((rows) => [...rows, { studentId: '', subject: '', teacherName: '' }])
            }
          >
            <Plus />
            {t('homeroomReview.report.addRow')}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('homeroomReview.report.activities')}</p>
          {activities.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              {studentPicker(
                row.studentId,
                (value) =>
                  setActivities((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, studentId: value } : r)),
                  ),
                `activity-student-${index}`,
              )}
              <Input
                type="date"
                className="w-40"
                aria-label={t('homeroomReview.report.date')}
                value={row.date}
                onChange={(event) =>
                  setActivities((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, date: event.target.value } : r)),
                  )
                }
              />
              <Input
                className="min-w-64 flex-1"
                aria-label={t('homeroomReview.report.detail')}
                placeholder={t('homeroomReview.report.detail')}
                value={row.detail}
                onChange={(event) =>
                  setActivities((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, detail: event.target.value } : r)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => setActivities((rows) => rows.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setActivities((rows) => [...rows, { studentId: '', date: '', detail: '' }])
            }
          >
            <Plus />
            {t('homeroomReview.report.addRow')}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="report-suggestions">{t('homeroomReview.report.suggestions')}</Label>
          <Textarea
            id="report-suggestions"
            rows={3}
            value={suggestions}
            onChange={(event) => setSuggestions(event.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {!submission.canSubmit && (
            <p className="me-auto text-sm text-muted-foreground">
              {t('homeroomReview.report.opensOn', { date: formatDate(submission.opensAt) })}
            </p>
          )}
          <Button variant="outline" disabled={save.isPending} onClick={() => send(false)}>
            <Save />
            {t('homeroomReview.report.saveDraft')}
          </Button>
          <Button disabled={save.isPending || !submission.canSubmit} onClick={() => send(true)}>
            <Send />
            {submission.firstSubmittedAt
              ? t('homeroomReview.report.resend')
              : t('homeroomReview.report.submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
