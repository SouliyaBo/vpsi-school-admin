import { Printer, Table2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import { useAnnualSheet } from '../api';
import { Mark, SheetHeading } from './SemesterSheet';
import { SheetPickers, type SheetTargetState } from './SheetPickers';

/**
 * ໝົດປີ — the two term marks and their mean, for one subject in one class.
 *
 * This is the report the school hands on: the year in one line per student, with
 * ຜ່ານ / ຕົກ decided at 5. It is derived from the same rows the term sheets are
 * drawn from rather than stored, so a mark corrected in ກຸມພາ moves the year here
 * without anything being recomputed by hand.
 */
export function AnnualSheet() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<SheetTargetState>({});

  const sheet = useAnnualSheet(target);
  const data = sheet.data;

  const passed = (data?.rows ?? []).filter((row) => row.isPassing === true).length;
  const failed = (data?.rows ?? []).filter((row) => row.isPassing === false).length;

  return (
    <div className="space-y-3">
      <Card className="print:hidden">
        <CardContent className="space-y-3 pt-5">
          {/* The year is the two terms together, so there is no term to pick. */}
          <SheetPickers value={target} onChange={setTarget} showSemester={false} />

          {data && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {t('monthlyMark.annualSummary', {
                  students: data.rows.length,
                  passed,
                  failed,
                })}
              </p>
              <Button
                variant="outline"
                className="ms-auto"
                onClick={() => window.print()}
                disabled={data.rows.length === 0}
              >
                <Printer />
                {t('monthlyMark.print')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print-sheet">
        <CardContent className="space-y-3 pt-5">
          {!target.subjectId || !target.classroomId ? (
            <EmptyState icon={Table2} title={t('monthlyMark.pickSheet')} />
          ) : sheet.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : sheet.error ? (
            <ErrorState error={sheet.error} onRetry={sheet.refetch} compact />
          ) : !data ? null : (
            <>
              <SheetHeading sheet={data} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">{t('monthlyMark.rollNumber')}</TableHead>
                    <TableHead className="w-24">{t('monthlyMark.studentCode')}</TableHead>
                    <TableHead>{t('monthlyMark.studentName')}</TableHead>
                    {data.semesters.map((semester) => (
                      <TableHead key={semester.id} className="w-28 text-center">
                        {semester.nameLo}
                      </TableHead>
                    ))}
                    <TableHead className="w-24 text-center">{t('monthlyMark.annual')}</TableHead>
                    <TableHead className="w-24 text-center">{t('monthlyMark.outcome')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow key={row.studentId} className={cn(!row.isEnrolled && 'opacity-60')}>
                      <TableCell className="tabular-nums">{row.rollNumber ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{row.studentCode}</TableCell>
                      <TableCell>
                        <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
                      </TableCell>
                      {data.semesters.map((semester, index) => (
                        <TableCell key={semester.id} className="text-center">
                          <Mark value={row.semesterMarks[index] ?? null} />
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">
                        <Mark value={row.annual} />
                      </TableCell>
                      <TableCell className="text-center">
                        {row.isPassing === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant={row.isPassing ? 'success' : 'danger'}>
                            {t(row.isPassing ? 'monthlyMark.passed' : 'monthlyMark.failed')}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground print:hidden">{t('monthlyMark.annualNote')}</p>
    </div>
  );
}
