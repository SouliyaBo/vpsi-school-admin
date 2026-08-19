import { BarChart3, ClipboardList, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { BehaviorHistory } from '../components/BehaviorHistory';
import { BehaviorTally } from '../components/BehaviorTally';
import { MonthlySheet } from '../components/MonthlySheet';

/**
 * The behaviour register — where it is written, and read back two ways.
 *
 * The monthly sheet leads because it is the only tab that writes, and because it
 * is the document the school actually files. The other two exist because one
 * record answers questions the sheet cannot: a student's own history across
 * classes and months, and who a term's entries are accumulating against.
 */
export function BehaviorLogsPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

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
      </Tabs>
    </div>
  );
}
