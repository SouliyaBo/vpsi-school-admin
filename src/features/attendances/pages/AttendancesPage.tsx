import { BarChart3, CalendarCheck, ClipboardCheck, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { CoverageReport } from '@/features/coverage/CoverageReport';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { AttendanceHistory } from '../components/AttendanceHistory';
import { ClassroomSummary } from '../components/ClassroomSummary';
import { RollCallSheet } from '../components/RollCallSheet';

/**
 * Where attendance is taken and read back.
 *
 * Three tabs, because one record answers three questions asked by different
 * people at different times: the class takes roll today, the office looks up one
 * day for one student, and a homeroom teacher wants the term's absences. The
 * roll-call sheet leads, since it is the only one that writes.
 *
 * A fourth asks the question none of them can: which lesson was never marked at
 * all. Every other tab reads records that exist, so an unmarked class is invisible
 * from all of them — it is the absence of a record, not an absent student. That one
 * reports on other people's work, so it is only for the accounts whose job that is
 * — `attendances:manage`, held by the administrator and the head of academic
 * affairs — and it is the same report, and the same component, as the behaviour
 * register's, differing only in the rule the server judges by.
 */
export function AttendancesPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const can = useCan();

  const oversees = can('attendances', 'manage');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('attendance.title')}
        description={t('attendance.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
        // The printed coverage report carries its own heading; the app's page
        // header would be a second title on the page.
        className="print:hidden"
      />

      <Tabs defaultValue="rollcall">
        <TabsList className="print:hidden">
          <TabsTrigger value="rollcall">
            <ClipboardCheck />
            {t('attendance.rollCallTab')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History />
            {t('attendance.historyTab')}
          </TabsTrigger>
          <TabsTrigger value="summary">
            <BarChart3 />
            {t('attendance.summaryTab')}
          </TabsTrigger>
          {oversees && (
            <TabsTrigger value="coverage">
              <CalendarCheck />
              {t('attendance.coverageTab')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="rollcall">
          <RollCallSheet />
        </TabsContent>
        <TabsContent value="history">
          <AttendanceHistory />
        </TabsContent>
        <TabsContent value="summary">
          <ClassroomSummary />
        </TabsContent>
        {oversees && (
          <TabsContent value="coverage">
            <CoverageReport kind="attendance" />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
