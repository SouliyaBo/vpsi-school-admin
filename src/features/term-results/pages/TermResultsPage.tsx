import { LayoutGrid, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ClassResultSheet } from '../components/ClassResultSheet';
import { StudentResultCard } from '../components/StudentResultCard';

/**
 * ຜົນການຮຽນ — the term result, in the two shapes the office hands out.
 *
 * Distinct from ຄະແນນ next door: nothing here is entered. The marks pages are
 * where a term is written, and this is where it is closed — the API derives the
 * result from those marks, stores it, and the office computes, checks and
 * publishes it. Publication is what a student or a guardian can see, so it is
 * deliberately a verb of this page and of nowhere else.
 *
 * The class sheet leads because compute and publish are class-wide — a rank means
 * nothing without the cohort it was taken in. The card is the same stored figures
 * turned round for one child, which is what the counter is asked for.
 */
export function TermResultsPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('termResult.title')}
        description={t('termResult.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
        // The printed sheet carries its own heading.
        className="print:hidden"
      />

      <Tabs defaultValue="class">
        <TabsList className="print:hidden">
          <TabsTrigger value="class">
            <LayoutGrid />
            {t('termResult.tab')}
          </TabsTrigger>
          <TabsTrigger value="student">
            <UserRound />
            {t('termResult.studentTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="class">
          <ClassResultSheet />
        </TabsContent>
        <TabsContent value="student">
          <StudentResultCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
