import { BarChart3, FileBadge, History, LayoutGrid, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { useRequestedTab } from '@/lib/use-requested-tab';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { AttendanceSummaryPanel } from '../components/AttendanceSummaryPanel';
import { GeneratedReportsTable } from '../components/GeneratedReportsTable';
import { MonthlyStandingPanel } from '../components/MonthlyStandingPanel';
import { ReportCardsPanel } from '../components/ReportCardsPanel';
import { ReportCatalogue } from '../components/ReportCatalogue';

/**
 * ລາຍງານ — where the school's reports are found.
 *
 * Most reports are built beside the data they summarise and stay there; the
 * first tab lists them all with a link to each. The ones that belong to no other
 * page live here: the month's results banded across every class, the class pack
 * of ໃບຄະແນນ, which the API renders as a PDF, and the attendance summary across
 * every class. A homeroom teacher sees the same
 * page narrowed to their own room — the API holds them to it as well.
 */
export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const makesCards = can('reports', 'create');
  const readsAttendance = can('attendances', 'read');
  const readsMarks = can('scores', 'read');
  const initialTab = useRequestedTab(
    [
      'catalogue',
      ...(readsMarks ? ['standing'] : []),
      ...(makesCards ? ['cards'] : []),
      ...(readsAttendance ? ['attendance'] : []),
      'history',
    ],
    'catalogue',
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('report.title')}
        description={t('report.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
      />

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="catalogue">
            <LayoutGrid />
            {t('report.tabs.catalogue')}
          </TabsTrigger>
          {readsMarks && (
            <TabsTrigger value="standing">
              <TrendingUp />
              {t('report.tabs.standing')}
            </TabsTrigger>
          )}
          {makesCards && (
            <TabsTrigger value="cards">
              <FileBadge />
              {t('report.tabs.cards')}
            </TabsTrigger>
          )}
          {readsAttendance && (
            <TabsTrigger value="attendance">
              <BarChart3 />
              {t('report.tabs.attendance')}
            </TabsTrigger>
          )}
          <TabsTrigger value="history">
            <History />
            {t('report.tabs.history')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogue">
          <ReportCatalogue />
        </TabsContent>
        {readsMarks && (
          <TabsContent value="standing">
            <MonthlyStandingPanel />
          </TabsContent>
        )}
        {makesCards && (
          <TabsContent value="cards">
            <ReportCardsPanel />
          </TabsContent>
        )}
        {readsAttendance && (
          <TabsContent value="attendance">
            <AttendanceSummaryPanel />
          </TabsContent>
        )}
        <TabsContent value="history">
          <GeneratedReportsTable params={{}} paged emptyHint={t('report.history.emptyHint')} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
