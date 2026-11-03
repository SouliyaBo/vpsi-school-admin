import { FileSpreadsheet, Info, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSeesEveryStudent } from '@/features/auth/hooks';
import { classroomHeading } from '@/features/classrooms/api';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { cn, formatDate, localizedName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StudentName } from '@/components/common/StudentName';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import {
  useMonthlyStanding,
  type BandTally,
  type StandingPeriod,
  type StandingStudent,
  type StandingSubject,
} from '../api';
import {
  bandChanges,
  parsePeriodKey,
  periodKey,
  shareChange,
  type BandChange,
} from '../lib/monthly-standing';

/** The `Select` cannot carry an empty value, so "every class" is spelled out. */
const ALL_ROOMS = 'all';

const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`);
const mark = (value: number | null) => (value === null ? '—' : value.toFixed(2));

/**
 * ສະຫຼຸບຜົນການຮຽນປະຈຳເດືອນ — who has 7 or more in every subject, who has fallen
 * below 5 in any, and how both shares moved since the month compared with.
 *
 * One request for the school: the API reads each class's ສະຫຼຸບປະຈຳເດືອນ and
 * bands every student on it, so a student's band here is decided on the very
 * marks the class sheet shows. The room filter narrows what is on screen; a
 * homeroom teacher is sent their own room only.
 */
export function MonthlyStandingPanel() {
  const { t, i18n } = useTranslation();
  const seesEveryStudent = useSeesEveryStudent();
  const [currentKey, setCurrentKey] = useState<string>();
  // Unset means "the month before", which the API works out across the term break.
  const [compareKey, setCompareKey] = useState<string>();
  const [roomId, setRoomId] = useState(ALL_ROOMS);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => {
    const current = currentKey ? parsePeriodKey(currentKey) : undefined;
    const compare = compareKey ? parsePeriodKey(compareKey) : undefined;
    return {
      semesterId: current?.semesterId,
      month: current?.month,
      compareSemesterId: compare?.semesterId,
      compareMonth: compare?.month,
    };
  }, [currentKey, compareKey]);
  const standing = useMonthlyStanding(params);
  const data = standing.data;

  const periodLabel = (period: StandingPeriod) =>
    `${t(`month.${period.month}`)} · ${localizedName(
      { nameLo: period.semesterNameLo, nameEn: period.semesterNameEn },
      i18n.language,
    )}`;

  const roomLabels = useMemo(
    () =>
      new Map(
        (data?.classrooms ?? []).map((room) => [
          room.id,
          classroomHeading({ name: room.name, gradeLevelCode: room.gradeLevelCode }),
        ]),
      ),
    [data?.classrooms],
  );
  const roomLabel = (id: string) => roomLabels.get(id) ?? '';

  // A room picked under one set of classes may not be in the next.
  const room = data?.classrooms.find((candidate) => candidate.id === roomId);
  const classes = room ? [room] : (data?.classrooms ?? []);
  const students = useMemo(
    () => (data?.students ?? []).filter((student) => !room || student.classroomId === room.id),
    [data?.students, room],
  );
  const totals = room ? { current: room.current, previous: room.previous } : data?.total;
  const subjects: StandingSubject[] = room ? room.subjects : (data?.subjects ?? []);
  const below = students.filter((student) => student.band === 'below');
  const top = students.filter((student) => student.band === 'top');
  const changes = data?.previous ? bandChanges(students) : null;

  const title = data
    ? t('report.standing.title', {
        month: t(`month.${data.current.month}`),
        semester: localizedName(
          { nameLo: data.current.semesterNameLo, nameEn: data.current.semesterNameEn },
          i18n.language,
        ),
      }) + (room ? ` — ${roomLabel(room.id)}` : '')
    : '';

  async function exportWorkbook() {
    if (!data || !totals) return;
    setBusy(true);
    try {
      const { buildStandingWorkbook, standingFileName } = await import(
        '../lib/monthly-standing-workbook'
      );
      const blob = await buildStandingWorkbook(
        {
          classes: classes.map((entry) => ({
            label: roomLabel(entry.id),
            current: entry.current,
            previous: entry.previous,
          })),
          total: room ? null : totals,
          subjects,
          below,
          top,
          changes,
          roomLabel,
        },
        {
          schoolName:
            (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
            (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
            '',
          title,
          sheets: {
            classes: t('report.standing.views.classes'),
            subjects: t('report.standing.views.subjects'),
            below: t('report.standing.views.below'),
            top: t('report.standing.views.top'),
            changes: t('report.standing.views.changes'),
          },
          number: t('report.attendance.number'),
          classroom: t('report.standing.classroom'),
          students: t('report.standing.students'),
          incomplete: t('standingBand.incomplete'),
          decided: t('report.standing.decided'),
          percent: '%',
          before: data.previous ? t(`month.${data.previous.month}`) : t('report.standing.before'),
          total: t('report.attendance.total'),
          subject: t('report.standing.subject'),
          marked: t('report.standing.marked'),
          failed: t('report.standing.failed'),
          reachedTop: t('report.standing.reachedTop'),
          studentCode: t('attendance.studentCode'),
          student: t('attendance.student'),
          failingSubjects: t('report.standing.failingSubjects'),
          average: t('report.standing.average'),
          lowest: t('report.standing.lowest'),
          now: t(`month.${data.current.month}`),
          down: t('report.standing.down', { count: changes?.down.length ?? 0 }),
          up: t('report.standing.up', { count: changes?.up.length ?? 0 }),
          bandName: (band) => (band ? t(`standingBand.${band}`) : '—'),
          nobody: '—',
          rules: t('report.standing.rules'),
          director: t('monthlyMark.director'),
          reporter: t('report.attendance.reporter'),
          signatureDate: t('monthlyMark.signatureDate'),
          printedOn: t('student.exportPrintedOn', { date: formatDate(new Date()) }),
        },
      );
      saveBlob(blob, standingFileName(title));
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  }

  const currentValue = data ? periodKey(data.current) : '';
  const compareValue = data?.previous ? periodKey(data.previous) : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="standing-month">{t('report.standing.month')}</Label>
            <Select
              value={currentValue}
              onValueChange={(next) => {
                setCurrentKey(next);
                setCompareKey(undefined);
              }}
            >
              <SelectTrigger id="standing-month">
                <SelectValue placeholder={t('report.standing.month')} />
              </SelectTrigger>
              <SelectContent>
                {(data?.periods ?? []).map((period) => (
                  <SelectItem key={periodKey(period)} value={periodKey(period)}>
                    {periodLabel(period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="standing-compare">{t('report.standing.compare')}</Label>
            <Select value={compareValue} onValueChange={setCompareKey}>
              <SelectTrigger id="standing-compare">
                <SelectValue placeholder={t('report.standing.noCompare')} />
              </SelectTrigger>
              <SelectContent>
                {(data?.periods ?? [])
                  .filter((period) => periodKey(period) !== currentValue)
                  .map((period) => (
                    <SelectItem key={periodKey(period)} value={periodKey(period)}>
                      {periodLabel(period)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="standing-room">{t('report.standing.classroom')}</Label>
            <Select value={room ? room.id : ALL_ROOMS} onValueChange={setRoomId}>
              <SelectTrigger id="standing-room">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROOMS}>{t('report.standing.allRooms')}</SelectItem>
                {(data?.classrooms ?? []).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {roomLabel(entry.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              disabled={!data || classes.length === 0 || busy}
              onClick={exportWorkbook}
            >
              <FileSpreadsheet />
              {t('report.standing.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {standing.error ? (
        <ErrorState error={standing.error} onRetry={() => standing.refetch()} compact />
      ) : !data ? (
        <TableSkeleton rows={6} columns={7} />
      ) : data.classrooms.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('report.attendance.noRooms')}
          description={seesEveryStudent ? undefined : t('report.attendance.noRoomsTeacher')}
        />
      ) : (
        <div className="space-y-4">
          <h2 className="font-semibold">{title}</h2>
          {totals && <BandCards current={totals.current} previous={totals.previous} />}

          <Tabs defaultValue="classes">
            <TabsList className="flex-wrap">
              <TabsTrigger value="classes">{t('report.standing.views.classes')}</TabsTrigger>
              <TabsTrigger value="subjects">{t('report.standing.views.subjects')}</TabsTrigger>
              <TabsTrigger value="below">
                {t('report.standing.views.below')} ({below.length})
              </TabsTrigger>
              <TabsTrigger value="top">
                {t('report.standing.views.top')} ({top.length})
              </TabsTrigger>
              <TabsTrigger value="changes">{t('report.standing.views.changes')}</TabsTrigger>
            </TabsList>

            <TabsContent value="classes">
              <ClassTable
                rows={classes.map((entry) => ({
                  id: entry.id,
                  label: roomLabel(entry.id),
                  current: entry.current,
                  previous: entry.previous,
                }))}
                total={room ? null : (totals ?? null)}
              />
            </TabsContent>
            <TabsContent value="subjects">
              <SubjectTable subjects={subjects} comparing={Boolean(data.previous)} />
            </TabsContent>
            <TabsContent value="below">
              <BelowList students={below} roomLabel={roomLabel} comparing={Boolean(data.previous)} />
            </TabsContent>
            <TabsContent value="top">
              <TopList students={top} roomLabel={roomLabel} comparing={Boolean(data.previous)} />
            </TabsContent>
            <TabsContent value="changes">
              {changes ? (
                <ChangeLists changes={changes} roomLabel={roomLabel} />
              ) : (
                <EmptyState icon={Users} title={t('report.standing.needsCompare')} />
              )}
            </TabsContent>
          </Tabs>

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>{t('report.standing.rules')}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * How a share moved, in percentage points. `good` says which way is good news —
 * more ດີ is, more ຫຼຸດ is not — so the colour reads the same in both columns.
 * ກາງ has none: it grows as much from ດີ students slipping as from ຫຼຸດ ones
 * recovering, so its change is shown uncoloured.
 */
function Change({
  now,
  before,
  good,
}: {
  now: number | null;
  before: number | null | undefined;
  good?: 'up' | 'down';
}) {
  const { t } = useTranslation();
  if (before === undefined) return null;
  const change = shareChange(now, before);
  const better = change !== null && (change > 0) === (good === 'up');
  const tone = !good ? 'text-foreground' : better ? 'text-success' : 'text-destructive';
  return (
    <div className="text-xs text-muted-foreground">
      {t('report.standing.was', { percent: percent(before) })}
      {change !== null && change !== 0 && (
        <span className={cn('ms-1 font-medium', tone)}>
          {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
        </span>
      )}
    </div>
  );
}

function Share({
  count,
  share,
  before,
  good,
}: {
  count: number;
  share: number | null;
  before?: number | null;
  good?: 'up' | 'down';
}) {
  return (
    <div className="tabular-nums">
      <span className="font-medium">{percent(share)}</span>{' '}
      <span className="text-xs text-muted-foreground">({count})</span>
      <Change now={share} before={before} good={good} />
    </div>
  );
}

/** The four bands for what is on screen, at a glance. */
function BandCards({ current, previous }: { current: BandTally; previous: BandTally | null }) {
  const { t } = useTranslation();
  const cards = [
    { band: 'top', count: current.top, share: current.topPercent, before: previous?.topPercent, good: 'up' },
    {
      band: 'middle',
      count: current.middle,
      share: current.middlePercent,
      before: previous?.middlePercent,
      good: undefined,
    },
    {
      band: 'below',
      count: current.below,
      share: current.belowPercent,
      before: previous?.belowPercent,
      good: 'down',
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.band}>
          <CardContent className="space-y-1 pt-5">
            <StatusBadge status={card.band} namespace="standingBand" />
            <p className="text-xs text-muted-foreground">{t(`report.standing.bands.${card.band}`)}</p>
            <p className="text-2xl font-semibold tabular-nums">{percent(card.share)}</p>
            <p className="text-sm text-muted-foreground">
              {t('report.standing.people', { count: card.count })}
            </p>
            {previous && (
              <Change now={card.share} before={card.before ?? null} good={card.good} />
            )}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="space-y-1 pt-5">
          <StatusBadge status="incomplete" namespace="standingBand" />
          <p className="text-xs text-muted-foreground">{t('report.standing.bands.incomplete')}</p>
          <p className="text-2xl font-semibold tabular-nums">{current.incomplete}</p>
          <p className="text-sm text-muted-foreground">
            {t('report.standing.decided')}: {current.decided} / {current.students}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ClassTable({
  rows,
  total,
}: {
  rows: { id: string; label: string; current: BandTally; previous: BandTally | null }[];
  total: { current: BandTally; previous: BandTally | null } | null;
}) {
  const { t } = useTranslation();
  const cells = (current: BandTally, previous: BandTally | null) => (
    <>
      <TableCell className="text-end tabular-nums">{current.students}</TableCell>
      <TableCell className="text-end tabular-nums">{current.incomplete}</TableCell>
      <TableCell className="text-end">
        <Share count={current.top} share={current.topPercent} before={previous?.topPercent} good="up" />
      </TableCell>
      <TableCell className="text-end">
        <Share
          count={current.middle}
          share={current.middlePercent}
          before={previous?.middlePercent}
        />
      </TableCell>
      <TableCell className="text-end">
        <Share
          count={current.below}
          share={current.belowPercent}
          before={previous?.belowPercent}
          good="down"
        />
      </TableCell>
    </>
  );

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('report.standing.classroom')}</TableHead>
            <TableHead className="text-end">{t('report.standing.students')}</TableHead>
            <TableHead className="text-end">{t('standingBand.incomplete')}</TableHead>
            <TableHead className="text-end">{t('report.standing.bands.top')}</TableHead>
            <TableHead className="text-end">{t('standingBand.middle')}</TableHead>
            <TableHead className="text-end">{t('report.standing.bands.below')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium">{row.label}</TableCell>
              {cells(row.current, row.previous)}
            </TableRow>
          ))}
        </TableBody>
        {total && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">{t('report.attendance.total')}</TableCell>
              {cells(total.current, total.previous)}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

function SubjectTable({ subjects, comparing }: { subjects: StandingSubject[]; comparing: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('report.standing.subject')}</TableHead>
            <TableHead className="text-end">{t('report.standing.marked')}</TableHead>
            <TableHead className="text-end">{t('report.standing.failed')}</TableHead>
            <TableHead className="text-end">{t('report.standing.reachedTop')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.map((subject) => (
            <TableRow key={subject.nameLo}>
              <TableCell className="font-medium">{subject.nameLo}</TableCell>
              <TableCell className="text-end tabular-nums">{subject.current.marked}</TableCell>
              <TableCell className="text-end">
                <Share
                  count={subject.current.failed}
                  share={subject.current.failedPercent}
                  before={comparing ? (subject.previous?.failedPercent ?? null) : undefined}
                  good="down"
                />
              </TableCell>
              <TableCell className="text-end">
                <Share
                  count={subject.current.top}
                  share={subject.current.topPercent}
                  before={comparing ? (subject.previous?.topPercent ?? null) : undefined}
                  good="up"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StudentCells({ student, roomLabel }: { student: StandingStudent; roomLabel: (id: string) => string }) {
  return (
    <>
      <TableCell className="tabular-nums">{student.studentCode}</TableCell>
      <TableCell>
        <StudentName name={student.studentNameLo} nickname={student.studentNickname} />
      </TableCell>
      <TableCell>{roomLabel(student.classroomId)}</TableCell>
    </>
  );
}

function PreviousBand({ student }: { student: StandingStudent }) {
  return student.previousBand ? (
    <StatusBadge status={student.previousBand} namespace="standingBand" />
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function ListHead({ extra, comparing }: { extra: string[]; comparing: boolean }) {
  const { t } = useTranslation();
  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-12">{t('report.attendance.number')}</TableHead>
        <TableHead>{t('attendance.studentCode')}</TableHead>
        <TableHead>{t('attendance.student')}</TableHead>
        <TableHead>{t('report.standing.classroom')}</TableHead>
        {extra.map((heading) => (
          <TableHead key={heading}>{heading}</TableHead>
        ))}
        {comparing && <TableHead>{t('report.standing.before')}</TableHead>}
      </TableRow>
    </TableHeader>
  );
}

function BelowList({
  students,
  roomLabel,
  comparing,
}: {
  students: StandingStudent[];
  roomLabel: (id: string) => string;
  comparing: boolean;
}) {
  const { t } = useTranslation();
  if (students.length === 0) return <EmptyState icon={Users} title={t('report.standing.nobodyBelow')} />;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <ListHead extra={[t('report.standing.failingSubjects')]} comparing={comparing} />
        <TableBody>
          {students.map((student, index) => (
            <TableRow key={student.studentId}>
              <TableCell className="tabular-nums">{index + 1}</TableCell>
              <StudentCells student={student} roomLabel={roomLabel} />
              <TableCell>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {student.failing.map((entry) => (
                    <span key={entry.subjectId}>
                      {entry.nameLo}{' '}
                      <span className="font-medium tabular-nums text-destructive">
                        {mark(entry.score)}
                      </span>
                    </span>
                  ))}
                </div>
                {student.subjectsMarked < student.subjectsExpected && (
                  <p className="text-xs text-muted-foreground">
                    {t('report.standing.partial', {
                      marked: student.subjectsMarked,
                      expected: student.subjectsExpected,
                    })}
                  </p>
                )}
              </TableCell>
              {comparing && (
                <TableCell>
                  <PreviousBand student={student} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TopList({
  students,
  roomLabel,
  comparing,
}: {
  students: StandingStudent[];
  roomLabel: (id: string) => string;
  comparing: boolean;
}) {
  const { t } = useTranslation();
  if (students.length === 0) return <EmptyState icon={Users} title={t('report.standing.nobodyTop')} />;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <ListHead
          extra={[t('report.standing.average'), t('report.standing.lowest')]}
          comparing={comparing}
        />
        <TableBody>
          {students.map((student, index) => (
            <TableRow key={student.studentId}>
              <TableCell className="tabular-nums">{index + 1}</TableCell>
              <StudentCells student={student} roomLabel={roomLabel} />
              <TableCell className="tabular-nums">{mark(student.average)}</TableCell>
              <TableCell className="tabular-nums">{mark(student.lowest)}</TableCell>
              {comparing && (
                <TableCell>
                  <PreviousBand student={student} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ChangeLists({
  changes,
  roomLabel,
}: {
  changes: { down: BandChange[]; up: BandChange[] };
  roomLabel: (id: string) => string;
}) {
  const { t } = useTranslation();
  if (changes.down.length === 0 && changes.up.length === 0) {
    return <EmptyState icon={Users} title={t('report.standing.nobodyChanged')} />;
  }
  return (
    <div className="space-y-4">
      {(
        [
          ['down', changes.down],
          ['up', changes.up],
        ] as const
      ).map(([way, list]) => (
        <section key={way} className="space-y-2">
          <h3 className="text-sm font-semibold">
            {t(`report.standing.${way}`, { count: list.length })}
          </h3>
          {list.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('report.attendance.number')}</TableHead>
                    <TableHead>{t('attendance.studentCode')}</TableHead>
                    <TableHead>{t('attendance.student')}</TableHead>
                    <TableHead>{t('report.standing.classroom')}</TableHead>
                    <TableHead>{t('report.standing.before')}</TableHead>
                    <TableHead>{t('report.standing.now')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((change, index) => (
                    <TableRow key={change.student.studentId}>
                      <TableCell className="tabular-nums">{index + 1}</TableCell>
                      <StudentCells student={change.student} roomLabel={roomLabel} />
                      <TableCell>
                        <StatusBadge status={change.from} namespace="standingBand" />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={change.to} namespace="standingBand" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
