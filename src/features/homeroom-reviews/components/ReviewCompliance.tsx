import { AlertTriangle, CheckCircle2, Clock, Phone, Printer, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn, formatDate, formatDateTime, toDateInput } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { roomLabel, useReviewCompliance, type ComplianceRow, type ReviewDayCell } from '../api';

/**
 * ການຕິດຕາມຂອງຄູປະຈຳຫ້ອງ — who has checked their class, and who has not.
 *
 * A grid rather than a list, because the office's question is not "how many
 * reviews were filed" but "which room has nobody looking at it": one row per
 * classroom, one column per ວັນພຸດ/ວັນສຸກ, so a teacher who stopped in September
 * is a line of red across the page and needs no report to be assembled by hand.
 *
 * Read from the calendar rather than from the reviews on file, which is the only
 * way a room with nothing on file can be a row at all. A review day the school did
 * not teach on is not a column, and one whose deadline has not passed is pending
 * rather than missing — the two rules that keep the number worth reading.
 */

/** Where the sheet for one room and one day lives. */
function sheetLink(classroomId: string, dueDate?: string): string {
  const params = new URLSearchParams({ tab: 'sheet', classroomId });
  if (dueDate) params.set('dueDate', dueDate);
  return `/homeroom-reviews?${params.toString()}`;
}

