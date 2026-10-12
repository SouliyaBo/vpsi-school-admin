import { BookCopy, BookMarked, BookOpen, Gift, HandHelping, NotebookPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntitySelect } from '@/components/common/EntitySelect';
import { PageHeader } from '@/components/common/PageHeader';
import { useSchoolYearOptions } from '@/features/school-years/api';
import { BookCountEditor } from '../components/BookCountEditor';
import { BookLoanList } from '../components/BookLoanList';
import { BookTitleList } from '../components/BookTitleList';
import { WorkbookSalesEditor } from '../components/WorkbookSalesEditor';

const TABS = ['teacher_guide', 'textbook', 'donated', 'reference', 'workbook', 'loans'] as const;
type Tab = (typeof TABS)[number];

const ICONS: Record<Tab, typeof BookOpen> = {
  teacher_guide: BookMarked,
  textbook: BookOpen,
  donated: Gift,
  reference: BookCopy,
  workbook: NotebookPen,
  loans: HandHelping,
};

/** The tabs kept per school year — the year picker only means something on these. */
const BY_YEAR: Tab[] = ['teacher_guide', 'textbook', 'workbook'];

/**
 * ຄັງປື້ມ — every book the school keeps a record of, one tab per sheet the office
 * used to keep on paper. The tab and the school year live in the URL.
 */
export function LibraryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'teacher_guide';
  const schoolYearId = params.get('schoolYearId') ?? undefined;
  const years = useSchoolYearOptions();

  const set = (key: 'tab' | 'schoolYearId', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('library.pageTitle')}
        description={t('library.pageSubtitle')}
        actions={
          BY_YEAR.includes(tab) && (
            <div className="w-48">
              <EntitySelect
                id="library-year"
                value={schoolYearId ?? null}
                onChange={(value) => set('schoolYearId', value ?? null)}
                useOptions={useSchoolYearOptions}
                selectedLabel={years.data?.find((option) => option.value === schoolYearId)?.label}
                placeholder={t('library.activeYear')}
              />
            </div>
          )
        }
      />
      <Tabs value={tab} onValueChange={(value) => set('tab', value)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {TABS.map((key) => {
            const Icon = ICONS[key];
            return (
              <TabsTrigger key={key} value={key}>
                <Icon />
                {t(`library.tabs.${key}`)}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value="teacher_guide">
          <BookCountEditor category="teacher_guide" schoolYearId={schoolYearId} />
        </TabsContent>
        <TabsContent value="textbook">
          <BookCountEditor category="textbook" schoolYearId={schoolYearId} />
        </TabsContent>
        <TabsContent value="donated">
          <BookTitleList category="donated" />
        </TabsContent>
        <TabsContent value="reference">
          <BookTitleList category="reference" />
        </TabsContent>
        <TabsContent value="workbook">
          <WorkbookSalesEditor schoolYearId={schoolYearId} />
        </TabsContent>
        <TabsContent value="loans">
          <BookLoanList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
