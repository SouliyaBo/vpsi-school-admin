import { zodResolver } from '@hookform/resolvers/zod';
import { Download, Paperclip, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCurrentUser } from '@/features/auth/hooks';
import { useSemesterOptions } from '@/features/semesters/api';
import { useTeacherSchedule } from '@/features/teaching-assignments/api';
import { localizedName, refId, refObject, toDateInput } from '@/lib/utils';
import { optionalNumber, optionalText, requiredDate, requiredId, requiredText } from '@/lib/zod-helpers';
import type { Classroom, LessonPlan, Subject } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import {
  DateField,
  FieldSection,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
  type SelectOption,
} from '@/components/common/fields';
import { FileUpload } from '@/components/common/FileUpload';
import { FormDialog } from '@/components/common/FormDialog';
import {
  useCreateLessonPlan,
  useLessonPlanAttachments,
  useUpdateLessonPlan,
  useUploadAttachment,
  type CreateLessonPlanInput,
} from '../api';
import { ACCEPTED_DOCUMENTS, AttachmentPicker, MAX_DOCUMENT_BYTES } from './AttachmentPicker';

/**
 * `weekEndDate` and `dueDate` are absent on purpose — the API derives the week's
 * end from its Monday and the deadline from school policy. A field for either
 * would be a field whose value is thrown away.
 */
const schema = z.object({
  subjectId: requiredId(),
  classroomId: requiredId(),
  semesterId: requiredId(),
  title: requiredText(200),
  description: optionalText(2000),
  weekStartDate: requiredDate(),
  activities: z
    .array(
      z.object({
        topic: requiredText(200),
        date: requiredDate(),
        durationMinutes: optionalNumber({ min: 1 }),
        objectives: optionalText(1000),
        teachingMethod: optionalText(300),
      }),
    )
    .max(30),
});
type FormValues = z.infer<typeof schema>;

const EMPTY_ACTIVITY = {
  topic: '',
  date: '',
  durationMinutes: undefined,
  objectives: '',
  teachingMethod: '',
};

