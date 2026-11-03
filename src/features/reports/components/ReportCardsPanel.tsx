import { FileDown, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useSeesEveryStudent } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EntitySelect } from '@/components/common/EntitySelect';
import { useQueueClassPack } from '../api';
import { GeneratedReportsTable } from './GeneratedReportsTable';

/**
 * ໃບຄະແນນ for a whole class — one PDF, a card per student down the register.
 *
 * The cards are printed from the stored term result, so they say exactly what
 * the class sheet on ຜົນການຮຽນ says: a term that has not been computed has no
 * cards, and the API says so rather than printing blanks. A homeroom teacher is
 * offered only their own room, which is also all the API will make for them.
 */
export function ReportCardsPanel() {
  const { t } = useTranslation();
  const seesEveryStudent = useSeesEveryStudent();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();
  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useRooms = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id, !seesEveryStudent);

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [pickedSemesterId, setSemesterId] = useState<string | undefined>();
  const semesterId = pickedSemesterId ?? activeSemester.data?.id;

  const queue = useQueueClassPack();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-card-classroom">{t('report.cards.classroom')}</Label>
              <EntitySelect
                id="report-card-classroom"
                value={classroomId ?? null}
                onChange={(id) => setClassroomId(id ?? undefined)}
                useOptions={useRooms}
                placeholder={t('report.cards.pickClassroom')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-card-semester">{t('report.cards.semester')}</Label>
              <Select value={semesterId ?? ''} onValueChange={setSemesterId}>
                <SelectTrigger id="report-card-semester">
                  <SelectValue placeholder={t('report.cards.semester')} />
                </SelectTrigger>
                <SelectContent>
                  {(semesterOptions.data ?? []).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full sm:w-auto"
                disabled={!classroomId || !semesterId || queue.isPending}
                onClick={() => {
                  if (!classroomId || !semesterId) return;
                  queue.mutate(
                    { classroomId, semesterId },
                    {
                      onSuccess: () => notify.success(t('report.cards.queued')),
                      onError: (error) => notify.error(error),
                    },
                  );
                }}
              >
                <FileDown />
                {t('report.cards.generate')}
              </Button>
            </div>
          </div>

          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {t('report.cards.hint')}{' '}
              <Link to="/term-results?tab=class" className="text-primary underline">
                {t('report.cards.termResultsLink')}
              </Link>
            </span>
          </p>
        </CardContent>
      </Card>

      {classroomId && semesterId && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t('report.cards.recent')}
          </h2>
          <GeneratedReportsTable
            params={{ classroomId, semesterId }}
            emptyHint={t('report.cards.noneYet')}
          />
        </section>
      )}
    </div>
  );
}
