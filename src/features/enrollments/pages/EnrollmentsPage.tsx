import { ListChecks, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ClassRoster } from '../components/ClassRoster';
import { PlacementQueue } from '../components/PlacementQueue';

/**
 * Where placement is managed.
 *
 * Two views, because there are two questions: "who still needs a class?" (the
 * queue, at the start of a term) and "who is in this class?" (the roster, all
 * year, and where moves are made from).
 */
export function EnrollmentsPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('enrollment.title')}
        description={t('enrollment.queueHint')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
      />

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            <ListChecks />
            {t('enrollment.queue')}
          </TabsTrigger>
          <TabsTrigger value="roster">
            <Users />
            {t('enrollment.roster')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <PlacementQueue />
        </TabsContent>
        <TabsContent value="roster">
          <ClassRoster />
        </TabsContent>
      </Tabs>
    </div>
  );
}