const EMPTY: FormValues = {
  subjectId: '',
  classroomId: '',
  semesterId: '',
  title: '',
  description: '',
  weekStartDate: '',
  activities: [],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` creates; a record edits. */
  plan: LessonPlan | null;
  /** Pre-fills the semester when the list is already filtered to one. */
  defaultSemesterId?: string;
}

export function PlanFormDialog({ open, onOpenChange, plan, defaultSemesterId }: Props) {
  const { t, i18n } = useTranslation();
  const create = useCreateLessonPlan();
  const update = useUpdateLessonPlan();
  const uploadAttachment = useUploadAttachment();

  /**
   * Documents chosen before the plan exists.
   *
   * An attachment is keyed to a plan id, so on the create path the file cannot be
   * sent with the form — it is held here and posted as soon as the id comes back.
   */
  const [staged, setStaged] = useState<File[]>([]);
  /** `n of m` while the staged files go up, so a slow upload is not a frozen dialog. */
  const [uploadedCount, setUploadedCount] = useState<number | null>(null);

  const attachments = useLessonPlanAttachments(plan?.id);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const activities = useFieldArray({ control: form.control, name: 'activities' });

  /*
   * Subject and class come from the teacher's own timetable, not from the full
   * catalogue.
   *
   * The API refuses a plan for a lesson the caller is not timetabled to teach, so
   * a searchable list of all 70 subjects offered 69 wrong answers and one right
   * one — and capped its page at 50, which left the rest unreachable however far
   * the list was scrolled. A teacher has a handful of assignments; they all fit.
   */
  const me = useCurrentUser();
  const semesterId = form.watch('semesterId');
  const subjectId = form.watch('subjectId');
  const schedule = useTeacherSchedule(
    me?.personType === 'teacher' ? (me.personId ?? undefined) : undefined,
    semesterId || undefined,
  );

  const { subjectOptions, classroomOptions } = useMemo(() => {
    const subjects = new Map<string, SelectOption>();
    const classrooms = new Map<string, SelectOption>();

    const subjectOption = (subject: Subject): SelectOption => ({
      value: subject.id,
      label: `${subject.code} — ${localizedName(subject, i18n.language)}`,
    });
    const classroomOption = (classroom: Classroom): SelectOption => {
      const grade = refObject(classroom.gradeLevelId);
      return {
        value: classroom.id,
        label: grade?.code ? `${grade.code} ${classroom.name}` : classroom.name,
      };
    };

    // Editing: both fields are fixed and read from the plan itself, so their
    // labels must not depend on the assignment still being on the timetable.
    if (plan) {
      const subject = refObject<Subject>(plan.subjectId);
      const classroom = refObject<Classroom>(plan.classroomId);
      if (subject) subjects.set(subject.id, subjectOption(subject));
      if (classroom) classrooms.set(classroom.id, classroomOption(classroom));
    }

    for (const assignment of schedule.data ?? []) {
      const subject = refObject<Subject>(assignment.subjectId);
      const classroom = refObject<Classroom>(assignment.classroomId);
      if (!subject) continue;

      // The same subject taught to three classes is one entry here, three below.
      if (!subjects.has(subject.id)) subjects.set(subject.id, subjectOption(subject));

      // Only the classes this subject is actually taught to: picking across two
      // assignments would compose a pair the API has no row for.
      if (classroom && subject.id === subjectId && !classrooms.has(classroom.id)) {
        classrooms.set(classroom.id, classroomOption(classroom));
      }
    }

    return {
      subjectOptions: [...subjects.values()],
      classroomOptions: [...classrooms.values()],
    };
  }, [schedule.data, subjectId, i18n.language, plan]);

  // A class that no longer matches the chosen subject would be sent as an invalid
  // pair, so it is cleared rather than left showing a stale label.
  useEffect(() => {
    if (plan || !subjectId) return;
    const chosen = form.getValues('classroomId');
    if (chosen && !classroomOptions.some((option) => option.value === chosen)) {
      form.setValue('classroomId', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, classroomOptions]);

  useEffect(() => {
    if (!open) return;
    setStaged([]);
    setUploadedCount(null);
    form.reset(
      plan
        ? {
            subjectId: refId(plan.subjectId) ?? '',
            classroomId: refId(plan.classroomId) ?? '',
            semesterId: refId(plan.semesterId) ?? '',
            title: plan.title,
            description: plan.description ?? '',
            weekStartDate: toDateInput(plan.weekStartDate),
            activities: plan.activities.map((activity) => ({
              topic: activity.topic,
              date: toDateInput(activity.date),
              durationMinutes: activity.durationMinutes ?? undefined,
              objectives: activity.objectives ?? '',
              teachingMethod: activity.teachingMethod ?? '',
            })),
          }
        : { ...EMPTY, semesterId: defaultSemesterId ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plan, form]);

  function submit(values: FormValues) {
    // Blank optionals are dropped per activity rather than by `stripEmpty`: the
    // API validates the nested array, and an empty string fails `IsOptional`
    // checks that a missing key would pass.
    const payload = {
      ...values,
      activities: values.activities.map((activity) => ({
        topic: activity.topic,
        date: activity.date,
        ...(activity.durationMinutes ? { durationMinutes: activity.durationMinutes } : {}),
        ...(activity.objectives?.trim() ? { objectives: activity.objectives.trim() } : {}),
        ...(activity.teachingMethod?.trim()
          ? { teachingMethod: activity.teachingMethod.trim() }
          : {}),
      })),
      ...(values.description?.trim() ? { description: values.description.trim() } : {}),
    };

    if (plan) {
      // Subject, class and semester are fixed: they are what the plan is filed
      // against on the compliance matrix, and the API's update DTO does not
      // accept them.
      const { subjectId: _s, classroomId: _c, semesterId: _m, ...updatable } = payload;
      void update
        .mutateAsync({ id: plan.id, body: updatable })
        .then(() => onOpenChange(false))
        .catch(() => {});
      return;
    }

    void create
      .mutateAsync(payload as CreateLessonPlanInput)
      .then(uploadStaged)
      .then(() => onOpenChange(false))
      .catch(() => {});
  }

  /**
   * Posts the staged documents against the plan that was just created.
   *
   * Sequential rather than parallel: each one is up to 20 MB, and a teacher on a
   * school connection uploading four at once is how a save appears to hang. A
   * failure here leaves the plan saved — its own toast explains, and the rest of
   * the files stay staged in the reopened form.
   */
  async function uploadStaged(created: LessonPlan): Promise<void> {
    if (staged.length === 0) return;
    setUploadedCount(0);
    try {
      for (const [index, file] of staged.entries()) {
        await uploadAttachment.mutateAsync({ id: created.id, file });
        setUploadedCount(index + 1);
      }
      setStaged([]);
    } finally {
      setUploadedCount(null);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={plan ? t('lessonPlan.edit') : t('lessonPlan.create')}
      onSubmit={form.handleSubmit(submit)}
      // The staged uploads run after the save resolves, so the button must stay
      // busy through them or the dialog looks done while files are still going up.
      isSubmitting={create.isPending || update.isPending || uploadedCount !== null}
      size="lg"
    >
      <Form {...form}>
        <FieldSection>
          <EntitySelectField
            control={form.control}
            name="semesterId"
            label={t('semester.title')}
            required
            disabled={Boolean(plan)}
            useOptions={useSemesterOptions}
          />
          {/* Any date in the taught week: the API snaps it to that week's Monday,
              so a teacher picking Wednesday still files against the right week. */}
          <DateField
            control={form.control}
            name="weekStartDate"
            label={t('lessonPlan.week')}
            description={t('lessonPlan.weekHint')}
            required
          />
          <SelectField
            control={form.control}
            name="subjectId"
            label={t('subject.title')}
            required
            // Nothing to choose until the semester is known — the timetable is
            // per semester.
            disabled={Boolean(plan) || !semesterId}
            options={subjectOptions}
            description={
              semesterId && !schedule.isLoading && subjectOptions.length === 0
                ? t('lessonPlan.noTimetable')
                : undefined
            }
          />
          <SelectField
            control={form.control}
            name="classroomId"
            label={t('classroom.title')}
            required
            disabled={Boolean(plan) || !subjectId}
            options={classroomOptions}
          />
          <TextField
            control={form.control}
            name="title"
            label={t('common.title')}
            required
            className="sm:col-span-2"
          />
          <TextareaField
            control={form.control}
            name="description"
            label={t('common.description')}
            className="sm:col-span-2"
          />
        </FieldSection>

        <FieldSection title={t('lessonPlan.activities')}>
          <div className="space-y-3 sm:col-span-2">
            {activities.fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('lessonPlan.session')} {index + 1}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => activities.remove(index)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    control={form.control}
                    name={`activities.${index}.topic`}
                    label={t('lessonPlan.topic')}
                    required
                  />
                  <DateField
                    control={form.control}
                    name={`activities.${index}.date`}
                    label={t('common.date')}
                    required
                  />
                  <NumberField
                    control={form.control}
                    name={`activities.${index}.durationMinutes`}
                    label={t('lessonPlan.duration')}
                    min={1}
                  />
                  <TextField
                    control={form.control}
                    name={`activities.${index}.teachingMethod`}
                    label={t('lessonPlan.method')}
                  />
                  <TextareaField
                    control={form.control}
                    name={`activities.${index}.objectives`}
                    label={t('lessonPlan.objectives')}
                    className="sm:col-span-2"
                  />
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={() => activities.append(EMPTY_ACTIVITY)}>
              <Plus />
              {t('lessonPlan.addSession')}
            </Button>

            {/* Said here rather than only on the submit button: a plan with no
                sessions saves fine as a draft but cannot be handed in, and it is
                cheaper to learn that while the form is open. */}
            <p className="text-xs text-muted-foreground">{t('lessonPlan.needsActivity')}</p>
          </div>
        </FieldSection>

        <FieldSection title={t('lessonPlan.attachments')}>
          <div className="space-y-3 sm:col-span-2">
            {plan ? (
              // The plan already has an id, so a file can go straight up — and the
              // documents already attached are listed, since re-uploading the same
              // week's plan is the mistake this prevents.
              <>
                {(attachments.data ?? []).length > 0 && (
                  <ul className="space-y-1">
                    {(attachments.data ?? []).map((file) => (
                      <li key={file.filename} className="flex items-center gap-2 text-sm">
                        <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                        {file.url && (
                          <Button asChild size="sm" variant="ghost">
                            <a href={file.url} target="_blank" rel="noreferrer">
                              <Download />
                              {t('common.download')}
                            </a>
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <FileUpload
                  accept={ACCEPTED_DOCUMENTS}
                  maxSizeBytes={MAX_DOCUMENT_BYTES}
                  label={t('lessonPlan.uploadLabel')}
                  disabled={uploadAttachment.isPending}
                  onUpload={(file, onProgress) =>
                    uploadAttachment.mutateAsync({ id: plan.id, file, onProgress })
                  }
                  onUploaded={() => void attachments.refetch()}
                />
              </>
            ) : (
              <AttachmentPicker
                files={staged}
                onChange={setStaged}
                disabled={uploadedCount !== null}
                hint={t('lessonPlan.stagedHint')}
              />
            )}

            {uploadedCount !== null && (
              <p className="text-xs text-muted-foreground">
                {t('lessonPlan.uploadingCount', { done: uploadedCount, total: staged.length })}
              </p>
            )}
          </div>
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
