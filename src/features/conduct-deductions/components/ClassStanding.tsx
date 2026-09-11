import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { formatDate } from '@/lib/utils';
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
import { StudentName } from '@/components/common/StudentName';
import { ESCALATION_TONES, useClassStanding, type ClassStandingRow } from '../api';
import { NotifyList } from './NotifyList';
import { StudentLedgerDialog } from './StudentLedgerDialog';

/**
 * ສະຫຼຸບຄະແນນກົດລະບຽບ — where a class stands this school year.
 *
 * Built from the roll, so a child with nothing against them is listed on their
 * full 100 rather than being absent from the page: on a discipline sheet the
 * clean records are half the information, and a page that showed only the
 * deducted would read as if the whole class were in trouble.
 *
 * Ordered worst first, because that is the order it is acted on. The rung, not
 * the number, carries the colour — two children on ຂັ້ນ 1 need the same thing
 * done about them whether they got there in two deductions or six.
 *
 * There is no term to pick. The school issues the 100 once a school year and
 * reads the balance forward through both terms, so a term picker here would be
 * offering a window the rules do not have — and a child who lost 20 in
 * ພາກຮຽນ I would read as clean in ພາກຮຽນ II.
 */
export function ClassStanding() {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [openStudent, setOpenStudent] = useState<ClassStandingRow | null>(null);

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const standing = useClassStanding(classroomId, activeYear.data?.id);
  const rows = standing.data ?? [];
  const flagged = rows.filter((row) => row.level !== 'none').length;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="space-y-1.5 sm:max-w-sm">
            <Label htmlFor="standing-classroom">{t('conductDeduction.classroom')}</Label>
            <EntitySelect
              id="standing-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('conductDeduction.selectClassroom')}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('conductDeduction.yearScopeNote')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId || !activeYear.data ? (
            <EmptyState icon={ShieldCheck} title={t('conductDeduction.standingHint')} />
          ) : standing.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : standing.error ? (
            <ErrorState error={standing.error} onRetry={standing.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={t('conductDeduction.emptyRoster')} />
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {flagged === 0
                  ? t('conductDeduction.allClean')
                  : t('conductDeduction.flaggedCount', { count: flagged, total: rows.length })}
              </p>

              <div className="scrollbar-thin overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('conductDeduction.studentName')}</TableHead>
                      <TableHead className="w-24">{t('conductDeduction.deducted')}</TableHead>
                      <TableHead className="w-24">{t('conductDeduction.remaining')}</TableHead>
                      <TableHead className="w-40">{t('conductDeduction.level')}</TableHead>
                      <TableHead className="w-32">{t('conductDeduction.lastEntry')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        key={row.studentId}
                        className="cursor-pointer"
                        // The row opens the child's own account: the standing
                        // says who to deal with, the account says what about.
                        onClick={() => setOpenStudent(row)}
                      >
                        <TableCell>
                          <StudentName
                            name={row.studentNameLo}
                            nickname={row.studentNickname}
                            className="font-medium"
                          />
                          <p className="text-xs text-muted-foreground">{row.studentCode}</p>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.deducted === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            `−${row.deducted}`
                          )}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">{row.remaining}</TableCell>
                        <TableCell>
                          <Badge variant={ESCALATION_TONES[row.level]}>
                            {t(`conductEscalation.${row.level}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.lastDate ? formatDate(row.lastDate) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Who has to be told about the worst of them, spelled out under the table
          rather than left as a badge the reader has to decode. */}
      {rows.some((row) => row.notify.length > 0) && (
        <Card>
          <CardContent className="space-y-1.5 pt-5">
            <h3 className="text-sm font-medium">{t('conductDeduction.toReport')}</h3>
            {rows
              .filter((row) => row.notify.length > 0)
              .map((row) => (
                <p key={row.studentId} className="text-xs text-muted-foreground">
                  <StudentName
                    name={row.studentNameLo}
                    nickname={row.studentNickname}
                    className="text-foreground"
                  />{' '}
                  — <NotifyList parties={row.notify} />
                </p>
              ))}
          </CardContent>
        </Card>
      )}

      <StudentLedgerDialog
        open={openStudent !== null}
        onOpenChange={(open) => !open && setOpenStudent(null)}
        student={openStudent}
        schoolYearId={activeYear.data?.id}
      />
    </div>
  );
}
