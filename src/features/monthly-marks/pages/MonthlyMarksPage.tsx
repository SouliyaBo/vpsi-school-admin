import { CalendarDays, CalendarRange, FileBarChart, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { AnnualSheet } from '../components/AnnualSheet';
import { ClassMonthSheet } from '../components/ClassMonthSheet';
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
 * ສະຫຼຸບປະຈຳເດືອນ is the one tab that crosses the subjects with each other, which
 * none of the per-subject sheets can do: it is the month the school reads out and
 * ranks on, derived live from the same cells.
 *
 * Where the term is *closed* is next door, under ຜົນການຮຽນ: that result is stored
 * rather than derived, and computing and publishing it is the office's job, not a
 * teacher's. Nothing on this page publishes anything.
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
          <TabsTrigger value="month">
            <CalendarDays />
            {t('monthlyMark.monthTab')}
          </TabsTrigger>
          <TabsTrigger value="semester">
            <CalendarRange />
            {t('monthlyMark.semesterTab')}
          </TabsTrigger>
          <TabsTrigger value="annual">
            <FileBarChart />
            {t('monthlyMark.annualTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entry">
          <MonthGridForm />
        </TabsContent>
        <TabsContent value="month">
          <ClassMonthSheet />
        </TabsContent>
        <TabsContent value="semester">
          <SemesterSheet />
        </TabsContent>
        <TabsContent value="annual">
          <AnnualSheet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
