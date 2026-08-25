import { CalendarRange, FileBarChart, LayoutGrid, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { ClassResultSheet } from '@/features/term-results/components/ClassResultSheet';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { AnnualSheet } from '../components/AnnualSheet';
import { MonthGridForm } from '../components/MonthGridForm';
import { SemesterSheet } from '../components/SemesterSheet';

/**
 * ຄະແນນ — the school's mark sheet, in the three shapes it is actually used in.
 *
 * The form leads because it is the only tab that writes and the only one a
 * teacher opens every month. The term sheet is what the office reads and signs
 * off, and the year is what gets handed on. All of them are the same rows:
 * nothing here is a second copy of a mark, so a cell corrected in the form moves
 * the term, the year and the class result with it.
 *
 * The last tab crosses the subjects with each other — one class, every subject,
 * ranked — which none of the per-subject sheets can do. It reads the stored term
 * result, so it is also where the office computes and publishes.
 */
export function MonthlyMarksPage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('monthlyMark.title')}
        description={t('monthlyMark.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
        // The printed sheet carries its own heading.
        className="print:hidden"
      />

      <Tabs defaultValue="entry">
        <TabsList className="print:hidden">
          <TabsTrigger value="entry">
            <PencilLine />
            {t('monthlyMark.entryTab')}
          </TabsTrigger>
          <TabsTrigger value="semester">
            <CalendarRange />
            {t('monthlyMark.semesterTab')}
          </TabsTrigger>
          <TabsTrigger value="annual">
            <FileBarChart />
            {t('monthlyMark.annualTab')}
          </TabsTrigger>
          <TabsTrigger value="class">
            <LayoutGrid />
            {t('termResult.tab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entry">
          <MonthGridForm />
        </TabsContent>
        <TabsContent value="semester">
          <SemesterSheet />
        </TabsContent>
        <TabsContent value="annual">
          <AnnualSheet />
        </TabsContent>
        <TabsContent value="class">
          <ClassResultSheet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
