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
import { useRef, useState } from 'react';
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
import { EntitySelect } from '@/components/common/EntitySelect';
import { useSubjectOptions } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import {
  useSaveMonthlyReport,
  type MonthlyReport,
  type MonthlyReportStatus,
  type MonthlyReportSubmission,
} from '../api';

/**
 * A picked subject and teacher, by id. `subject`/`teacherName` hold the stored
 * name: for a picked row it labels the picker before its options load; for a
 * row typed before the pickers existed it is the only value, and is sent back
 * as typed until the teacher picks something in its place.
 */
interface ExtraClassRow {
  studentId: string;
  subjectId: string;
  subject: string;
  teacherId: string;
  teacherName: string;
}

interface ContactRow {
  studentId: string;
  date: string;
  content: string;
}

/** The contact picker's "every guardian in the room" choice. */
const ALL_STUDENTS = '__all__';

/** Stands in the picker for a typed name that has no id behind it. */
const TYPED = '__typed__';

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
 * The sections nobody else records — ສະພາບລວມ, ນັກຮຽນທີ່ຮຽນເພີ່ມ,
 * ການເຄື່ອນໄຫວພາຍນອກ, guardian contacts made outside a review, and ຂໍ້ສະເໜີ —
 * and the two buttons: keep a draft, or send.
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
      subjectId: row.subjectId ?? '',
      subject: row.subject,
      teacherId: row.teacherId ?? '',
      teacherName: row.teacherName ?? '',
    })),
  );
  const [contacts, setContacts] = useState<ContactRow[]>(
    (data.entry.guardianContacts ?? []).map((row) => ({
      studentId: row.allStudents ? ALL_STUDENTS : (row.studentId ?? ''),
      date: row.date,
      content: row.content,
    })),
  );

  // The pickers hand back only an id; remember every label they have shown so a
  // pick still reads by name once the search that found it is cleared.
  const labels = useRef(new Map<string, string>());
  const remember = <T extends { data?: { value: string; label: string }[] }>(result: T) => {
    result.data?.forEach((option) => labels.current.set(option.value, option.label));
    return result;
  };
  const gradeLevelId = data.classroom.gradeLevelId ?? undefined;
  const useGradeSubjects = (search: string) => remember(useSubjectOptions(search, gradeLevelId));
  const useStaff = (search: string) => remember(useTeacherOptions(search));
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
    const hasSubject = (row: ExtraClassRow) => Boolean(row.subjectId || row.subject.trim());
    const usedClasses = extraClasses.filter(
      (row) => row.studentId || hasSubject(row) || row.teacherId || row.teacherName.trim(),
    );
    const usedActivities = activities.filter((row) => row.studentId || row.detail.trim());
    const usedContacts = contacts.filter((row) => row.studentId || row.date || row.content.trim());
    if (
      usedClasses.some((row) => !row.studentId || !hasSubject(row)) ||
      usedActivities.some((row) => !row.studentId || !row.detail.trim()) ||
      usedContacts.some((row) => !row.studentId || !row.date || !row.content.trim())
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
          ...(row.subjectId ? { subjectId: row.subjectId } : { subject: row.subject.trim() }),
          ...(row.teacherId
            ? { teacherId: row.teacherId }
            : row.teacherName.trim()
              ? { teacherName: row.teacherName.trim() }
              : {}),
        })),
        outsideActivities: usedActivities.map((row) => ({
          studentId: row.studentId,
          detail: row.detail.trim(),
          ...(row.date ? { date: row.date } : {}),
        })),
        guardianContacts: usedContacts.map((row) => ({
          ...(row.studentId === ALL_STUDENTS
            ? { allStudents: true }
            : { studentId: row.studentId }),
          date: row.date,
          content: row.content.trim(),
        })),
      });
      notify.success(t(submit ? 'homeroomReview.report.submitted' : 'homeroomReview.report.saved'));
    } catch {
      // `api-client` surfaces the API's `messageKey`.
    }
  };

  /** `withAll` offers the whole class first — a notice that went to every guardian. */
  const studentPicker = (
    value: string,
    onChange: (value: string) => void,
    id: string,
    withAll = false,
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="min-w-48" aria-label={t('homeroomReview.report.name')}>
        <SelectValue placeholder={t('homeroomReview.report.pickStudent')} />
      </SelectTrigger>
      <SelectContent>
        {withAll && (
          <SelectItem value={ALL_STUDENTS}>{t('homeroomReview.report.allStudents')}</SelectItem>
        )}
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
              <EntitySelect
                className="w-64"
                label={t('homeroomReview.report.subject')}
                placeholder={t('homeroomReview.report.subject')}
                useOptions={useGradeSubjects}
                value={row.subjectId || (row.subject ? TYPED : null)}
                selectedLabel={
                  (row.subjectId && labels.current.get(row.subjectId)) || row.subject || null
                }
                onChange={(value) =>
                  setExtraClasses((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, subjectId: value ?? '', subject: '' } : r,
                    ),
                  )
                }
              />
              <EntitySelect
                className="w-64"
                label={t('homeroomReview.report.tutor')}
                placeholder={t('homeroomReview.report.tutor')}
                useOptions={useStaff}
                value={row.teacherId || (row.teacherName ? TYPED : null)}
                selectedLabel={
                  (row.teacherId && labels.current.get(row.teacherId)) || row.teacherName || null
                }
                onChange={(value) =>
                  setExtraClasses((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, teacherId: value ?? '', teacherName: '' } : r,
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
              setExtraClasses((rows) => [
                ...rows,
                { studentId: '', subjectId: '', subject: '', teacherId: '', teacherName: '' },
              ])
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
          <p className="text-sm font-medium">{t('homeroomReview.report.contacts')}</p>
          <p className="text-sm text-muted-foreground">{t('homeroomReview.report.contactsHint')}</p>
          {contacts.map((row, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              {studentPicker(
                row.studentId,
                (value) =>
                  setContacts((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, studentId: value } : r)),
                  ),
                `contact-student-${index}`,
                true,
              )}
              <Input
                type="date"
                className="w-40"
                aria-label={t('homeroomReview.report.contactDate')}
                value={row.date}
                onChange={(event) =>
                  setContacts((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, date: event.target.value } : r)),
                  )
                }
              />
              <Input
                className="min-w-64 flex-1"
                aria-label={t('homeroomReview.report.content')}
                placeholder={t('homeroomReview.report.content')}
                value={row.content}
                onChange={(event) =>
                  setContacts((rows) =>
                    rows.map((r, i) => (i === index ? { ...r, content: event.target.value } : r)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('common.delete')}
                onClick={() => setContacts((rows) => rows.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setContacts((rows) => [...rows, { studentId: '', date: '', content: '' }])
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
