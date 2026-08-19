import { BookMarked, ClipboardList, Inbox, LayoutGrid, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useActiveSemester } from '@/features/semesters/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ComplianceMatrix } from '../components/ComplianceMatrix';
import { MonthlyChecklist } from '../components/MonthlyChecklist';
import { MyChecklist } from '../components/MyChecklist';
import { MyPlans } from '../components/MyPlans';
import { ReviewQueue } from '../components/ReviewQueue';

/**
 * Lesson plans, from the angles the people involved actually ask about.
 *
 * The tabs are split by question, not by record: the office issues a monthly
 * checklist and watches it fill in, a reviewer works a queue in deadline order,
 * oversight wants the derived grid of who is behind for the whole term, and a
 * teacher wants the two weeks in front of them. Which tab leads depends on the
 * account, because for each of them the others are someone else's job.
 *
 * The checklist and the matrix answer the same question two ways on purpose. The
 * matrix is derived and complete — every week of the term, no exceptions — which
 * makes it the audit view and also means it counts exam weeks as shortfalls. The
 * checklist is what the office decided is actually owed this month.
 */
export function LessonPlansPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeSemester = useActiveSemester();

  const canReview = can('lesson-plans', 'approve');

  // A head lands on the checklist they issue rather than the derived grid: it is
  // the one that is theirs to act on.
  const defaultTab = canReview ? 'checklist' : 'my-checklist';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('lessonPlan.title')}
        description={t('lessonPlan.subtitle')}
        actions={
          activeSemester.data && (
            <Badge variant="outline">{localizedName(activeSemester.data, i18n.language)}</Badge>
          )
        }
      />

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canReview && (
            <TabsTrigger value="checklist">
              <ClipboardList />
              {t('lessonPlan.checklistTab')}
            </TabsTrigger>
          )}
          {canReview && (
            <TabsTrigger value="compliance">
              <LayoutGrid />
              {t('lessonPlan.complianceTab')}
            </TabsTrigger>
          )}
          {canReview && (
            <TabsTrigger value="queue">
              <Inbox />
              {t('lessonPlan.queueTab')}
            </TabsTrigger>
          )}
          {/* Both teacher tabs are shown to a non-teacher too: each answers with
              "this account is not a teacher", which is what an office account
              trying to file a plan needs to be told. Hiding them told it nothing
              at all. */}
          <TabsTrigger value="my-checklist">
            <ListChecks />
            {t('lessonPlan.myChecklistTab')}
          </TabsTrigger>
          <TabsTrigger value="mine">
            <BookMarked />
            {t('lessonPlan.myPlansTab')}
          </TabsTrigger>
        </TabsList>

        {canReview && (
          <TabsContent value="checklist">
            <MonthlyChecklist />
          </TabsContent>
        )}
        {canReview && (
          <TabsContent value="compliance">
            <ComplianceMatrix />
          </TabsContent>
        )}
        {canReview && (
          <TabsContent value="queue">
            <ReviewQueue />
          </TabsContent>
        )}
        <TabsContent value="my-checklist">
          <MyChecklist />
        </TabsContent>
        <TabsContent value="mine">
          <MyPlans />
        </TabsContent>
      </Tabs>
    </div>
  );
}
