import { ArrowLeft, ClipboardList, FileText, ListChecks, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { localizedName, refObject } from '@/lib/utils';
import type { Classroom, Subject } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { useDeleteExamPaper, useExamPaper, useSourceUrl } from '../api';
import { QuestionEditor } from '../components/QuestionEditor';
import { ResultsPanel } from '../components/ResultsPanel';
import { SetsPanel } from '../components/SetsPanel';

/**
 * One paper: review on the left tab, sets on the right.
 *
 * Opens on the review, because that is the step the upload lands on and the
 * one nobody should skip; a paper with sets already drawn opens on the sets,
 * since a teacher coming back to it is coming back to print — or, after the
 * exam, to the results tab beside it.
 */
export function ExamPaperDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const can = useCan();
  const paper = useExamPaper(id);
  const remove = useDeleteExamPaper();
  const openSource = useSourceUrl(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (paper.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (paper.error || !paper.data) {
    return <ErrorState error={paper.error} onRetry={paper.refetch} />;
  }

  const data = paper.data;
  const readOnly = !can('exam-papers', 'update');
  const subject = refObject<Subject>(data.subjectId);
  const classroom = refObject<Classroom>(data.classroomId);
  const under = [
    subject ? localizedName(subject, i18n.language) : null,
    classroom?.name ?? null,
    t('examPaper.questionCount', { count: data.questions.length }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ms-2">
        <Link to="/exam-papers">
          <ArrowLeft />
          {t('examPaper.backToList')}
        </Link>
      </Button>

      <PageHeader
        title={data.title}
        description={under}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data.variants.length > 0 ? (
              <Badge>{t('examPaper.setCount', { count: data.variants.length })}</Badge>
            ) : (
              <Badge variant="outline">{t('examPaper.noSets')}</Badge>
            )}
            {data.source && (
              <Button
                variant="outline"
                size="sm"
                disabled={openSource.isPending}
                onClick={() => openSource.mutate()}
              >
                <FileText />
                {t('examPaper.downloadSource')}
              </Button>
            )}
            {can('exam-papers', 'delete') && (
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="text-destructive" />
                {t('examPaper.delete')}
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue={data.variants.length > 0 ? 'sets' : 'review'}>
        <TabsList>
          <TabsTrigger value="review">
            <ListChecks />
            {t('examPaper.reviewTab')}
          </TabsTrigger>
          <TabsTrigger value="sets">
            <Shuffle />
            {t('examPaper.setsTab')}
          </TabsTrigger>
          <TabsTrigger value="results">
            <ClipboardList />
            {t('examPaper.resultsTab')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="review">
          <QuestionEditor paper={data} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="sets">
          <SetsPanel paper={data} readOnly={readOnly} />
        </TabsContent>
        <TabsContent value="results">
          <ResultsPanel paper={data} readOnly={readOnly} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('examPaper.deleteTitle')}
        description={t('examPaper.deleteDescription')}
        confirmLabel={t('examPaper.delete')}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => remove.mutate(data.id, { onSuccess: () => navigate('/exam-papers') })}
      />
    </div>
  );
}
