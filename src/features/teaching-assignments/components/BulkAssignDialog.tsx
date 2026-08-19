import { zodResolver } from '@hookform/resolvers/zod';
import { BookOpen, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { subjectLabel, useSubjectsByGrade } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { stripEmpty } from '@/lib/payload';
import { notify } from '@/lib/toast';
import { fullName, refId, refObject } from '@/lib/utils';
import type { Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldsetMessage, Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import {
  teachingAssignments,
  useBulkCreateAssignments,
  type SchedulePeriodInput,
  type TeachingAssignmentInput,
} from '../api';
import {
  bulkAssignmentSchema,
  EMPTY_BULK_ASSIGNMENT,
  EMPTY_PERIOD,
  type BulkAssignmentFormValues,
} from '../schemas';
import { ConflictAlert } from './ConflictAlert';
import { ScheduleEditor } from './ScheduleEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSemesterId?: string;
}

/** What became of each subject once the batch ran. */
type Outcomes = Record<string, { error?: unknown }>;

/**
 * One teacher and one class, posted against several subjects in a single pass.
 *
 * The class is picked before the subjects, not after: a subject belongs to a
 * grade level, and the API refuses it in a class of any other — so the class is
 * what decides which subjects can even appear in the list below it.
 *
 * A partial failure is the normal case here (one subject already has that hour
 * booked), so the dialog stays open and keeps its state: created subjects settle
 * into a done row, the rest keep their editors and can be corrected and sent
 * again without re-entering the ones that worked.
 */
export function BulkAssignDialog({ open, onOpenChange, defaultSemesterId }: Props) {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const bulkCreate = useBulkCreateAssignments();

  const [outcomes, setOutcomes] = useState<Outcomes>({});

  const form = useForm<BulkAssignmentFormValues>({
    resolver: zodResolver(bulkAssignmentSchema),
    defaultValues: EMPTY_BULK_ASSIGNMENT,
  });
  const targets = useFieldArray({ control: form.control, name: 'targets' });

  const semesterId = form.watch('semesterId');
  const classroomId = form.watch('classroomId');

  const classroom = classrooms.useDetail(classroomId || undefined);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;
  const gradeSubjects = useSubjectsByGrade(gradeLevelId);

  // Which subjects this class is already taught, and by whom, so a duplicate is
  // visible before it is submitted rather than after the API rejects it.
  const existing = teachingAssignments.useList(
    { classroomId, semesterId, limit: 100 },
    { enabled: Boolean(classroomId && semesterId) },
  );
  const takenBy = new Map<string, string>();
  for (const assignment of existing.data?.data ?? []) {
    const subjectId = refId(assignment.subjectId);
    const teacher = refObject<Teacher>(assignment.teacherId);
    if (subjectId) takenBy.set(subjectId, teacher ? fullName(teacher, i18n.language) : '—');
  }

  const useSemestersForYear = (search: string) => useSemesterOptions(search, activeYear.data?.id);
  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);

  useEffect(() => {
    if (!open) return;
    bulkCreate.reset();
    setOutcomes({});
    form.reset({ ...EMPTY_BULK_ASSIGNMENT, semesterId: defaultSemesterId ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSemesterId, form]);

  // Another class can mean another grade, and the ticked subjects no longer
  // exist in the list below.
  useEffect(() => {
    targets.replace([]);
    setOutcomes({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId]);

  function toggleSubject(subject: Subject, checked: boolean) {
    const index = targets.fields.findIndex((field) => field.subjectId === subject.id);
    if (checked && index === -1) {
      targets.append({
        subjectId: subject.id,
        label: subjectLabel(subject, i18n.language),
        schedule: [{ ...EMPTY_PERIOD }],
      });
    } else if (!checked && index !== -1) {
      targets.remove(index);
    }
  }

  /** Never attempted, or attempted and rejected — either way it still has to go. */
  const stillPending = (subjectId: string) => Boolean(outcomes[subjectId]?.error ?? !outcomes[subjectId]);

  async function submit(values: BulkAssignmentFormValues) {
    const pending = values.targets.filter((target) => stillPending(target.subjectId));

    const items: TeachingAssignmentInput[] = pending.map((target) => ({
      teacherId: values.teacherId,
      classroomId: values.classroomId,
      semesterId: values.semesterId,
      subjectId: target.subjectId,
      schedule: stripEmpty(target.schedule) as SchedulePeriodInput[],
    }));

    const results = await bulkCreate.mutateAsync(items);

    const next: Outcomes = { ...outcomes };
    for (const result of results) next[result.subjectId] = { error: result.error };
    setOutcomes(next);

    const failed = results.filter((result) => result.error).length;
    const created = results.length - failed;

    if (failed === 0) {
      notify.success(t('assignment.bulkResult', { created, failed }));
      onOpenChange(false);
    } else {
      notify.warning(t('assignment.bulkResult', { created, failed }));
    }
  }

  const remaining = targets.fields.filter((field) => stillPending(field.subjectId)).length;
  const hasCreated = Object.values(outcomes).some((outcome) => !outcome.error);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('assignment.bulkTitle')}
      description={t('assignment.bulkHint')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={bulkCreate.isPending}
      submitLabel={
        hasCreated
          ? t('assignment.retryRemaining', { count: remaining })
          : t('assignment.createForSubjects', { count: remaining })
      }
      size="xl"
    >
      <Form {...form}>
        <div className="space-y-4">
          <FieldSection columns={3}>
            <EntitySelectField
              control={form.control}
              name="semesterId"
              label={t('assignment.semester')}
              required
              useOptions={useSemestersForYear}
              placeholder={t('assignment.selectSemester')}
            />
            <EntitySelectField
              control={form.control}
              name="classroomId"
              label={t('assignment.classroom')}
              required
              useOptions={useClassroomsForYear}
              placeholder={t('assignment.selectClassroom')}
              description={t('assignment.classPicksSubjects')}
            />
            <EntitySelectField
              control={form.control}
              name="teacherId"
              label={t('assignment.teacher')}
              required
              useOptions={useTeacherOptions}
              placeholder={t('assignment.selectTeacher')}
            />
          </FieldSection>

          <FieldSection title={t('assignment.pickSubjects')} columns={1}>
            {!gradeLevelId ? (
              <EmptyState icon={BookOpen} title={t('assignment.pickClassFirstForSubjects')} />
            ) : gradeSubjects.isLoading ? (
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-9 w-40" />
                ))}
              </div>
            ) : !gradeSubjects.data?.data.length ? (
              <EmptyState icon={BookOpen} title={t('assignment.noSubjectsInGrade')} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {gradeSubjects.data.data.map((subject) => {
                  const checked = targets.fields.some((field) => field.subjectId === subject.id);
                  const taken = takenBy.get(subject.id);

                  return (
                    // `htmlFor` on the Radix checkbox, which renders a <button> —
                    // a labelable element, so this both names it and makes the
                    // whole chip a hit target.
                    <label
                      key={subject.id}
                      htmlFor={`bulk-subject-${subject.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                    >
                      <Checkbox
                        id={`bulk-subject-${subject.id}`}
                        checked={checked}
                        onCheckedChange={(value) => toggleSubject(subject, value === true)}
                      />
                      <span>{subjectLabel(subject, i18n.language)}</span>
                      {taken && (
                        // Not disabled: the API allows a second teacher on the
                        // same subject, it is just rarely what was meant.
                        <Badge variant="warning">
                          {t('assignment.alreadyAssigned', { teacher: taken })}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            <FieldsetMessage control={form.control} name="targets" />
          </FieldSection>

          {targets.fields.map((field, index) => {
            const outcome = outcomes[field.subjectId];

            if (outcome && !outcome.error) {
              return (
                <div
                  key={field.id}
                  className="flex items-center gap-2 rounded-md border border-success/20 bg-success-subtle px-3 py-2 text-sm text-success"
                >
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  <span className="font-medium">{field.label}</span>
                  <span>{t('assignment.created')}</span>
                </div>
              );
            }

            return (
              <div key={field.id} className="space-y-2 rounded-md border border-border p-3">
                <p className="text-sm font-medium">{field.label}</p>
                <ScheduleEditor
                  control={form.control}
                  name={`targets.${index}.schedule`}
                  // The column headings belong to the group, not to each subject.
                  showHeader={index === 0}
                />
                {outcome?.error ? <ConflictAlert error={outcome.error} /> : null}
              </div>
            );
          })}
        </div>
      </Form>
    </FormDialog>
  );
}
