import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { classroomLabel, classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { stripEmpty } from '@/lib/payload';
import { fullName, localizedName, refId, refObject } from '@/lib/utils';
import type { Classroom, Subject, Teacher, TeachingAssignment } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, TextareaField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import {
  useCreateAssignment,
  useUpdateAssignment,
  type TeachingAssignmentInput,
} from '../api';
import { assignmentSchema, EMPTY_ASSIGNMENT, type AssignmentFormValues } from '../schemas';
import { ConflictAlert } from './ConflictAlert';
import { ScheduleEditor } from './ScheduleEditor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` while creating. */
  assignment: TeachingAssignment | null;
  /** Pre-selects the semester on a new assignment, from the list's filter. */
  defaultSemesterId?: string;
}

/**
 * Create or edit one teacher–subject–class posting.
 *
 * Editing only reaches the schedule, the notes and the active flag: the four
 * references form the record's unique key, so moving a subject to another
 * teacher means retiring this assignment and making a new one. They are shown
 * as read-only text so the row being edited is still identifiable.
 */
export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  defaultSemesterId,
}: Props) {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const isEditing = assignment !== null;

  const create = useCreateAssignment();
  const update = useUpdateAssignment();

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: EMPTY_ASSIGNMENT,
  });

  const classroomId = form.watch('classroomId');

  /**
   * A subject belongs to a grade level, and the API rejects one that does not
   * match the class. Reading the grade off the chosen classroom is what lets the
   * picker offer only subjects that can actually be assigned.
   */
  const classroom = classrooms.useDetail(classroomId || undefined);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;

  const useSemestersForYear = (search: string) =>
    useSemesterOptions(search, activeYear.data?.id);
  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);
  const useSubjectsForGrade = (search: string) => useSubjectOptions(search, gradeLevelId);

  useEffect(() => {
    if (!open) return;
    create.reset();
    update.reset();

    form.reset(
      assignment
        ? {
            teacherId: refId(assignment.teacherId) ?? '',
            subjectId: refId(assignment.subjectId) ?? '',
            classroomId: refId(assignment.classroomId) ?? '',
            semesterId: refId(assignment.semesterId) ?? '',
            // Every field of the period is copied. A missing one does not merely
            // show blank: the schedule is replaced wholesale on save, so whatever
            // the form failed to load is what the next save erases.
            schedule: assignment.schedule.map((period) => ({
              dayOfWeek: period.dayOfWeek,
              startTime: period.startTime,
              endTime: period.endTime,
              room: period.room ?? '',
              periodNumber: period.periodNumber ?? undefined,
              isRotating: period.isRotating ?? false,
            })),
            notes: assignment.notes ?? '',
          }
        : { ...EMPTY_ASSIGNMENT, semesterId: defaultSemesterId ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, assignment, defaultSemesterId, form]);

  // A different class can mean a different grade, and with it a different set of
  // subjects — keeping the old pick would submit a mismatch.
  const previousClassroomId = useRef(classroomId);
  useEffect(() => {
    if (previousClassroomId.current === classroomId) return;
    previousClassroomId.current = classroomId;
    if (!isEditing) form.setValue('subjectId', '');
  }, [classroomId, isEditing, form]);

  function submit(values: AssignmentFormValues) {
    const mutation = assignment
      ? update.mutateAsync({
          id: assignment.id,
          body: {
            schedule: stripEmpty(values.schedule),
            // Sent even when blank, so notes can be cleared.
            notes: values.notes ?? '',
          },
        })
      : create.mutateAsync(stripEmpty(values) as TeachingAssignmentInput);

    void mutation.then(() => onOpenChange(false)).catch(() => {});
  }

  const saveError = create.error ?? update.error;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t('assignment.edit') : t('assignment.create')}
      description={isEditing ? describe(assignment, i18n.language) : undefined}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending}
      size="xl"
    >
      <Form {...form}>
        <div className="space-y-4">
          {!isEditing && (
            <FieldSection>
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
              />
              <EntitySelectField
                control={form.control}
                name="subjectId"
                label={t('assignment.subject')}
                required
                useOptions={useSubjectsForGrade}
                disabled={!gradeLevelId}
                description={
                  gradeLevelId ? t('assignment.subjectGradeHint') : t('assignment.pickClassFirst')
                }
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
          )}

          <FieldSection title={t('assignment.schedule')} columns={1}>
            <ScheduleEditor control={form.control} name="schedule" />
            {/* The tick box needs explaining once: on its own it reads like a
                way to switch off validation rather than to state a fact about
                how the school runs that period. */}
            <p className="text-xs text-muted-foreground">{t('assignment.rotatingHint')}</p>
          </FieldSection>

          <FieldSection columns={1}>
            <TextareaField
              control={form.control}
              name="notes"
              label={t('assignment.notes')}
              rows={2}
            />
          </FieldSection>

          {saveError && <ConflictAlert error={saveError} />}
        </div>
      </Form>
    </FormDialog>
  );
}

/** `NL-001 Somchai · Mathematics · m4 A` — enough to identify the row being edited. */
function describe(assignment: TeachingAssignment, locale: string): string {
  const teacher = refObject<Teacher>(assignment.teacherId);
  const subject = refObject<Subject>(assignment.subjectId);
  const classroom = refObject<Classroom>(assignment.classroomId);

  return [
    teacher ? fullName(teacher, locale) : null,
    subject ? localizedName(subject, locale) : null,
    classroom ? classroomLabel(classroom) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
