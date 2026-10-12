import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Phone,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import { notify } from '@/lib/toast';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import {
  CONTACTING_ACTIONS,
  CONTACT_CHANNELS,
  REVIEW_ACTIONS,
  roomLabel,
  useAmendReview,
  useConfirmReview,
  useMyHomerooms,
  useReviewSheet,
  type AnomalyReason,
  type FlaggedStudent,
  type GuardianContactChannel,
  type HomeroomReviewAction,
  type StudentEvidence,
} from '../api';

/**
 * ຫ້ອງຂອງຂ້ອຍ — the homeroom teacher's twice-weekly look at their own class.
 *
 * One screen, because the whole point is that checking a class should not mean
 * opening four of them. The shortlist comes from the API — the roll call, the
 * register and the discipline ledger crossed against the school's thresholds —
 * and the teacher's part is one line per child: what they did about it.
 *
 * The confirm button is what the office reads. It is deliberately available even
 * when nothing is flagged: "I looked and the class is fine" is the answer most
 * weeks, and a screen that could only be confirmed when something was wrong would
 * record nothing on the good weeks and so prove nothing on the bad ones.
 */

/** What the teacher has typed, before it is sent. */
interface Line {
  action: HomeroomReviewAction;
  contactChannel: GuardianContactChannel | '';
  note: string;
}

const EMPTY_LINE: Line = { action: 'none', contactChannel: '', note: '' };

/** `absence:window` → the phrase the teacher reads. Each reason carries its count. */
function reasonLabel(reason: AnomalyReason, t: TFunction): string {
  return t(`homeroomReview.reason.${reason.kind}.${reason.scope}`, {
    value: reason.value,
    threshold: reason.threshold,
  });
}

