import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan, useSeesEveryStudent } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useEnroll, useUpdateEnrollment } from '@/features/enrollments/api';
import { PlacePickerField } from '@/features/locations/components/PlacePickerField';
import { VillagePickerField } from '@/features/locations/components/VillagePickerField';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { errorMessage } from '@/lib/error-message';
import { notify } from '@/lib/toast';
import { changedFields, stripEmpty } from '@/lib/payload';
import { refId, toDateInput } from '@/lib/utils';
import {
  optionalDate,
  optionalId,
  optionalPhone,
  optionalText,
  requiredDate,
  requiredText,
} from '@/lib/zod-helpers';
import { vmsg } from '@/lib/form-message';
import {
  GENDERS,
  GUARDIAN_RELATIONSHIPS,
  STUDENT_ORGANIZATIONS,
  STUDENT_STATUSES,
} from '@/types/enums';
import type { Student, StudentOrganizationMembership } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { EntitySelectField } from '@/components/common/EntitySelect';
import {
  DateField,
  FieldSection,
  SelectField,
  TextareaField,
  TextField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { EMPTY_GUARDIAN_LINK, GuardianLinksField, toGuardianPayload } from './GuardianLinksField';
import { students, type StudentInput, type StudentUpdateInput } from '../api';

/**
 * One guardian row. Which fields are required depends on the row's mode, so the
 * check is a `superRefine` rather than two schemas.
 */
const guardianLinkSchema = z
  .object({
    mode: z.enum(['existing', 'new']),
    guardianId: optionalId(),
    firstNameLo: optionalText(80),
    lastNameLo: optionalText(80),
    phone: optionalPhone(),
    occupation: optionalText(120),
    relationship: z.enum(GUARDIAN_RELATIONSHIPS),
    isPrimary: z.boolean().optional(),
    isEmergencyContact: z.boolean().optional(),
    canViewRecords: z.boolean().optional(),
  })
  .superRefine((link, ctx) => {
    if (link.mode === 'existing') {
      if (!link.guardianId) {
        ctx.addIssue({
          code: 'custom',
          path: ['guardianId'],
          message: vmsg('validation.required'),
        });
      }
      return;
    }
    if (!link.firstNameLo)
      ctx.addIssue({ code: 'custom', path: ['firstNameLo'], message: vmsg('validation.required') });
    if (!link.lastNameLo)
      ctx.addIssue({ code: 'custom', path: ['lastNameLo'], message: vmsg('validation.required') });
    if (!link.phone)
      ctx.addIssue({ code: 'custom', path: ['phone'], message: vmsg('validation.required') });
  });

const baseSchema = z.object({
  studentCode: requiredText(30),
  firstNameLo: requiredText(80),
  lastNameLo: requiredText(80),
  firstNameEn: optionalText(80),
  lastNameEn: optionalText(80),
  nickname: optionalText(60),
  nicknameEn: optionalText(60),
  gender: z.enum(GENDERS),
  dateOfBirth: requiredDate(),
  birthLocationId: optionalId(),
  birthAddressDetail: optionalText(300),
  nationality: optionalText(60),
  ethnicity: optionalText(60),
  nationalId: optionalText(30),
  phone: optionalPhone(),
  contactPhone: optionalPhone(),
  contactName: optionalText(120),
  villageId: optionalId(),
  addressDetail: optionalText(300),
  admissionDate: optionalDate(),
  suspendedAt: optionalDate(),
  notes: optionalText(1000),
  status: z.enum(STUDENT_STATUSES).optional(),
  /**
   * Placement, on create only. Not part of the student document — it is posted
   * to `/enrollments` after the student exists, because a placement is per
   * school year and has to pass a capacity check the student record knows
   * nothing about.
   */
  classroomId: optionalId(),
  /** `ຫ້ອງພາກອັງກິດ`, stored on the placement alongside `classroomId`. */
  englishClass: optionalText(50),
  guardians: z.array(guardianLinkSchema),
  /**
   * Memberships keyed by organisation, each holding its `ວັນເຂົ້າ`.
   *
   * Keyed rather than a list because the three organisations are fixed and a
   * student's answer for each is independent — an add/remove list would make the
   * office pick the organisation from a dropdown it can never extend. A blank
   * date is the "not a member" answer; the date *is* the membership, so there is
   * no separate checkbox to disagree with it.
   */
  organizations: z.object({
    children: optionalDate(),
    youth: optionalDate(),
    women: optionalDate(),
  }),
});

/**
 * Guardians are only validated on create.
 *
 * On edit they are managed through `PUT /students/:id/guardians` from the detail
 * page, so the create form is the only place the list must be non-empty and hold
 * exactly one primary.
 */
const createSchema = baseSchema
  .refine((values) => values.guardians.length > 0, {
    path: ['guardians'],
    message: vmsg('student.atLeastOneGuardian'),
  })
  .refine((values) => values.guardians.filter((link) => link.isPrimary).length === 1, {
    path: ['guardians'],
    message: vmsg('student.primaryGuardianRequired'),
  });

type FormValues = z.infer<typeof baseSchema>;

const EMPTY: FormValues = {
  studentCode: '',
  firstNameLo: '',
  lastNameLo: '',
  firstNameEn: '',
  lastNameEn: '',
  nickname: '',
  nicknameEn: '',
  gender: 'male',
  dateOfBirth: '',
  birthLocationId: '',
  birthAddressDetail: '',
  nationality: 'Lao',
  ethnicity: '',
  nationalId: '',
  phone: '',
  contactPhone: '',
  contactName: '',
  villageId: '',
  addressDetail: '',
  admissionDate: '',
  suspendedAt: '',
  notes: '',
  // Kept at `active` because the dashboard headcounts filter on it — defaulting
  // an intake to `new` would drop it out of every total until it is placed.
  // The office picks `new` deliberately when that is what it means.
  status: 'active',
  classroomId: '',
  englishClass: '',
  guardians: [EMPTY_GUARDIAN_LINK],
  organizations: { children: '', youth: '', women: '' },
};

/**
 * Where the student sits today, as much of it as this form can edit.
 *
 * Only `englishClass`: the homeroom is changed by a transfer, which adjusts two
 * headcounts and belongs to the enrollment screen. `enrollmentId` is the row the
 * edit is written to — the form never guesses it from the student.
 */
export interface EditablePlacement {
  enrollmentId: string;
  englishClass: string | null;
}

/**
 * The record as the form holds it. Also the "before" snapshot the edit path
 * diffs against, so both views of a student are built from one place.
 *
 * `placement` is passed in rather than read off the student: `GET /students/:id`
 * does not carry it, so only the caller knows the active enrollment.
 */
function toFormValues(student: Student, placement?: EditablePlacement | null): FormValues {
  return {
    studentCode: student.studentCode,
    firstNameLo: student.firstNameLo,
    lastNameLo: student.lastNameLo,
    firstNameEn: student.firstNameEn ?? '',
    lastNameEn: student.lastNameEn ?? '',
    nickname: student.nickname ?? '',
    nicknameEn: student.nicknameEn ?? '',
    gender: student.gender,
    dateOfBirth: toDateInput(student.dateOfBirth),
    birthLocationId: refId(student.birthLocationId) ?? '',
    birthAddressDetail: student.birthAddressDetail ?? '',
    nationality: student.nationality ?? '',
    ethnicity: student.ethnicity ?? '',
    nationalId: student.nationalId ?? '',
    phone: student.phone ?? '',
    contactPhone: student.contactPhone ?? '',
    contactName: student.contactName ?? '',
    villageId: refId(student.villageId) ?? '',
    addressDetail: student.addressDetail ?? '',
    admissionDate: toDateInput(student.admissionDate),
    suspendedAt: toDateInput(student.suspendedAt),
    notes: student.notes ?? '',
    status: student.status,
    classroomId: '',
    englishClass: placement?.englishClass ?? '',
    guardians: [],
    organizations: toOrganizationFields(student.organizations),
  };
}

/** The stored membership list as the form's keyed dates. */
function toOrganizationFields(
  memberships: StudentOrganizationMembership[] | undefined,
): FormValues['organizations'] {
  const fields: FormValues['organizations'] = { children: '', youth: '', women: '' };
  for (const membership of memberships ?? []) {
    fields[membership.organization] = toDateInput(membership.joinedDate);
  }
  return fields;
}

/**
 * The form values as the API takes them — memberships back to a list.
 *
 * Used for both halves of the edit diff, so the "before" and "after" of a
 * membership are always built the same way and an untouched list cannot read as
 * a change.
 */
function toPayload(values: FormValues) {
  const { guardians, classroomId, englishClass, organizations, suspendedAt, ...rest } =
    stripEmpty(values);
  void guardians;
  void classroomId;
  // Both placement fields: they go to `/enrollments`, never onto the student.
  void englishClass;

  return {
    ...rest,
    // Only a suspension has a date; the API clears it when the status moves on.
    ...(values.status === 'suspended' && suspendedAt ? { suspendedAt } : {}),
    organizations: STUDENT_ORGANIZATIONS.filter((name) => organizations[name]).map((name) => ({
      organization: name,
      joinedDate: organizations[name] as string,
    })),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student | null;
  /**
   * The student's active enrollment, when the caller has it.
   *
   * Without it the form has no row to write `ຫ້ອງພາກອັງກິດ` to, so the field is
   * left out rather than shown and silently discarded.
   */
  placement?: EditablePlacement | null;
  /**
   * `placed` is false when the student was saved but has no classroom — either
   * none was picked, or the placement was rejected. The caller owns the follow-up.
   */
  onCreated?: (student: Student, placed: boolean) => void;
}

export function StudentFormDialog({ open, onOpenChange, student, placement, onCreated }: Props) {
  const { t } = useTranslation();
  const create = students.useCreate();
  const update = students.useUpdate();
  const enroll = useEnroll();
  // Silent: this form shows one toast for one submit, even when it writes both
  // the student record and the placement.
  const updatePlacement = useUpdateEnrollment({ silent: true });
  const activeYear = useActiveSchoolYear();
  const seesEveryStudent = useSeesEveryStudent();
  const can = useCan();
  const isEditing = student !== null;

  /**
   * Reissuing the register number is the office's, so the field is read-only for
   * everyone else once the student exists. `students:manage` is the same grant
   * the API gates it on — admin and registrar hold it, a homeroom teacher does
   * not — so the form is disabled where the API would refuse rather than
   * offering an edit that comes back 403.
   */
  const mayEditCode = !isEditing || can('students', 'manage');

  // Placement is per school year and the API derives the year from the
  // classroom, so with no active year there is nothing to choose from. A
  // homeroom teacher only ever gets their own room — the API refuses any other,
  // and a student they add without placing would vanish from their own list.
  const useClassrooms = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id, !seesEveryStudent);

  const myRooms = useClassroomOptions('', activeYear.data?.id, !seesEveryStudent);

  const form = useForm<FormValues>({
    resolver: zodResolver(isEditing ? baseSchema : createSchema),
    defaultValues: EMPTY,
  });
  const status = form.watch('status');

  useEffect(() => {
    if (!open) return;
    form.reset(student ? toFormValues(student, placement) : EMPTY);
  }, [open, student, placement, form]);

  // A homeroom teacher normally has exactly one room, so picking it for them is
  // both the right answer and the one that keeps the child visible afterwards.
  const onlyRoom = !seesEveryStudent && myRooms.data?.length === 1 ? myRooms.data[0]!.value : null;

  useEffect(() => {
    if (!open || isEditing || !onlyRoom) return;
    if (!form.getValues('classroomId')) form.setValue('classroomId', onlyRoom);
  }, [open, isEditing, onlyRoom, form]);

  function submit(values: FormValues) {
    const payload = toPayload(values);
    const { classroomId, englishClass } = stripEmpty(values);

    if (student) {
      // Only what actually changed, so the PATCH does not re-send fields another
      // user may have edited in the meantime. `studentCode` rides along when the
      // office actually retyped it — the API takes it from an account holding
      // `students:manage` and re-syncs the copies on enrollments, exam
      // registrations and term results.
      const patch = changedFields(payload, toPayload(toFormValues(student, placement)));

      // The room is not part of the student document, so it is diffed on its own
      // and written to the enrollment. `''` is a real value here — it is how a
      // child is taken out of the English programme — so the comparison is
      // against the normalized string rather than truthiness.
      const roomBefore = placement?.englishClass ?? '';
      const roomAfter = values.englishClass?.trim() ?? '';
      const roomChanged = placement != null && roomAfter !== roomBefore;

      if (Object.keys(patch).length === 0 && !roomChanged) {
        onOpenChange(false);
        return;
      }

      // Both writes go out together, and the dialog closes only once both land:
      // closing on the student save alone would show the old room back on the
      // page the office just edited.
      const writes: Promise<unknown>[] = [];
      if (Object.keys(patch).length > 0) {
        writes.push(update.mutateAsync({ id: student.id, body: patch as StudentUpdateInput }));
      }
      if (roomChanged) {
        writes.push(
          updatePlacement.mutateAsync({
            id: placement.enrollmentId,
            body: { englishClass: roomAfter },
          }),
        );
      }

      void Promise.all(writes)
        .then(() => onOpenChange(false))
        .catch(() => {});
      return;
    }

    void create
      .mutateAsync({
        ...payload,
        guardians: toGuardianPayload(values.guardians),
      } as StudentInput)
      .then(async (created) => {
        if (!classroomId) return { created, placed: false };

        // The student is already saved by this point. A rejected placement —
        // a full classroom is the usual one — must not read as a failed save,
        // so it is reported on its own and the caller offers another class.
        try {
          await enroll.mutateAsync({ studentId: created.id, classroomId, englishClass });
          return { created, placed: true };
        } catch (error) {
          notify.error(t('enrollment.placementFailed', { reason: errorMessage(error) }));
          return { created, placed: false };
        }
      })
      .then(({ created, placed }) => {
        onCreated?.(created, placed);
        onOpenChange(false);
      })
      .catch(() => {});
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t('student.edit') : t('student.create')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending || updatePlacement.isPending}
      size="xl"
    >
      <Form {...form}>
        <div className="space-y-5">
          <FieldSection title={t('person.basicInfo')}>
            <TextField
              control={form.control}
              name="studentCode"
              label={t('student.studentCode')}
              required
              disabled={!mayEditCode}
              description={isEditing && mayEditCode ? t('student.studentCodeHint') : undefined}
            />
            <SelectField
              control={form.control}
              name="gender"
              label={t('person.gender')}
              required
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
            />
            <TextField
              control={form.control}
              name="firstNameLo"
              label={t('person.firstNameLo')}
              required
            />
            <TextField
              control={form.control}
              name="lastNameLo"
              label={t('person.lastNameLo')}
              required
            />
            <TextField control={form.control} name="firstNameEn" label={t('person.firstNameEn')} />
            <TextField control={form.control} name="lastNameEn" label={t('person.lastNameEn')} />
            <TextField control={form.control} name="nickname" label={t('person.nickname')} />
            <TextField control={form.control} name="nicknameEn" label={t('person.nicknameEn')} />
            <DateField
              control={form.control}
              name="dateOfBirth"
              label={t('person.dateOfBirth')}
              required
            />
            <TextField control={form.control} name="nationality" label={t('student.nationality')} />
            <TextField control={form.control} name="ethnicity" label={t('student.ethnicity')} />
            <TextField control={form.control} name="nationalId" label={t('person.nationalId')} />
            <TextField control={form.control} name="phone" label={t('person.phone')} type="tel" />
            <TextField
              control={form.control}
              name="contactPhone"
              label={t('student.contactPhone')}
              type="tel"
            />
            <TextField
              control={form.control}
              name="contactName"
              label={t('student.contactName')}
              description={t('student.contactNameHint')}
            />
          </FieldSection>

          {/* Held exactly like the current address, except that the node may be a
              province or a district: the official list has villages for
              Vientiane Capital only, so a birth elsewhere goes no finer than
              its district and its village name goes in the detail. */}
          <FieldSection title={t('student.placeOfBirth')}>
            <PlacePickerField
              control={form.control}
              name="birthLocationId"
              label={t('location.province')}
            />
            <TextField
              control={form.control}
              name="birthAddressDetail"
              label={t('person.addressDetail')}
              description={t('student.birthAddressDetailHint')}
            />
          </FieldSection>

          <FieldSection title={t('person.addressInfo')}>
            <VillagePickerField
              control={form.control}
              name="villageId"
              label={t('person.village')}
            />
            <TextField
              control={form.control}
              name="addressDetail"
              label={t('person.addressDetail')}
            />
          </FieldSection>

          {/* The two placement fields are not edited the same way. The homeroom
              is create-only: moving a placed student is a transfer, which the
              enrollment module does with both headcounts in one transaction. The
              English room is only a label on the placement, so it stays editable
              — but only once a placement exists to hold it. */}
          {(!isEditing || placement) && (
            <FieldSection title={t('enrollment.placement')}>
              {!isEditing && (
                <EntitySelectField
                  control={form.control}
                  name="classroomId"
                  label={t('enrollment.classroom')}
                  description={
                    activeYear.data ? t('student.classroomHint') : t('enrollment.noActiveYearHint')
                  }
                  useOptions={useClassrooms}
                  searchPlaceholder={t('enrollment.selectClassroom')}
                />
              )}
              <TextField
                control={form.control}
                name="englishClass"
                label={t('enrollment.englishClass')}
                description={t('enrollment.englishClassHint')}
              />
            </FieldSection>
          )}

          {/* A membership is an act with a date, so the date is the whole input.
              Never derived from gender or age: the women's union count and the
              female student count are two different figures. */}
          <FieldSection title={t('studentOrganization.label')}>
            {STUDENT_ORGANIZATIONS.map((name) => (
              <DateField
                key={name}
                control={form.control}
                name={`organizations.${name}`}
                label={t(`studentOrganization.${name}`)}
                description={t('studentOrganization.joinedDate')}
              />
            ))}
          </FieldSection>

          <FieldSection>
            <DateField
              control={form.control}
              name="admissionDate"
              label={t('student.admissionDate')}
            />
            {/* Moving a child between statuses drives enrolment and certificates,
                so it stays with the office. A homeroom teacher gets every other
                field; the API refuses the change either way. */}
            {seesEveryStudent && (
              <SelectField
                control={form.control}
                name="status"
                label={t('person.status')}
                options={STUDENT_STATUSES.map((status) => ({
                  value: status,
                  label: t(`studentStatus.${status}`),
                }))}
              />
            )}
            {/* The date places the suspension in a school year — the district
                report counts only this year's. */}
            {seesEveryStudent && status === 'suspended' && (
              <DateField
                control={form.control}
                name="suspendedAt"
                label={t('student.suspendedAt')}
                description={t('student.suspendedAtHint')}
              />
            )}
            <TextareaField
              control={form.control}
              name="notes"
              label={t('student.notes')}
              className="sm:col-span-2"
            />
          </FieldSection>

          {/* On edit, the guardian list is replaced through its own endpoint from
              the detail page — showing it here would imply a merge that PATCH
              does not do. */}
          {!isEditing && (
            <>
              <Separator />
              <GuardianLinksField control={form.control} name="guardians" />
            </>
          )}
        </div>
      </Form>
    </FormDialog>
  );
}
