import { AlertTriangle, CalendarRange, Paperclip, TrendingUp, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSemesterOptions } from '@/features/semesters/api';
import { useSubjectGroupOptions } from '@/features/subject-groups/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { cn, formatDate, localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  COMPLIANCE_TONES,
  useCompliance,
  type ComplianceCell,
  type ComplianceCounts,
  type ComplianceGroup,
  type ComplianceRow,
} from '../api';
import { PlanDetailDrawer } from './PlanDetailDrawer';

/**
 * Who has filed a lesson plan, by department and week.
 *
 * The grid is deliberately the whole point rather than a table of plans: the
 * question is not "what was submitted" — a list answers that — but "what was
 * not", and only a cell that exists because the timetable says it should can
 * show a gap. The API supplies those cells; this renders them and lets a head
 * open any one of them.
 */
export function ComplianceMatrix() {
  const { t } = useTranslation();

  const [semesterId, setSemesterId] = useState<string>();
  const [subjectGroupId, setSubjectGroupId] = useState<string>();
  const [teacherId, setTeacherId] = useState<string>();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const query = useCompliance({ semesterId, subjectGroupId, teacherId });
  const matrix = query.data;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-3">
          <Field label={t('semester.title')}>
            <EntitySelect
              value={semesterId ?? null}
              onChange={setSemesterId}
              useOptions={useSemesterOptions}
              label={t('semester.title')}
              placeholder={t('lessonPlan.activeSemester')}
            />
          </Field>
          <Field label={t('subjectGroup.title')}>
            <EntitySelect
              value={subjectGroupId ?? null}
              onChange={setSubjectGroupId}
              useOptions={useSubjectGroupOptions}
              label={t('subjectGroup.title')}
              placeholder={t('common.all')}
            />
          </Field>
          <Field label={t('teacher.title')}>
            <EntitySelect
              value={teacherId ?? null}
              onChange={setTeacherId}
              useOptions={useTeacherOptions}
              label={t('teacher.title')}
              placeholder={t('common.all')}
            />
          </Field>
        </CardContent>
      </Card>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <MatrixSkeleton />
      ) : !matrix || matrix.groups.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t('lessonPlan.noExpectedPlans')}
          description={t('lessonPlan.noExpectedPlansHint')}
        />
      ) : (
        <>
          <SummaryTiles summary={matrix.summary} />

          <p className="text-xs text-muted-foreground">
            {t('lessonPlan.weekRange', {
              from: formatDate(matrix.weeks[0]?.startDate),
              to: formatDate(matrix.weeks[matrix.weeks.length - 1]?.endDate),
              count: matrix.weeks.length,
            })}
          </p>

          {matrix.groups.map((group) => (
            <GroupTable
              key={group.subjectGroup?.id ?? 'unassigned'}
              group={group}
              weeks={matrix.weeks}
              onOpenPlan={setOpenPlanId}
            />
          ))}

          <Legend />
        </>
      )}

      <PlanDetailDrawer
        planId={openPlanId}
        onClose={() => setOpenPlanId(null)}
        // A head opening a cell from here is reviewing, not editing.
        mode="review"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** The four numbers a head acts on, ahead of the grid itself. */
