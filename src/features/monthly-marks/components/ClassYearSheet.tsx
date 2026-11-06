import { FileSpreadsheet, Loader2, Table2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Classroom, GradeLevel } from '@/types/entities';
import { classroomHeading, classroomsApi } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { cn, refObject } from '@/lib/utils';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import {
  isBelowPass,
  monthlyMarksApi,
  useClassYear,
  type ClassYearSheet as ClassYearData,
} from '../api';
import {
  buildClassYearWorkbook,
  classYearFileName,
  yearPeriods,
  type ClassYearLabels,
} from '../lib/class-year-workbook';

/**
 * ໝົດປີ ທັງຫ້ອງ — one room's whole year, every subject, as the office's sheet.
 *
 * The subject picked above does not narrow the table: it names the sheet and
 * shades its columns, because each teacher keeps the year under their own
 * subject's name. The export takes this room, or every room of the year,
 * ມ.1 to ມ.7, down one sheet.
 */
export function ClassYearSheet({
  classroomId,
  subjectId,
}: {
  classroomId: string | undefined;
  subjectId: string | undefined;
}) {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const sheet = useClassYear(classroomId);
  const data = sheet.data;
  const [exporting, setExporting] = useState<'room' | 'all' | null>(null);

  const chosen = data?.subjects.find((subject) => subject.id === subjectId)?.nameLo ?? null;
  const labels = useYearLabels(chosen);

  async function exportSheets(which: 'room' | 'all') {
    if (!data) return;
    setExporting(which);
    try {
      const sheets = which === 'room' ? [data] : await loadEveryRoom(activeYear.data?.id);
      const blob = await buildClassYearWorkbook(
        sheets,
        labels,
        chosen,
        t('monthlyMark.classYear.sheetName'),
      );
      const base = chosen
        ? t('monthlyMark.classYear.fileName', { subject: chosen })
        : t('monthlyMark.classYear.fallbackTitle');
      saveBlob(blob, classYearFileName(base, which === 'room' ? data : null));
    } catch (error) {
      notify.error(error, t('monthlyMark.exportFailed'));
    } finally {
      setExporting(null);
    }
  }

  if (!classroomId) return <EmptyState icon={Table2} title={t('monthlyMark.pickClass')} />;
  if (sheet.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (sheet.error) return <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />;
  if (!data) return null;

  const periods = yearPeriods(data, labels);
  const span = data.subjects.length + 2;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">{labels.title(data)}</h2>
          <p className="text-sm text-muted-foreground">
            {labels.classroom(classroomHeading(data.classroom), data.classroom.homeroomTeacherName)}
            {' · '}
            {labels.footer(data.classSize.students, data.classSize.female)}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          {(['room', 'all'] as const).map((which) => (
            <Button
              key={which}
              variant="outline"
              onClick={() => void exportSheets(which)}
              disabled={exporting !== null || data.rows.length === 0}
            >
              {exporting === which ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {t(
                which === 'room'
                  ? 'monthlyMark.classYear.exportRoom'
                  : 'monthlyMark.classYear.exportAll',
              )}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="border-collapse text-xs">
          <thead className="bg-muted/60">
            <tr>
              {/* The name stays put while the year scrolls past it. */}
              <th rowSpan={2} className="sticky start-0 z-10 border bg-muted px-2 text-start">
                {labels.rollNumber} · {labels.firstName} {labels.lastName}
              </th>
              <th rowSpan={2} className="border px-2">
                {labels.studentCode}
              </th>
              <th rowSpan={2} className="border px-2">
                {labels.gender}
              </th>
              {periods.map((period) => (
                <th key={period.heading} colSpan={span} className="border border-s-2 px-2 py-1">
                  {period.heading}
                </th>
              ))}
            </tr>
            <tr>
              {periods.map((period) => (
                <Fragment key={period.heading}>
                  {[
                    ...data.subjects.map((subject) => subject.nameLo),
                    labels.deducted,
                    labels.absences,
                  ].map((heading, offset) => (
                    <th
                      key={offset}
                      className={cn(
                        'h-28 border px-1 align-bottom font-medium [writing-mode:vertical-rl]',
                        offset === 0 && 'border-s-2',
                        data.subjects[offset]?.nameLo === chosen && 'bg-warning-subtle',
                      )}
                    >
                      {heading}
                    </th>
                  ))}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={row.studentId} className={cn(!row.isEnrolled && 'opacity-60')}>
                <td className="sticky start-0 z-10 whitespace-nowrap border bg-card px-2">
                  <span className="me-2 tabular-nums text-muted-foreground">{index + 1}</span>
                  {[row.firstNameLo, row.lastNameLo].filter(Boolean).join(' ')}
                </td>
                <td className="whitespace-nowrap border px-2 tabular-nums">{row.studentCode}</td>
                <td className="whitespace-nowrap border px-2">
                  {row.gender === 'female'
                    ? labels.female
                    : row.gender === 'male'
                      ? labels.male
                      : ''}
                </td>
                {periods.map((period) => {
                  const scores = period.scores(row);
                  const registers = period.registers?.(row);
                  return (
                    <Fragment key={period.heading}>
                      {data.subjects.map((subject, position) => {
                        const value = scores[position] ?? null;
                        return (
                          <td
                            key={subject.id}
                            className={cn(
                              'border px-1 text-center tabular-nums',
                              position === 0 && 'border-s-2',
                              subject.nameLo === chosen && 'bg-warning-subtle/60',
                              isBelowPass(value, subject.fullMark) && 'font-medium text-danger',
                            )}
                          >
                            {value === null ? '' : value.toFixed(2)}
                          </td>
                        );
                      })}
                      <td className="border px-1 text-center tabular-nums">
                        {registers?.deducted ?? ''}
                      </td>
                      <td className="border px-1 text-center tabular-nums">
                        {registers?.absences ?? ''}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The year's rooms, ມ.1 first, each read in full. Three at a time, to spare the API. */
async function loadEveryRoom(schoolYearId: string | undefined): Promise<ClassYearData[]> {
  const page = await classroomsApi.list({
    ...(schoolYearId ? { schoolYearId } : {}),
    isActive: true,
    limit: 100,
  });
  const rooms = [...page.data].sort(byGradeThenName);
  const sheets: ClassYearData[] = [];
  for (let start = 0; start < rooms.length; start += 3) {
    const batch = await Promise.all(
      rooms.slice(start, start + 3).map((room) => monthlyMarksApi.classYear(room.id)),
    );
    sheets.push(...batch);
  }
  return sheets;
}

function byGradeThenName(a: Classroom, b: Classroom): number {
  const level = (room: Classroom) => refObject<GradeLevel>(room.gradeLevelId)?.level ?? 99;
  return level(a) - level(b) || a.name.localeCompare(b.name);
}

function useYearLabels(chosen: string | null): ClassYearLabels {
  const { t } = useTranslation();
  return {
    title: (sheet) => {
      const year = sheet.schoolYear?.code ?? sheet.schoolYear?.nameLo ?? '';
      return chosen
        ? t('monthlyMark.classYear.title', { subject: chosen, year })
        : `${t('monthlyMark.classYear.fallbackTitle')} ${year}`.trim();
    },
    classroom: (classroom, teacher) =>
      teacher
        ? t('monthlyMark.classYear.classroomWithTeacher', { classroom, teacher })
        : t('monthlyMark.classYear.classroom', { classroom }),
    rollNumber: t('monthlyMark.classYear.rollNumber'),
    studentCode: t('monthlyMark.classYear.studentCode'),
    gender: t('monthlyMark.classYear.gender'),
    firstName: t('monthlyMark.classYear.firstName'),
    lastName: t('monthlyMark.classYear.lastName'),
    nickname: t('monthlyMark.classYear.nickname'),
    female: t('monthlyMark.classYear.female'),
    male: t('monthlyMark.classYear.male'),
    deducted: t('monthlyMark.classYear.deducted'),
    absences: t('monthlyMark.classYear.absences'),
    month: (month) => t(`month.${month}`),
    exam: (semester) => t('monthlyMark.classYear.exam', { semester }),
    term: (semester) => semester,
    annual: t('monthlyMark.annual'),
    footer: (students, female) =>
      t('monthlyMark.classYear.footer', { students, female, male: students - female }),
  };
}