export function ReviewSheet() {
  const { t } = useTranslation();
  const rooms = useMyHomerooms();
  const can = useCan();
  /**
   * The office reads every room, the teacher only their own.
   *
   * `/homeroom-reviews/mine` is scoped to the session and returns nothing at all
   * for an office account, which is correct — but it left the administrator and
   * the head of academic affairs unable to open any sheet from this screen, even
   * though the API has always let them read one. So an account holding `manage`
   * gets a picker over the whole school instead of an empty state.
   */
  const oversees = can('homeroom-reviews', 'manage');
  const activeYear = useActiveSchoolYear();
  const useSchoolClassrooms = (search: string) => useClassroomOptions(search, activeYear.data?.id);
  const everyRoom = useClassroomOptions('', activeYear.data?.id);

  /**
   * The room and the day live in the URL, as this app's table state does.
   *
   * It is what lets the reminder banner hand the teacher a *particular* missing
   * day — `?classroomId=…&dueDate=…` — rather than only reopening the page on
   * whatever day is current, which from this page is no visible change at all.
   */
  const [params, setParams] = useSearchParams();
  const roomId = params.get('classroomId') ?? undefined;
  const dueDate = params.get('dueDate') ?? undefined;

  const setParam = (key: 'classroomId' | 'dueDate', value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Changing the room drops the day with it: a day owed in one room is not
    // necessarily a day owed in another.
    if (key === 'classroomId') next.delete('dueDate');
    setParams(next, { replace: true });
  };

  // The teacher's first (usually only) room, once it is known. A homeroom teacher
  // with one class should never have to choose it; an office account has none of
  // its own and is left to pick.
  const firstRoomId = rooms.data?.[0]?.classroom.id;
  useEffect(() => {
    if (!roomId && firstRoomId) setParam('classroomId', firstRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstRoomId, roomId]);

  const sheet = useReviewSheet(roomId, dueDate);
  const confirm = useConfirmReview();
  const amend = useAmendReview();

  const [lines, setLines] = useState<Record<string, Line>>({});
  const [note, setNote] = useState('');
  /** Which children are showing their evidence. Collapsed keeps the sheet scannable. */
  const [opened, setOpened] = useState<Set<string>>(new Set());

  const review = sheet.data?.review ?? null;
  const reviewId = review?.id ?? null;

  // A review already on file is what the form opens on, so an amendment starts
  // from what was said rather than from blank selects.
  useEffect(() => {
    if (!sheet.data) return;
    const filed = sheet.data.review;
    setNote(filed?.note ?? '');
    setLines(
      Object.fromEntries(
        (filed?.students ?? []).map((student) => [
          student.studentId,
          {
            action: student.action,
            contactChannel: student.contactChannel ?? '',
            note: student.note ?? '',
          },
        ]),
      ),
    );
  }, [sheet.data, reviewId]);

  const lineFor = (studentId: string): Line => lines[studentId] ?? EMPTY_LINE;
  const setLine = (studentId: string, patch: Partial<Line>) =>
    setLines((current) => ({
      ...current,
      [studentId]: { ...(current[studentId] ?? EMPTY_LINE), ...patch },
    }));

  /** Only the children the teacher actually said something about are sent. */
  const payloadStudents = useMemo(
    () =>
      Object.entries(lines)
        .filter(([, line]) => line.action !== 'none' || line.note.trim().length > 0)
        .map(([studentId, line]) => ({
          studentId,
          action: line.action,
          ...(line.contactChannel ? { contactChannel: line.contactChannel } : {}),
          ...(line.note.trim() ? { note: line.note.trim() } : {}),
        })),
    [lines],
  );

  /** The one rule the form can enforce before the API does. */
  const missingChannel = payloadStudents.some(
    (student) => CONTACTING_ACTIONS.includes(student.action) && !student.contactChannel,
  );

  if (rooms.isLoading || (roomId && sheet.isLoading)) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (rooms.error) return <ErrorState error={rooms.error} onRetry={() => rooms.refetch()} />;

  // An office account is nobody's homeroom teacher; the API says so with an empty
  // list rather than handing over the school. Only an account that oversees
  // nothing either has no business on this tab.
  if ((rooms.data ?? []).length === 0 && !oversees) {
    return (
      <EmptyState
        icon={Eye}
        title={t('homeroomReview.noHomeroom')}
        description={t('homeroomReview.noHomeroomHint')}
      />
    );
  }

  // The office, before it has picked a room: the sheet is *of* a class, so there
  // is nothing to show until one is named.
  if (!roomId && oversees) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label htmlFor="review-any-room">{t('homeroomReview.chooseClassroom')}</Label>
          <div className="max-w-sm">
            <EntitySelect
              id="review-any-room"
              value={null}
              onChange={(value) => setParam('classroomId', value)}
              useOptions={useSchoolClassrooms}
              placeholder={t('homeroomReview.chooseClassroom')}
            />
          </div>
          <p className="text-sm text-muted-foreground">{t('homeroomReview.officeHint')}</p>
        </CardContent>
      </Card>
    );
  }
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={() => sheet.refetch()} />;
  if (!sheet.data) return null;

  const data = sheet.data;
  const submit = async () => {
    try {
      if (reviewId) {
        await amend.mutateAsync({
          id: reviewId,
          students: payloadStudents,
          note: note || undefined,
        });
        notify.success(t('homeroomReview.amended'));
      } else {
        await confirm.mutateAsync({
          classroomId: data.classroom.id,
          dueDate: data.reviewDay?.date,
          students: payloadStudents,
          note: note || undefined,
        });
        notify.success(t('homeroomReview.confirmed'));
      }
    } catch {
      // `api-client` surfaces the API's `messageKey`; nothing to add here.
    }
  };

  const pending = confirm.isPending || amend.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          {oversees ? (
            <div className="space-y-1">
              <Label htmlFor="review-room">{t('homeroomReview.classroom')}</Label>
              <div className="w-56">
                <EntitySelect
                  id="review-room"
                  value={roomId ?? null}
                  onChange={(value) => setParam('classroomId', value)}
                  useOptions={useSchoolClassrooms}
                  selectedLabel={
                    everyRoom.data?.find((option) => option.value === roomId)?.label ??
                    roomLabel(data.classroom)
                  }
                  placeholder={t('homeroomReview.chooseClassroom')}
                />
              </div>
            </div>
          ) : (
            (rooms.data ?? []).length > 1 && (
              <div className="space-y-1">
                <Label htmlFor="review-room">{t('homeroomReview.classroom')}</Label>
                <Select value={roomId} onValueChange={(value) => setParam('classroomId', value)}>
                  <SelectTrigger id="review-room" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(rooms.data ?? []).map((room) => (
                      <SelectItem key={room.classroom.id} value={room.classroom.id}>
                        {roomLabel(room.classroom)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {/* Every review day of the term, not only today's: the days the office
              counts as missing are exactly the ones a teacher has to be able to
              open, and each option says where it stands. */}
          <div className="space-y-1">
            <Label htmlFor="review-day">{t('homeroomReview.reviewDay')}</Label>
            {data.days.length > 0 ? (
              <Select
                value={data.reviewDay?.date}
                onValueChange={(value) => setParam('dueDate', value)}
              >
                <SelectTrigger id="review-day" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...data.days].reverse().map((day) => (
                    <SelectItem key={day.date} value={day.date}>
                      {formatDate(day.date)} · {t(`homeroomReview.statuses.${day.status}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="font-medium">{t('homeroomReview.noReviewDay')}</p>
            )}
          </div>

          {data.reviewDay && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{t('homeroomReview.window')}</p>
              <p className="font-medium">
                {formatDate(data.reviewDay.windowStart)} – {formatDate(data.reviewDay.windowEnd)}
              </p>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('homeroomReview.status')}</p>
            <StatusChip status={data.status} />
          </div>

          <div className="ms-auto text-end text-sm text-muted-foreground">
            <p>
              {t('homeroomReview.onRoll', { count: data.studentsOnRoll })} ·{' '}
              {t('homeroomReview.flaggedCount', { count: data.flagged.length })}
            </p>
            {data.reviewDay?.deadline && (
              <p className="flex items-center justify-end gap-1">
                <Clock className="size-3.5" />
                {t('homeroomReview.deadline', { at: formatDateTime(data.reviewDay.deadline) })}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Whose room this is. An office account filing here is keying in somebody
          else's review — the record keeps who typed it, and saying so on screen
          is what stops that being a surprise. */}
      {oversees && !(rooms.data ?? []).some((room) => room.classroom.id === data.classroom.id) && (
        <p className="text-sm text-muted-foreground">
          {t('homeroomReview.viewingAsOffice', {
            teacher: data.classroom.teacherName ?? t('homeroomReview.noTeacher'),
          })}
        </p>
      )}

      {data.previousReview && (
        <p className="text-sm text-muted-foreground">
          {t('homeroomReview.lastReview', {
            date: formatDate(data.previousReview.dueDate),
            count: data.previousReview.students.length,
          })}
        </p>
      )}

      {!data.reviewDay ? (
        <EmptyState
          icon={CalendarCheck}
          title={t('homeroomReview.noReviewDay')}
          description={t('homeroomReview.noReviewDayHint')}
        />
      ) : data.flagged.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t('homeroomReview.nothingFlagged')}
          description={t('homeroomReview.nothingFlaggedHint')}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('homeroomReview.roll')}</TableHead>
                  <TableHead>{t('homeroomReview.student')}</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-2">
                      {t('homeroomReview.why')}
                      {/* One click to see every child's rows — what a teacher does
                          before ringing round, and what the printed sheet shows. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs font-normal print:hidden"
                        onClick={() =>
                          setOpened((current) =>
                            current.size === data.flagged.length
                              ? new Set()
                              : new Set(data.flagged.map((student) => student.studentId)),
                          )
                        }
                      >
                        {opened.size === data.flagged.length
                          ? t('homeroomReview.collapseAll')
                          : t('homeroomReview.expandAll')}
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead className="w-44">{t('homeroomReview.action')}</TableHead>
                  <TableHead className="w-40">{t('homeroomReview.channel')}</TableHead>
                  <TableHead className="w-56">{t('homeroomReview.note')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.flagged.map((student) => (
                  <StudentRow
                    key={student.studentId}
                    student={student}
                    line={lineFor(student.studentId)}
                    open={opened.has(student.studentId)}
                    onToggle={() =>
                      setOpened((current) => {
                        const next = new Set(current);
                        if (next.has(student.studentId)) next.delete(student.studentId);
                        else next.add(student.studentId);
                        return next;
                      })
                    }
                    onChange={(patch) => setLine(student.studentId, patch)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="space-y-1">
            <Label htmlFor="review-note">{t('homeroomReview.classNote')}</Label>
            <Textarea
              id="review-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('homeroomReview.classNotePlaceholder')}
              rows={2}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={!data.reviewDay || pending || missingChannel}>
              <CheckCircle2 />
              {reviewId ? t('homeroomReview.saveAmendment') : t('homeroomReview.confirm')}
            </Button>

            {missingChannel && (
              <span className="flex items-center gap-1 text-sm text-danger">
                <AlertTriangle className="size-4" />
                {t('homeroomReview.channelRequired')}
              </span>
            )}

            {review && (
              <span className="text-sm text-muted-foreground">
                {t('homeroomReview.filedAt', { at: formatDateTime(review.reviewedAt) })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StudentRow({
  student,
  line,
  open,
  onToggle,
  onChange,
}: {
  student: FlaggedStudent;
  line: Line;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Line>) => void;
}) {
  const { t } = useTranslation();
  const contacts = CONTACTING_ACTIONS.includes(line.action);
  /** How each of this row's controls is named — the child, as the class knows them. */
  const label = student.studentNameLo ?? student.studentCode ?? student.studentId;

  const rows =
    student.evidence.attendance.length +
    student.evidence.behavior.length +
    student.evidence.conduct.length;

  return (
    <>
      <TableRow className={cn(student.severity === 'act' && 'bg-danger-subtle/40')}>
        <TableCell className="text-muted-foreground">{student.rollNumber ?? '—'}</TableCell>
        <TableCell>
          <div className="font-medium">{student.studentNameLo ?? student.studentCode}</div>
          <div className="text-xs text-muted-foreground">
            {student.studentCode}
            {student.studentNickname ? ` · ${student.studentNickname}` : ''}
          </div>
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap items-center gap-1">
            {student.reasons.map((reason) => (
              <Badge
                key={`${reason.kind}-${reason.scope}`}
                variant={reason.scope === 'term' ? 'danger' : 'secondary'}
              >
                {reasonLabel(reason, t)}
              </Badge>
            ))}
            {/* The badge says how many; this says which — the thing that used to
              mean leaving the page for the roll call and the register. */}
            {rows > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs font-normal print:hidden"
                aria-expanded={open}
                aria-label={`${t('homeroomReview.details')} — ${label}`}
                onClick={onToggle}
              >
                {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                {t('homeroomReview.details')}
              </Button>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Select
            value={line.action}
            onValueChange={(value) =>
              onChange({
                action: value as HomeroomReviewAction,
                // The API refuses a channel on an action that reached nobody, so it
                // is dropped here rather than sent and rejected.
                ...(CONTACTING_ACTIONS.includes(value as HomeroomReviewAction)
                  ? {}
                  : { contactChannel: '' as const }),
              })
            }
          >
            <SelectTrigger aria-label={`${t('homeroomReview.action')} — ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_ACTIONS.map((action) => (
                <SelectItem key={action} value={action}>
                  {t(`homeroomReview.actions.${action}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
        <TableCell>
          {contacts ? (
            <Select
              value={line.contactChannel || undefined}
              onValueChange={(value) =>
                onChange({ contactChannel: value as GuardianContactChannel })
              }
            >
              <SelectTrigger aria-label={`${t('homeroomReview.channel')} — ${label}`}>
                <SelectValue placeholder={t('homeroomReview.channelPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_CHANNELS.map((channel) => (
                  <SelectItem key={channel} value={channel}>
                    {t(`homeroomReview.channels.${channel}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          <Input
            value={line.note}
            onChange={(event) => onChange({ note: event.target.value })}
            placeholder={t('homeroomReview.notePlaceholder')}
            aria-label={`${t('homeroomReview.note')} — ${label}`}
          />
        </TableCell>
      </TableRow>

      {/* Always rendered on paper: a sheet printed for a guardian meeting is
        useless if the evidence is behind a click. */}
      {rows > 0 && (
        <TableRow className={cn('bg-muted/40', !open && 'hidden print:table-row')}>
          <TableCell colSpan={6} className="py-3">
            <StudentEvidencePanel evidence={student.evidence} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * The rows behind one child's flags.
 *
 * Three short lists rather than three tables: this is read standing up, with a
 * phone in the other hand. Anything since the last review is marked, because
 * "this happened again this week" is what changes the conversation.
 */
function StudentEvidencePanel({ evidence }: { evidence: StudentEvidence }) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('homeroomReview.evidenceAttendance')}
        </h4>
        {evidence.attendance.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('homeroomReview.evidenceNone')}</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {evidence.attendance.map((row, index) => (
              <li key={`${row.date}-${row.period}-${index}`}>
                <div className="flex flex-wrap gap-x-2">
                  <span className={cn('tabular-nums', row.inWindow && 'font-semibold')}>
                    {formatDate(row.date)}
                  </span>
                  <span>
                    {t(`attendanceStatus.${row.status}`)}
                    {row.minutesLate
                      ? ` ${t('homeroomReview.minutesLate', { count: row.minutesLate })}`
                      : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {row.subjectNameLo ?? ''}
                    {row.period ? ` · ${t('homeroomReview.period', { number: row.period })}` : ''}
                  </span>
                </div>
                {/* ເຫດຜົນ, as the teacher wrote it when marking the roll. An
                    absence with a reason on file is a different phone call from
                    one without, so it is shown rather than summarized away. */}
                {row.reason && (
                  <div className="text-muted-foreground">
                    {t('homeroomReview.evidenceReason', { reason: row.reason })}
                  </div>
                )}
              </li>
            ))}
            {evidence.more.attendance > 0 && (
              <li className="text-xs text-muted-foreground">
                {t('homeroomReview.andMore', { count: evidence.more.attendance })}
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('homeroomReview.evidenceBehavior')}
        </h4>
        {evidence.behavior.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('homeroomReview.evidenceNone')}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {evidence.behavior.map((row, index) => (
              <li key={`${row.date}-${index}`}>
                <span className={cn('tabular-nums', row.inWindow && 'font-semibold')}>
                  {formatDate(row.date)}
                </span>{' '}
                <span className="text-muted-foreground">
                  {[row.subjectNameLo, row.teacherName].filter(Boolean).join(' · ')}
                </span>
                {row.behavior && <div>{row.behavior}</div>}
                {row.action && (
                  <div className="text-muted-foreground">
                    {t('homeroomReview.evidenceAction', { action: row.action })}
                  </div>
                )}
              </li>
            ))}
            {evidence.more.behavior > 0 && (
              <li className="text-xs text-muted-foreground">
                {t('homeroomReview.andMore', { count: evidence.more.behavior })}
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('homeroomReview.evidenceConduct')}
        </h4>
        {evidence.conduct.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('homeroomReview.evidenceNone')}</p>
        ) : (
          <ul className="space-y-0.5 text-sm">
            {evidence.conduct.map((row, index) => (
              <li key={`${row.date}-${index}`} className="flex flex-wrap gap-x-2">
                <span className="tabular-nums">{formatDate(row.date)}</span>
                <span>
                  {row.ruleCode} {row.ruleNameLo}
                </span>
                <span className="font-medium text-danger">−{row.points}</span>
                {row.note && <span className="text-muted-foreground">{row.note}</span>}
              </li>
            ))}
            {evidence.more.conduct > 0 && (
              <li className="text-xs text-muted-foreground">
                {t('homeroomReview.andMore', { count: evidence.more.conduct })}
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

/** The four states, worded as the teacher and the office both read them. */
export function StatusChip({ status }: { status: 'confirmed' | 'late' | 'missing' | 'pending' }) {
  const { t } = useTranslation();
  // The four tones read the same way `StatusBadge` does — success, warning,
  // danger, and an outline for a day nothing is owed on yet.
  const variant =
    status === 'confirmed'
      ? 'success'
      : status === 'late'
        ? 'warning'
        : status === 'missing'
          ? 'danger'
          : 'outline';
  const Icon =
    status === 'confirmed'
      ? CheckCircle2
      : status === 'late'
        ? Clock
        : status === 'missing'
          ? AlertTriangle
          : Phone;

  return (
    <Badge variant={variant}>
      <Icon className="size-3.5" />
      {t(`homeroomReview.statuses.${status}`)}
    </Badge>
  );
}