/** A cell, as small as it can be and still say which of the four states it is. */
function Cell({ cell, classroomId }: { cell: ReviewDayCell; classroomId: string }) {
  const { t } = useTranslation();

  const look = {
    confirmed: { icon: CheckCircle2, className: 'text-success' },
    late: { icon: Clock, className: 'text-warning' },
    missing: { icon: AlertTriangle, className: 'text-danger' },
    pending: { icon: Phone, className: 'text-muted-foreground' },
  }[cell.status];
  const Icon = look.icon;

  const title = [
    t(`homeroomReview.statuses.${cell.status}`),
    cell.reviewedAt ? formatDateTime(cell.reviewedAt) : null,
    cell.hoursLate > 0 ? t('homeroomReview.hoursLate', { hours: cell.hoursLate }) : null,
    cell.studentsFlagged > 0
      ? t('homeroomReview.cellFlagged', {
          flagged: cell.studentsFlagged,
          actioned: cell.studentsActioned,
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TableCell className="text-center" title={title}>
      {/* Every cell opens that room's sheet on that day — which is how the office
          gets from "ມ.2/ກ missed Wednesday" to what was actually going on in the
          class that week. */}
      <Link
        to={sheetLink(classroomId, cell.date)}
        className="inline-flex flex-col items-center rounded hover:bg-accent"
        aria-label={`${t(`homeroomReview.statuses.${cell.status}`)} — ${cell.date}`}
      >
        <Icon className={cn('size-4', look.className)} />
        {cell.guardiansContacted > 0 && (
          <span className="text-[10px] text-muted-foreground">{cell.guardiansContacted}☎</span>
        )}
      </Link>
    </TableCell>
  );
}

function Row({ row }: { row: ComplianceRow }) {
  const { t } = useTranslation();

  return (
    <TableRow className={cn(row.missing > 0 && 'bg-danger-subtle/40')}>
      <TableCell className="font-medium">
        <Link
          to={sheetLink(
            row.classroomId,
            // The most recent day still owed, else the latest column: what the
            // office wants to look at is the gap it just spotted.
            row.days.filter((day) => day.status === 'missing').pop()?.date,
          )}
          className="underline-offset-4 hover:underline"
        >
          {roomLabel(row)}
        </Link>
      </TableCell>
      <TableCell>
        {row.teacherName ?? (
          <span className="flex items-center gap-1 text-danger">
            <UserX className="size-4" />
            {t('homeroomReview.noTeacher')}
          </span>
        )}
        {row.teacherCode && (
          <span className="ms-1 text-xs text-muted-foreground">{row.teacherCode}</span>
        )}
      </TableCell>
      {row.days.map((cell) => (
        <Cell key={cell.date} cell={cell} classroomId={row.classroomId} />
      ))}
      <TableCell className="text-end">
        {row.confirmed + row.late}/{row.due}
      </TableCell>
      <TableCell className="w-28">
        <div className="flex items-center gap-2">
          <Progress value={row.reviewRate} className="h-2" />
          <span className="w-10 text-end text-xs text-muted-foreground">{row.reviewRate}%</span>
        </div>
      </TableCell>
      <TableCell className="text-end text-sm text-muted-foreground">
        {row.lastReviewedAt ? formatDate(row.lastReviewedAt) : '—'}
      </TableCell>
      <TableCell className="text-end text-sm">
        {row.guardiansContacted > 0 ? row.guardiansContacted : '—'}
      </TableCell>
    </TableRow>
  );
}

export function ReviewCompliance() {
  const { t } = useTranslation();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [outstandingOnly, setOutstandingOnly] = useState(false);

  const report = useReviewCompliance({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(outstandingOnly ? { outstandingOnly: true } : {}),
  });

  if (report.isLoading && !report.data) return <Skeleton className="h-64 w-full" />;
  if (report.error) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;
  if (!report.data) return null;

  const data = report.data;
  const summary = data.summary;

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="review-from">{t('common.from')}</Label>
            <Input
              id="review-from"
              type="date"
              className="w-40"
              value={from || toDateInput(data.startDate)}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="review-to">{t('common.to')}</Label>
            <Input
              id="review-to"
              type="date"
              className="w-40"
              value={to || toDateInput(data.endDate)}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="review-outstanding"
              checked={outstandingOnly}
              onCheckedChange={setOutstandingOnly}
            />
            <Label htmlFor="review-outstanding">{t('homeroomReview.outstandingOnly')}</Label>
          </div>
          <Button variant="outline" className="ms-auto" onClick={() => window.print()}>
            <Printer />
            {t('common.print')}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('homeroomReview.due')} value={String(summary.due)} />
        <Stat
          label={t('homeroomReview.reviewed')}
          value={`${summary.confirmed + summary.late}`}
          hint={t('homeroomReview.lateOf', { count: summary.late })}
        />
        <Stat
          label={t('homeroomReview.behind')}
          value={String(summary.classroomsBehind)}
          hint={t('homeroomReview.teachersBehind', { count: summary.teachersBehind })}
          tone={summary.classroomsBehind > 0 ? 'bad' : 'good'}
        />
        <Stat
          label={t('homeroomReview.guardiansContacted')}
          value={String(summary.guardiansContacted)}
        />
      </div>

      {summary.classroomsUnassigned > 0 && (
        <p className="flex items-center gap-2 text-sm text-danger">
          <UserX className="size-4" />
          {t('homeroomReview.unassignedWarning', { count: summary.classroomsUnassigned })}
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={t('homeroomReview.allReviewed')}
          description={t('homeroomReview.allReviewedHint')}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('homeroomReview.classroom')}</TableHead>
                  <TableHead>{t('homeroomReview.homeroomTeacher')}</TableHead>
                  {data.reviewDays.map((day) => (
                    <TableHead key={day.date} className="whitespace-nowrap text-center text-xs">
                      {formatDate(day.date).slice(0, 5)}
                    </TableHead>
                  ))}
                  <TableHead className="text-end">{t('homeroomReview.reviewed')}</TableHead>
                  <TableHead>{t('homeroomReview.rate')}</TableHead>
                  <TableHead className="text-end">{t('homeroomReview.lastReviewed')}</TableHead>
                  <TableHead className="text-end">☎</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <Row key={row.classroomId} row={row} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">{t('homeroomReview.complianceNote')}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-2xl font-semibold',
            tone === 'bad' && 'text-danger',
            tone === 'good' && 'text-success',
          )}
        >
          {value}
        </p>
        {hint && <Badge variant="outline">{hint}</Badge>}
      </CardContent>
    </Card>
  );
}
