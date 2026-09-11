import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { stripEmpty } from '@/lib/payload';
import { fullName, refId, toDateInput } from '@/lib/utils';
import { optionalNumber, optionalText, requiredDate, requiredId } from '@/lib/zod-helpers';
import type { TeachingObservation } from '@/types/entities';
import { Skeleton } from '@/components/ui/skeleton';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { DateField, FieldSection, NumberField, TextareaField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import {
  scoreMap,
  useCreateObservation,
  useObservationRubric,
  useUpdateObservation,
  type ObservationScoreInput,
} from '../api';
import { ObservationScoreTable } from './ObservationScoreTable';

/**
 * The head of the sheet.
 *
 * `observerId` is the field the school's paper form does not have — without it a
 * filed stack of sheets cannot say who sat at the back of which room. It is
 * required here and pre-filled with the signed-in teacher, so the ordinary case
 * costs nobody a decision; the office may name somebody else, which is what
 * keying in a deputy's handwritten sheet looks like.
 *
 * `visitNumber` is optional because the API counts it — the teacher's next visit
 * of the term. It is offered anyway for the case the paper sheet already has a
 * number on it and the two must agree.
 */
const schema = z.object({
  teacherId: requiredId(),
  observerId: requiredId(),
  subjectId: requiredId(),
  classroomId: requiredId(),
  semesterId: requiredId(),
  observedAt: requiredDate(),
  visitNumber: optionalNumber({ min: 1 }),
  note: optionalText(2000),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  teacherId: '',
  observerId: '',
  subjectId: '',
  classroomId: '',
  semesterId: '',
  observedAt: '',
  visitNumber: undefined,
  note: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` starts a new sheet; a record edits a draft. */
  observation: TeachingObservation | null;
  defaultSemesterId?: string;
}

export function ObservationFormDialog({
  open,
  onOpenChange,
  observation,
  defaultSemesterId,
}: Props) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const me = useCurrentUser();
  const rubric = useObservationRubric();
  const create = useCreateObservation();
  const update = useUpdateObservation();

  /**
   * The six marks, held outside react-hook-form.
   *
   * The rubric arrives over the network, so the field set is not known when the
   * resolver is built; and there is nothing here for a resolver to check that
   * the number inputs do not already enforce. Whether the sheet is complete is
   * the API's rule, applied when it is filed rather than while it is being
   * filled in at the back of a classroom.
   */
  const [scores, setScores] = useState<Record<string, number | null>>({});

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  /** The office may file under another teacher's name; everyone else may not. */
  const mayNameAnotherObserver = can('teaching-observations', 'manage');
  const ownTeacherId = me?.personType === 'teacher' ? (me.personId ?? '') : '';

  useEffect(() => {
    if (!open) return;

    if (observation) {
      form.reset({
        teacherId: refId(observation.teacherId) ?? '',
        observerId: refId(observation.observerId) ?? '',
        subjectId: refId(observation.subjectId) ?? '',
        classroomId: refId(observation.classroomId) ?? '',
        semesterId: refId(observation.semesterId) ?? '',
        observedAt: toDateInput(observation.observedAt),
        visitNumber: observation.visitNumber,
        note: observation.note ?? '',
      });
      setScores(Object.fromEntries(scoreMap(observation)));
      return;
    }

    form.reset({
      ...EMPTY,
      observerId: ownTeacherId,
      semesterId: defaultSemesterId ?? '',
      // Today, because an observation is written on the day it happens. A blank
      // date on a form filled in at the back of a room is a field somebody has
      // to stop and think about for no reason.
      observedAt: toDateInput(new Date()),
    });
    setScores({});
  }, [open, observation, form, ownTeacherId, defaultSemesterId]);

  const observedTeacherId = form.watch('teacherId');

  /**
   * The observed teacher cannot also be the observer.
   *
   * The API refuses the pair; disabling it here is what stops somebody filling
   * in a whole sheet before finding that out.
   */
  // Named `use…` wrappers rather than arrows inline on the prop: `EntitySelect`
  // calls these as hooks, and only this shape is one the lint can see through.
  const useTaughtSubjectOptions = (search: string) => useSubjectOptions(search, undefined, 'taught');
  const useAnyClassroomOptions = (search: string) => useClassroomOptions(search);
  const useAnySemesterOptions = (search: string) => useSemesterOptions(search);

  const useObserverOptions = (search: string) => {
    const query = useTeacherOptions(search);
    return {
      isLoading: query.isLoading,
      data: query.data?.filter((option) => option.value !== observedTeacherId),
    };
  };

  const scoresPayload = (): ObservationScoreInput[] =>
    Object.entries(scores).map(([criterion, score]) => ({ criterion, score }));

  function submit(values: FormValues) {
    const body = stripEmpty({ ...values, scores: scoresPayload() });

    if (observation) {
      // `teacherId` is not sent: a sheet filed against the wrong colleague is
      // withdrawn and rewritten, never reassigned under the same heading.
      const { teacherId: _teacherId, semesterId: _semesterId, visitNumber: _visit, ...rest } = body;
      update.mutate(
        { id: observation.id, body: rest },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }

    create.mutate(body, { onSuccess: () => onOpenChange(false) });
  }

  const isSubmitting = create.isPending || update.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={observation ? t('observation.editSheet') : t('observation.newSheet')}
      description={t('observation.sheetSubtitle')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={isSubmitting}
      size="xl"
      submitLabel={t('observation.saveDraft')}
    >
      <Form {...form}>
        <div className="space-y-5">
          <FieldSection title={t('observation.headingSection')}>
            <EntitySelectField
              control={form.control}
              name="teacherId"
              label={t('observation.observedTeacher')}
              required
              // Fixed once the sheet exists — see `submit`.
              disabled={Boolean(observation)}
              useOptions={useTeacherOptions}
              selectedLabel={
                observation
                  ? fullName(
                      typeof observation.teacherId === 'object' ? observation.teacherId : null,
                      i18n.language,
                    )
                  : undefined
              }
            />

            <EntitySelectField
              control={form.control}
              name="observerId"
              label={t('observation.observer')}
              description={
                mayNameAnotherObserver
                  ? t('observation.observerOfficeHint')
                  : t('observation.observerSelfHint')
              }
              required
              disabled={!mayNameAnotherObserver}
              useOptions={useObserverOptions}
            />

            <EntitySelectField
              control={form.control}
              name="subjectId"
              label={t('observation.subject')}
              required
              useOptions={useTaughtSubjectOptions}
            />

            <EntitySelectField
              control={form.control}
              name="classroomId"
              label={t('observation.classroom')}
              required
              useOptions={useAnyClassroomOptions}
            />

            <EntitySelectField
              control={form.control}
              name="semesterId"
              label={t('observation.semester')}
              required
              disabled={Boolean(observation)}
              useOptions={useAnySemesterOptions}
            />

            <DateField
              control={form.control}
              name="observedAt"
              label={t('observation.observedAt')}
              required
            />

            <NumberField
              control={form.control}
              name="visitNumber"
              label={t('observation.visitNumber')}
              description={t('observation.visitNumberHint')}
              min={1}
              step={1}
              disabled={Boolean(observation)}
            />
          </FieldSection>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('observation.scoringSection')}
            </h3>

            {rubric.isLoading || !rubric.data ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ObservationScoreTable
                criteria={rubric.data.criteria}
                values={scores}
                criterionMaxScore={rubric.data.criterionMaxScore}
                maxTotal={rubric.data.maxTotal}
                disabled={isSubmitting}
                onChange={(criterion, score) =>
                  setScores((previous) => ({ ...previous, [criterion]: score }))
                }
              />
            )}

            <p className="text-xs text-muted-foreground">{t('observation.scoringHint')}</p>
          </div>

          <TextareaField
            control={form.control}
            name="note"
            label={t('observation.note')}
            description={t('observation.noteHint')}
            rows={3}
          />
        </div>
      </Form>
    </FormDialog>
  );
}
