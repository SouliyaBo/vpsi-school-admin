import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { useBehaviorTally } from '../api';

/** From here up, a pattern rather than a bad week — worth a conversation. */
const REPEAT_THRESHOLD = 3;

/**
 * Who the term's entries are about, most-flagged first.
 *
 * Neither of the other two screens answers this: the monthly sheet is a diary and
 * the history is a page at a time, so a student who collects one entry a week goes
 * unnoticed in both. Ranked by entries that carried a warning or a deduction
 * rather than by raw count, because a bare observation is not an escalation.
 *
 * Only students who appear in the register are listed — unlike the attendance
 * summary, an absence from this table is the good outcome and padding it with the
 * whole roster would bury the few rows that matter.
 */
export function BehaviorTally() {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [semesterId, setSemesterId] = useState<string | undefined>();
  const effectiveSemesterId = semesterId ?? activeSemester.data?.id;

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const tally = useBehaviorTally(classroomId, effectiveSemesterId);
  const rows = tally.data ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="tally-classroom">{t('behaviorLog.classroom')}</Label>
            <EntitySelect
              id="tally-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('behaviorLog.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tally-semester">{t('behaviorLog.semester')}</Label>
            <Select value={effectiveSemesterId ?? ''} onValueChange={setSemesterId}>
              <SelectTrigger id="tally-semester">
                <SelectValue placeholder={t('behaviorLog.semester')} />
              </SelectTrigger>
              <SelectContent>
                {(semesterOptions.data ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId || !effectiveSemesterId ? (
            <EmptyState icon={BarChart3} title={t('behaviorLog.tallyHint')} />
          ) : tally.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : tally.error ? (
            <ErrorState error={tally.error} onRetry={tally.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={t('behaviorLog.emptyTally')}
              description={t('behaviorLog.emptyTallyHint')}
            />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('behaviorLog.studentName')}</TableHead>
                    <TableHead className="w-28">{t('behaviorLog.entryCount')}</TableHead>
                    <TableHead className="w-32">{t('behaviorLog.actionCount')}</TableHead>
                    <TableHead className="w-32">{t('behaviorLog.lastEntry')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell>
                        <Link
                          to={`/students/${row.studentId}`}
                          className="font-medium hover:underline"
                        >
                          <StudentName name={row.studentNameLo} nickname={row.studentNickname} />
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.studentCode ?? '—'}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{row.entries}</TableCell>
                      <TableCell>
                        {row.withAction === 0 ? (
                          <span className="tabular-nums text-muted-foreground">0</span>
                        ) : (
                          <Badge variant={row.withAction >= REPEAT_THRESHOLD ? 'danger' : 'warning'}>
                            {row.withAction}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(row.lastDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('behaviorLog.tallyNote')}</p>
    </div>
  );
}
