import { BarChart3, ClipboardList, Save, Send, Trash2 } from 'lucide-react';
import { notify } from '@/lib/toast';
import { useMonthName } from '@/features/monthly-marks/components/SheetPickers';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { cn, refId, refObject } from '@/lib/utils';
import type { Classroom, ExamPaper } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { ScanPanel } from './ScanPanel';
import {
  answersToString,
  OPTION_LETTERS,
  parseAnswerString,
  useDeleteResponse,
  usePushToMonthlyMarks,
  useResponses,
  useSaveResponse,
  useUpdateExamPaper,
  type ResponsesView,
} from '../api';

/**
 * ຜົນສອບ — the sheets keyed in, and what the class made of the paper.
 *
 * One line per pupil: the set they sat and their answers as a run of letters,
 * because that is how a teacher reads a bubble sheet aloud — "B C D A" —
 * and typing it is faster than forty dropdowns. The mark appears as they
 * type, from the key of that set; saving is what writes it down.
 */

interface Props {
  paper: ExamPaper;
  readOnly?: boolean;
}

export function ResultsPanel({ paper, readOnly = false }: Props) {
  const { t } = useTranslation();
  const update = useUpdateExamPaper();
  const [classroomId, setClassroomId] = useState<string | undefined>(
    refId(paper.classroomId) ?? undefined,
  );
  const [pointsInput, setPointsInput] = useState(
    paper.totalPoints === null || paper.totalPoints === undefined ? '' : String(paper.totalPoints),
  );
  const responses = useResponses(paper.id, classroomId);
  const useAnyClassroomOptions = (search: string) => useClassroomOptions(search);
  const hasSets = paper.variants.length > 0;

  function savePoints() {
    const value = pointsInput.trim() === '' ? null : Number(pointsInput);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    update.mutate({ id: paper.id, body: { totalPoints: value } });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('examPaper.totalPoints')}</CardTitle>
            <CardDescription>{t('examPaper.totalPointsHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="total-points">{t('examPaper.totalPoints')}</Label>
              <Input
                id="total-points"
                type="number"
                min={0}
                step="0.5"
                className="w-32"
                value={pointsInput}
                disabled={readOnly}
                onChange={(event) => setPointsInput(event.target.value)}
              />
            </div>
            {!readOnly && (
              <Button type="button" disabled={update.isPending} onClick={savePoints}>
                <Save />
                {t('examPaper.savePoints')}
              </Button>
            )}
            {(paper.totalPoints === null || paper.totalPoints === undefined) && (
              <p className="basis-full text-xs text-amber-700 dark:text-amber-300">
                {t('examPaper.totalPointsMissing')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4" />
              {t('examPaper.summaryTitle')}
            </CardTitle>
            {responses.data && (
              <CardDescription>
                {t('examPaper.marked', {
                  marked: responses.data.summary.marked,
                  students: responses.data.summary.students,
                })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>{responses.data && <Summary view={responses.data} />}</CardContent>
        </Card>
      </div>

      {hasSets && responses.data && (
        <ScanPanel paper={paper} view={responses.data} readOnly={readOnly} />
      )}

      {responses.data && <PushCard paper={paper} view={responses.data} readOnly={readOnly} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            {t('examPaper.entryTitle')}
          </CardTitle>
          <CardDescription>{t('examPaper.entryDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm space-y-2">
            <Label>{t('examPaper.classroom')}</Label>
            <EntitySelect
              label={t('examPaper.classroom')}
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useAnyClassroomOptions}
              selectedLabel={
                classroomId === refId(paper.classroomId)
                  ? refObject<Classroom>(paper.classroomId)?.name
                  : undefined
              }
            />
          </div>

          {!hasSets && <p className="text-sm text-muted-foreground">{t('examPaper.noSets')}</p>}
          {responses.error && (
            <ErrorState error={responses.error} onRetry={responses.refetch} compact />
          )}

          {hasSets && responses.data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t('examPaper.rollNumber')}</TableHead>
                  <TableHead>{t('examPaper.studentName')}</TableHead>
                  <TableHead className="w-24">{t('examPaper.sets')}</TableHead>
                  <TableHead>{t('examPaper.answers')}</TableHead>
                  <TableHead className="w-20 text-end">{t('examPaper.correctCount')}</TableHead>
                  <TableHead className="w-20 text-end">{t('examPaper.points')}</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {responses.data.rows.map((row) => (
                  <SheetRow
                    key={row.studentId}
                    paper={paper}
                    view={responses.data}
                    row={row}
                    readOnly={readOnly}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * ສົ່ງເຂົ້າຄະແນນປະຈຳເດືອນ — the points into the ກວດກາ column of one month.
 *
 * The month is the one thing asked, because it is the one thing the paper
 * does not know; the subject and the term are on the paper, and the rule of
 * which pupils get what is the marking's. What could stop the send is said
 * before the button, not after it.
 */
function PushCard({
  paper,
  view,
  readOnly,
}: {
  paper: ExamPaper;
  view: ResponsesView;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const monthName = useMonthName();
  const push = usePushToMonthlyMarks();
  const [month, setMonth] = useState<string>(String(view.monthly.months[0] ?? ''));
  const [reason, setReason] = useState('');
  const { monthly } = view;

  const blocker = !monthly.subject
    ? t('examPaper.pushNoSubject')
    : (view.totalPoints ?? 0) > monthly.testMax
      ? t('examPaper.pushTooMany', { total: view.totalPoints, max: monthly.testMax })
      : view.summary.marked === 0
        ? t('examPaper.pushNothingKeyed')
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" />
          {t('examPaper.pushTitle')}
        </CardTitle>
        <CardDescription>
          {t('examPaper.pushDescription', {
            max: monthly.testMax,
            subject: monthly.subject?.nameLo ?? '—',
          })}
          {monthly.semester && ` · ${monthly.semester.nameLo}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="push-month">{t('examPaper.pushMonth')}</Label>
            <Select value={month} onValueChange={setMonth} disabled={readOnly}>
              <SelectTrigger id="push-month" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthly.months.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {monthName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="push-reason">{t('examPaper.pushOverride')}</Label>
            <Input
              id="push-reason"
              value={reason}
              disabled={readOnly}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          {!readOnly && (
            <Button
              type="button"
              disabled={!!blocker || !month || push.isPending}
              onClick={() =>
                push.mutate(
                  {
                    id: paper.id,
                    body: {
                      classroomId: view.classroom.id,
                      month: Number(month),
                      overrideReason: reason.trim() || undefined,
                    },
                  },
                  {
                    onSuccess: (result) => {
                      const skipped =
                        result.skipped > 0
                          ? ` · ${t('examPaper.pushSkipped', { count: result.skipped })}`
                          : '';
                      notify.success(t('examPaper.pushed', { saved: result.saved }) + skipped);
                    },
                  },
                )
              }
            >
              <Send />
              {t('examPaper.push')}
            </Button>
          )}
        </div>
        {blocker && <p className="text-xs text-amber-700 dark:text-amber-300">{blocker}</p>}
      </CardContent>
    </Card>
  );
}

function SheetRow({
  paper,
  view,
  row,
  readOnly,
}: {
  paper: ExamPaper;
  view: ResponsesView;
  row: ResponsesView['rows'][number];
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const save = useSaveResponse();
  const remove = useDeleteResponse();
  const letters = OPTION_LETTERS[view.optionLabelStyle];
  const stored = row.response;

  const [set, setSet] = useState(stored?.setLabel ?? view.sets[0]);
  const [text, setText] = useState(stored ? answersToString(stored.answers, letters) : '');

  // A save elsewhere (or a regrade) refreshes the row; typing is not undone.
  useEffect(() => {
    setSet(stored?.setLabel ?? view.sets[0]);
    setText(stored ? answersToString(stored.answers, letters) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored?.updatedAt, stored?.id]);

  const answers = parseAnswerString(text, letters, view.questionCount);
  const typed = [...text].filter((ch) => !/\s/.test(ch)).length;
  const tooLong = typed > view.questionCount;
  const dirty =
    text !== (stored ? answersToString(stored.answers, letters) : '') || set !== stored?.setLabel;

  return (
    <TableRow className={cn(!stored && 'text-muted-foreground')}>
      <TableCell className="tabular-nums">{row.rollNumber ?? '—'}</TableCell>
      <TableCell>
        <span className="text-foreground">{row.studentNameLo}</span>{' '}
        <span className="text-xs text-muted-foreground">{row.studentCode}</span>
      </TableCell>
      <TableCell>
        <Select value={set} onValueChange={setSet} disabled={readOnly}>
          <SelectTrigger aria-label={`${t('examPaper.sets')} ${row.studentNameLo}`} className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {view.sets.map((label) => (
              <SelectItem key={label} value={label}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          aria-label={`${t('examPaper.answers')} ${row.studentNameLo}`}
          className={cn('h-8 font-mono uppercase tracking-widest', tooLong && 'border-destructive')}
          placeholder={'-'.repeat(Math.min(view.questionCount, 12))}
          value={text}
          disabled={readOnly}
          onChange={(event) => setText(event.target.value)}
        />
        {tooLong && (
          <p className="mt-1 text-xs text-destructive">
            {t('examPaper.answersTooLong', { count: view.questionCount })}
          </p>
        )}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {stored ? (
          <span className="text-foreground">
            {stored.correctCount}
            <span className="text-muted-foreground">/{stored.totalQuestions}</span>
          </span>
        ) : (
          <span className="text-xs">{t('examPaper.notMarked')}</span>
        )}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {stored?.points !== null && stored?.points !== undefined ? stored.points : '—'}
      </TableCell>
      <TableCell className="text-end">
        {!readOnly && (
          <div className="inline-flex gap-1">
            <Button
              type="button"
              size="sm"
              variant={dirty ? 'default' : 'outline'}
              disabled={!dirty || tooLong || save.isPending}
              onClick={() =>
                save.mutate({
                  id: paper.id,
                  studentId: row.studentId,
                  body: { setLabel: set, answers },
                })
              }
            >
              {t('examPaper.saveSheet')}
            </Button>
            {stored && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('examPaper.clearSheet')}
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: paper.id, studentId: row.studentId })}
              >
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function Summary({ view }: { view: ResponsesView }) {
  const { t } = useTranslation();
  const { summary } = view;
  const hardest = [...summary.questions]
    .filter((question) => question.hasAnswer)
    .sort((a, b) => a.correct - b.correct)
    .slice(0, 5);

  if (summary.marked === 0) {
    return <p className="text-sm text-muted-foreground">{t('examPaper.notMarked')}</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <Stat label={t('examPaper.averageCorrect')} value={summary.averageCorrect} />
        <Stat label={t('examPaper.averagePoints')} value={summary.averagePoints} />
        <Stat label={t('examPaper.highest')} value={summary.highestCorrect} />
        <Stat label={t('examPaper.lowest')} value={summary.lowestCorrect} />
      </dl>
      <div>
        <p className="mb-1 font-medium">{t('examPaper.hardestTitle')}</p>
        <ol className="space-y-0.5">
          {hardest.map((question) => (
            <li key={question.original} className="flex gap-2">
              <span className="w-8 shrink-0 tabular-nums">{question.original}.</span>
              <span className="min-w-0 flex-1 truncate">{question.text}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {t('examPaper.correctOf', { correct: question.correct, marked: summary.marked })}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value ?? '—'}</dd>
    </>
  );
}
