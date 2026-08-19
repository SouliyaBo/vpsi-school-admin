import { BarChart3, ClipboardCheck, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
 */
export function AttendancesPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

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
      />

      <Tabs defaultValue="rollcall">
        <TabsList>
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
      </Tabs>
    </div>
  );
}
