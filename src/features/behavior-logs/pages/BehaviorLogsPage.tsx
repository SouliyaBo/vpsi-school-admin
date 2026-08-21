import { BarChart3, CalendarCheck, ClipboardList, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { BehaviorHistory } from '../components/BehaviorHistory';
import { BehaviorTally } from '../components/BehaviorTally';
import { MonthlySheet } from '../components/MonthlySheet';
import { MyWeekReminder } from '../components/MyWeekReminder';
import { WeeklyCoverage } from '../components/WeeklyCoverage';

/**
 * The behaviour register — where it is written, and read back two ways.
 *
 * The monthly sheet leads because it is the only tab that writes, and because it
 * is the document the school actually files. The other two exist because one
 * record answers questions the sheet cannot: a student's own history across
 * classes and months, and who a term's entries are accumulating against.
 *
 * The weekly reminder sits above the tabs rather than inside one, because it is
 * the only thing here that is true whichever tab is open: a register nobody wrote
 * in this week is not visible from any of them. Its oversight twin is a tab of its
 * own, and only for the accounts whose job that is — `behavior-logs:manage`, held
 * by the administrator and the head of academic affairs.
 */
export function BehaviorLogsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const oversees = can('behavior-logs', 'manage');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('behaviorLog.title')}
        description={t('behaviorLog.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
        // The printed sheet carries its own heading; the app's page header would
        // be a second title on the page.
        className="print:hidden"
      />

      {/* Scoped server-side to the account's own lessons, so it says nothing at
          all to an account that teaches none. */}
      <MyWeekReminder />

      <Tabs defaultValue="sheet">
        <TabsList className="print:hidden">
          <TabsTrigger value="sheet">
            <ClipboardList />
            {t('behaviorLog.sheetTab')}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History />
            {t('behaviorLog.historyTab')}
          </TabsTrigger>
          <TabsTrigger value="tally">
            <BarChart3 />
            {t('behaviorLog.tallyTab')}
          </TabsTrigger>
          {oversees && (
            <TabsTrigger value="coverage">
              <CalendarCheck />
              {t('behaviorLog.coverageTab')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sheet">
          <MonthlySheet />
        </TabsContent>
        <TabsContent value="history">
          <BehaviorHistory />
        </TabsContent>
        <TabsContent value="tally">
          <BehaviorTally />
        </TabsContent>
        {oversees && (
          <TabsContent value="coverage">
            <WeeklyCoverage />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