function SummaryTiles({ summary }: { summary: ComplianceCounts }) {
  const { t } = useTranslation();

  const tiles = [
    {
      icon: TrendingUp,
      label: t('lessonPlan.submissionRate'),
      value: `${summary.submissionRate}%`,
      tone: summary.submissionRate >= 80 ? 'text-success' : 'text-warning',
    },
    {
      icon: AlertTriangle,
      label: t('lessonPlan.overdue'),
      value: String(summary.overdue),
      tone: summary.overdue > 0 ? 'text-danger' : 'text-muted-foreground',
    },
    {
      icon: Users,
      label: t('lessonPlan.expectedPlans'),
      value: `${summary.submitted}/${summary.expected}`,
      tone: 'text-foreground',
    },
    {
      icon: Paperclip,
      label: t('lessonPlan.withAttachments'),
      value: String(summary.withAttachments),
      tone: 'text-foreground',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 pt-6">
            <tile.icon className={cn('size-5 shrink-0', tile.tone)} />
            <div className="min-w-0">
              <p className={cn('text-xl font-semibold tabular-nums', tile.tone)}>{tile.value}</p>
              <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GroupTable({
  group,
  weeks,
  onOpenPlan,
}: {
  group: ComplianceGroup;
  weeks: { index: number; startDate: string; endDate: string }[];
  onOpenPlan: (planId: string) => void;
}) {
  const { t, i18n } = useTranslation();

  const heading = group.subjectGroup
    ? localizedName(group.subjectGroup, i18n.language)
    : t('lessonPlan.unassignedGroup');

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{heading}</h3>
          {group.subjectGroup?.headTeacherName ? (
            <Badge variant="outline">
              {t('subjectGroup.head')}: {group.subjectGroup.headTeacherName}
            </Badge>
          ) : (
            // Worth surfacing here rather than only on the departments page: with
            // no head, this group's submissions notify every academic head.
            <Badge variant="warning">{t('subjectGroup.noHead')}</Badge>
          )}
          <Badge variant={group.summary.submissionRate >= 80 ? 'success' : 'warning'}>
            {group.summary.submitted}/{group.summary.expected} ({group.summary.submissionRate}%)
          </Badge>
          {group.summary.overdue > 0 && (
            <Badge variant="danger">
              {t('lessonPlan.overdue')}: {group.summary.overdue}
            </Badge>
          )}
        </div>

        {/* The grid scrolls inside its own box: a twenty-week term is wider than
            the page, and letting the body scroll sideways would take the filters
            and the summary with it. */}
        <div className="overflow-x-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky start-0 z-10 min-w-56 bg-card">
                  {t('lessonPlan.lesson')}
                </TableHead>
                {weeks.map((week) => (
                  <TableHead key={week.startDate} className="w-12 text-center">
                    <span title={formatDate(week.startDate)}>{week.index}</span>
                  </TableHead>
                ))}
                <TableHead className="w-20 text-center">{t('lessonPlan.done')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <MatrixRow key={row.teachingAssignmentId} row={row} onOpenPlan={onOpenPlan} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MatrixRow({
  row,
  onOpenPlan,
}: {
  row: ComplianceRow;
  onOpenPlan: (planId: string) => void;
}) {
  const { i18n } = useTranslation();

  const subjectName = useMemo(
    () => localizedName({ nameLo: row.subjectNameLo, nameEn: row.subjectNameEn }, i18n.language),
    [row.subjectNameLo, row.subjectNameEn, i18n.language],
  );

  return (
    <TableRow>
      <TableCell className="sticky start-0 z-10 bg-card">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.teacherName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {subjectName} · {row.classroomName}
          </p>
        </div>
      </TableCell>

      {row.cells.map((cell) => (
        <TableCell key={cell.weekStartDate} className="p-1 text-center">
          <MatrixCellButton cell={cell} onOpenPlan={onOpenPlan} />
        </TableCell>
      ))}

      <TableCell className="text-center text-xs tabular-nums">
        <span
          className={cn(
            row.summary.submissionRate >= 80 ? 'text-success' : 'text-warning',
            'font-medium',
          )}
        >
          {row.summary.submitted}/{row.summary.expected}
        </span>
      </TableCell>
    </TableRow>
  );
}

function MatrixCellButton({
  cell,
  onOpenPlan,
}: {
  cell: ComplianceCell;
  onOpenPlan: (planId: string) => void;
}) {
  const { t } = useTranslation();
  const tone = COMPLIANCE_TONES[cell.status];

  const title = [
    t(`lessonPlanStatus.${cell.status}`, { defaultValue: cell.status }),
    cell.isLate ? t('lessonPlan.late') : null,
    cell.isOverdue ? t('lessonPlan.overdue') : null,
    cell.attachmentCount > 0 ? `${cell.attachmentCount} ${t('lessonPlan.files')}` : null,
    `${t('lessonPlan.due')}: ${formatDate(cell.dueDate)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const label = (
    <span className="relative flex items-center justify-center">
      <span className={cn('size-2.5 rounded-full', tone.dot)} />
      {/* An upload marker, because "wrote a plan" and "attached the material"
          are two different things the school tracks. */}
      {cell.attachmentCount > 0 && (
        <Paperclip className="absolute -end-2.5 -top-1.5 size-2.5 opacity-70" />
      )}
    </span>
  );

  const shared = cn(
    'flex size-8 items-center justify-center rounded-md',
    tone.cell,
    // The deadline has passed with nothing handed in — the one state a head is
    // looking for, so it is outlined rather than merely tinted.
    cell.isOverdue && 'ring-1 ring-danger',
  );

  if (!cell.planId) {
    return (
      <span className={shared} title={title} aria-label={title}>
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenPlan(cell.planId!)}
      className={cn(shared, 'transition hover:ring-2 hover:ring-primary')}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  );
}

function Legend() {
  const { t } = useTranslation();
  const statuses = ['approved', 'submitted', 'returned', 'draft', 'missing'] as const;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {statuses.map((status) => (
        <span key={status} className="flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', COMPLIANCE_TONES[status].dot)} />
          {t(`lessonPlanStatus.${status}`, { defaultValue: status })}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full ring-1 ring-danger" />
        {t('lessonPlan.overdue')}
      </span>
      <span className="flex items-center gap-1.5">
        <Paperclip className="size-3" />
        {t('lessonPlan.hasFiles')}
      </span>
    </div>
  );
}

function MatrixSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
