import { ClipboardCheck, FileCheck2, FileText, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useActiveSemester } from '@/features/semesters/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { MonthlyReport } from '../components/MonthlyReport';
import { MonthlyReportCompliance } from '../components/MonthlyReportCompliance';
import { ReviewCompliance } from '../components/ReviewCompliance';
import { ReviewDueBanner } from '../components/ReviewDueBanner';
import { ReviewSheet } from '../components/ReviewSheet';

/**
 * ການຕິດຕາມນັກຮຽນຂອງຄູປະຈຳຫ້ອງ.
 *
 * Two audiences in one place, and the sheet leads because it is the only tab that
 * writes: everything the office reads here exists because a homeroom teacher
 * pressed the button on the first tab.
 *
 * The oversight tab is gated on `homeroom-reviews:manage`, the same way the
 * register's coverage and punctuality tabs are — it names other people's work, so
 * it is the administrator's and the head of academic affairs', and is not merely
 * hidden from a teacher who could still call the endpoint.
 */
export function HomeroomReviewsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const semester = useActiveSemester();

  const oversees = can('homeroom-reviews', 'manage');

  /**
   * Which tab is open lives in the URL alongside the room and the day.
   *
   * It is what lets the compliance grid hand the office straight to the sheet for
   * the room it just named — a link that arrived on the wrong tab would leave
   * the reader to find the room again by hand.
   */
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab =
    (requested === 'compliance' || requested === 'report-compliance') && oversees
      ? requested
      : requested === 'report'
        ? 'report'
        : 'sheet';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('homeroomReview.title')}
        description={t('homeroomReview.subtitle')}
        actions={
          semester.data && (
            <Badge variant="outline">{localizedName(semester.data, i18n.language)}</Badge>
          )
        }
        className="print:hidden"
      />

      {/* Scoped server-side to the account's own homeroom, so it says nothing to
          an office account. */}
      <div className="print:hidden">
        <ReviewDueBanner />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set('tab', value);
          setParams(next, { replace: true });
        }}
      >
        <TabsList className="print:hidden">
          <TabsTrigger value="sheet">
            <ClipboardCheck />
            {t('homeroomReview.sheetTab')}
          </TabsTrigger>
          <TabsTrigger value="report">
            <FileText />
            {t('homeroomReview.reportTab')}
          </TabsTrigger>
          {oversees && (
            <TabsTrigger value="report-compliance">
              <FileCheck2 />
              {t('homeroomReview.reportComplianceTab')}
            </TabsTrigger>
          )}
          {oversees && (
            <TabsTrigger value="compliance">
              <Users />
              {t('homeroomReview.complianceTab')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="sheet">
          <ReviewSheet />
        </TabsContent>
        <TabsContent value="report">
          <MonthlyReport />
        </TabsContent>
        {oversees && (
          <TabsContent value="report-compliance">
            <MonthlyReportCompliance />
          </TabsContent>
        )}
        {oversees && (
          <TabsContent value="compliance">
            <ReviewCompliance />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
