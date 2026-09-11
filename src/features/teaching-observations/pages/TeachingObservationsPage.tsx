import { BarChart3, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ObservationList } from '../components/ObservationList';
import { ObservationSummary } from '../components/ObservationSummary';

/**
 * ຕິດຕາມການສອນຂອງຄູ — the classroom-observation sheet, in two tabs.
 *
 * The sheets lead: that is what a teacher opens the page to write, and what the
 * teacher observed opens it to read. The summary is the academic office's view
 * of the same records and is shown only to whoever can see more than their own
 * handful of sheets — for anybody else it would be a table of one row.
 */
export function TeachingObservationsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const seesEverybody = can('teaching-observations', 'manage');

  return (
    <div className="space-y-4">
      <PageHeader title={t('observation.title')} description={t('observation.subtitle')} />

      <Tabs defaultValue="sheets">
        <TabsList>
          <TabsTrigger value="sheets">
            <ClipboardList />
            {t('observation.sheetsTab')}
          </TabsTrigger>
          {seesEverybody && (
            <TabsTrigger value="summary">
              <BarChart3 />
              {t('observation.summaryTab')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sheets">
          <ObservationList />
        </TabsContent>
        {seesEverybody && (
          <TabsContent value="summary">
            <ObservationSummary />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
