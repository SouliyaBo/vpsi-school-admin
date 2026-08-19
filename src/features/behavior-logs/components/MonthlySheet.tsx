import { ClipboardList, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { classroomLabel, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { cn, formatDate, fullName, localizedName, refObject, withNickname } from '@/lib/utils';
import type { Teacher } from '@/types/entities';
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
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { useDeleteBehaviorLog, useMonthlySheet, type SheetRow } from '../api';
import { BehaviorRowDialog } from './BehaviorRowDialog';

/**
 * Numeric, as the paper form heads the sheet ("ເດືອນ (11)") and as the lesson-plan
 * checklist already counts them — the catalogue carries no month names.
 */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The register for one class, one month — the screen that replaces the paper form.
 *
 * Laid out as the form is, down to the column order, because it is filed and
 * printed as that document and a teacher checks it against the previous month's
 * page. That is also why the rows are chronological rather than newest-first: the
 * history tab is where the log is read backwards.
 *
 * A row is written and corrected as a row. Records are per student underneath, but
 * nothing here exposes that — see `BehaviorRowDialog`.
 */
export function MonthlySheet() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const today = new Date();
  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [editing, setEditing] = useState<SheetRow | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SheetRow | null>(null);

  const sheet = useMonthlySheet(classroomId, year, month);
  const remove = useDeleteBehaviorLog();

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const rows = sheet.data?.rows ?? [];
  const classroom = sheet.data?.classroom;
  const homeroomTeacher = classroom ? refObject<Teacher>(classroom.homeroomTeacherId) : null;

  /**
   * The date a new row opens on.
   *
   * The month on screen, not today: this sheet is often filled in a few days
   * late, and defaulting to today would silently file the row into the current
   * month whenever the viewed month is not it. Outside the current month the
   * last day is the closest honest guess, and the picker is right there.
   */
  const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const defaultDay = isThisMonth
    ? today.getDate()
    : new Date(Date.UTC(year, month, 0)).getUTCDate();
  const defaultDate = `${year}-${pad(month)}-${pad(defaultDay)}`;

  const canWrite = can('behavior-logs', 'create');

  function openNew() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(row: SheetRow) {
    setEditing(row);
    setDialogOpen(true);
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    remove.mutateAsync(pendingDelete.groupId).finally(() => setPendingDelete(null));
  }

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="behavior-classroom">{t('behaviorLog.classroom')}</Label>
            <EntitySelect
              id="behavior-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('behaviorLog.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="behavior-month">{t('behaviorLog.month')}</Label>
            <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
              <SelectTrigger id="behavior-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="behavior-year">{t('behaviorLog.year')}</Label>
            <Input
              id="behavior-year"
              type="number"
              inputMode="numeric"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </div>

          <div className="flex items-end gap-2">
            {canWrite && (
              <Button onClick={openNew} disabled={!classroomId}>
                <Plus />
                {t('behaviorLog.addRow')}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => window.print()}
              disabled={!classroomId || rows.length === 0}
            >
              <Printer />
              {t('behaviorLog.print')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!classroomId ? (
        <Card className="print:hidden">
          <CardContent className="pt-5">
            <EmptyState icon={ClipboardList} title={t('behaviorLog.sheetHint')} />
          </CardContent>
        </Card>
      ) : sheet.isLoading ? (
        <Card>
          <CardContent className="space-y-2 pt-5">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : sheet.error ? (
        <Card>
          <CardContent className="pt-5">
            <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
          </CardContent>
        </Card>
      ) : (
        // `print-sheet` is what the print stylesheet keeps; everything outside it
        // — sidebar, filters, tabs — is dropped. See index.css.
        <Card className="print-sheet">
          <CardContent className="space-y-3 pt-5">
            <header className="space-y-1 text-center">
              <h2 className="text-lg font-semibold">{t('behaviorLog.formTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('behaviorLog.monthLabel', { month, year })}
              </p>
              <p className="text-sm">
                <span className="font-medium">{t('behaviorLog.classroom')}:</span>{' '}
                {classroom ? classroomLabel(classroom) : '—'}
                <span className="ms-4 font-medium">{t('behaviorLog.homeroomTeacher')}:</span>{' '}
                {homeroomTeacher ? fullName(homeroomTeacher, i18n.language) : '—'}
              </p>
            </header>

            {rows.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={t('behaviorLog.emptyMonth')}
                description={t('behaviorLog.emptyMonthHint')}
              />
            ) : (
              <div className="scrollbar-thin overflow-x-auto">
                {/* A hand-built table rather than `DataTable`: the cells hold a
                    stack of student lines that must align across three columns,
                    which a per-row column renderer cannot express. */}
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-info-subtle">
                      {[
                        'date',
                        'classNote',
                        'studentName',
                        'behavior',
                        'action',
                        'subject',
                        'teacher',
                        'remark',
                      ].map((key) => (
                        <th
                          key={key}
                          scope="col"
                          className="border border-border px-2 py-1.5 text-start font-semibold"
                        >
                          {t(`behaviorLog.${key}`)}
                        </th>
                      ))}
                      <th scope="col" className="border border-border px-2 py-1.5 print:hidden">
                        <span className="sr-only">{t('common.actions')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <SheetTableRow
                        key={row.groupId}
                        row={row}
                        language={i18n.language}
                        canEdit={can('behavior-logs', 'update')}
                        canDelete={can('behavior-logs', 'delete')}
                        editLabel={t('common.edit')}
                        deleteLabel={t('common.delete')}
                        periodLabel={t('behaviorLog.periodN', { number: row.period })}
                        onEdit={() => openEdit(row)}
                        onDelete={() => setPendingDelete(row)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {classroomId && (
        <BehaviorRowDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          classroomId={classroomId}
          row={editing}
          defaultDate={defaultDate}
          onSaved={sheet.refetch}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('behaviorLog.deleteTitle')}
        description={
          pendingDelete
            ? t('behaviorLog.deleteConfirm', {
                date: formatDate(pendingDelete.date),
                count: pendingDelete.students.length,
              })
            : undefined
        }
        isPending={remove.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface SheetTableRowProps {
  row: SheetRow;
  language: string;
  canEdit: boolean;
  canDelete: boolean;
  editLabel: string;
  deleteLabel: string;
  periodLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * One line of the register.
 *
 * The three student columns are stacks aligned by position, so the second name
 * lines up with the second behaviour and the second action. When every student
 * shares the same text — the common case, "these four were talking" — it is shown
 * once rather than repeated down the cell, which is how the paper reads.
 */
function SheetTableRow({
  row,
  language,
  canEdit,
  canDelete,
  editLabel,
  deleteLabel,
  periodLabel,
  onEdit,
  onDelete,
}: SheetTableRowProps) {
  const behaviors = row.students.map((student) => student.behavior ?? '');
  const actions = row.students.map((student) => student.action ?? '');

  return (
    <tr className="align-top">
      <Cell className="whitespace-nowrap tabular-nums">
        {formatDate(row.date)}
        <span className="block text-xs text-muted-foreground">{periodLabel}</span>
      </Cell>
      <Cell className="min-w-56">{row.classNote || '—'}</Cell>
      <Cell className="min-w-40">
        {/* Flattened rather than a component: this cell stacks several
            students, and the sheet is printed. */}
        <Stack
          values={row.students.map((student) =>
            withNickname(student.studentNameLo, student.studentNickname),
          )}
        />
      </Cell>
      <Cell className="min-w-48">
        <Stack values={behaviors} collapseIdentical />
      </Cell>
      <Cell className="min-w-28">
        <Stack values={actions} collapseIdentical />
      </Cell>
      <Cell className="whitespace-nowrap">
        {row.subject ? localizedName(row.subject, language) : '—'}
      </Cell>
      <Cell className="whitespace-nowrap">
        {row.teacher ? fullName(row.teacher, language) : '—'}
      </Cell>
      <Cell>{row.remark || '—'}</Cell>
      <Cell className="print:hidden">
        <div className="flex items-center gap-0.5">
          {canEdit && (
            <Button variant="ghost" size="icon-sm" aria-label={editLabel} onClick={onEdit}>
              <Pencil />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon-sm" aria-label={deleteLabel} onClick={onDelete}>
              <Trash2 className="text-danger" />
            </Button>
          )}
        </div>
      </Cell>
    </tr>
  );
}

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <td className={cn('border border-border px-2 py-1.5', className)}>{children}</td>;
}

/**
 * One line per student, or a single line when they all say the same thing.
 *
 * `collapseIdentical` is off for names — those are never identical and collapsing
 * them would hide people.
 */
function Stack({
  values,
  collapseIdentical = false,
}: {
  values: string[];
  collapseIdentical?: boolean;
}) {
  const filled = values.filter((value) => value.trim());
  if (filled.length === 0) return <>—</>;

  if (collapseIdentical && filled.length === values.length) {
    const unique = [...new Set(filled)];
    if (unique.length === 1) return <>{unique[0]}</>;
  }

  return (
    <>
      {values.map((value, index) => (
        <span key={index} className="block">
          {value.trim() || '—'}
        </span>
      ))}
    </>
  );
}
