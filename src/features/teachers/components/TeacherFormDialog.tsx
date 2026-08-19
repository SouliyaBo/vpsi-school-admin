import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useVillageOptions } from '@/features/locations/api';
import { useSubjectGroupOptions } from '@/features/subject-groups/api';
import { stripEmpty } from '@/lib/payload';
import { refId, toDateInput } from '@/lib/utils';
import {
  optionalDate,
  optionalEmail,
  optionalId,
  optionalNumber,
  optionalPhone,
  optionalText,
  requiredText,
} from '@/lib/zod-helpers';
import { GENDERS, HOUSING_TYPES, MARITAL_STATUSES, TEACHER_STATUSES } from '@/types/enums';
import type { Teacher } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import {
  CheckboxField,
  DateField,
  FieldSection,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import {
  teachers,
  useNextTeacherCode,
  type TeacherInput,
  type TeacherUpdateInput,
} from '../api';

const schema = z.object({
  teacherCode: optionalText(30),
  title: optionalText(20),
  firstNameLo: requiredText(80),
  lastNameLo: requiredText(80),
  firstNameEn: optionalText(80),
  lastNameEn: optionalText(80),
  gender: z.enum(GENDERS),
  dateOfBirth: optionalDate(),
  ethnicity: optionalText(60),
  birthVillage: optionalText(100),
  birthDistrict: optionalText(100),
  birthProvince: optionalText(100),
  nationalId: optionalText(30),
  phone: optionalPhone(),
  email: optionalEmail(),
  villageId: optionalId(),
  addressDetail: optionalText(300),
  qualification: optionalText(150),
  specialization: optionalText(150),
  subjectGroupId: optionalId(),
  institution: optionalText(150),
  graduatedYear: optionalText(20),
  /** Entered as one line, split into an array on submit. */
  teachingSubjects: optionalText(300),
  professionalLevel: optionalText(20),
  hireDate: optionalDate(),
  joinedOrgDate: optionalDate(),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
  childrenCount: optionalNumber({ min: 0, max: 30 }),
  housingType: z.enum(HOUSING_TYPES).optional(),
  livingWith: optionalText(300),
  siblings: optionalText(1000),
  fatherName: optionalText(120),
  fatherAddress: optionalText(300),
  fatherOccupation: optionalText(100),
  motherName: optionalText(120),
  motherAddress: optionalText(300),
  motherOccupation: optionalText(100),
  isAcademicHead: z.boolean().optional(),
  /** Editable only on an existing record — creation always starts `active`. */
  status: z.enum(TEACHER_STATUSES).optional(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  teacherCode: '',
  title: '',
  firstNameLo: '',
  lastNameLo: '',
  firstNameEn: '',
  lastNameEn: '',
  gender: 'male',
  dateOfBirth: '',
  ethnicity: '',
  birthVillage: '',
  birthDistrict: '',
  birthProvince: '',
  nationalId: '',
  phone: '',
  email: '',
  villageId: '',
  addressDetail: '',
  qualification: '',
  specialization: '',
  subjectGroupId: undefined,
  institution: '',
  graduatedYear: '',
  teachingSubjects: '',
  professionalLevel: '',
  hireDate: '',
  joinedOrgDate: '',
  livingWith: '',
  siblings: '',
  fatherName: '',
  fatherAddress: '',
  fatherOccupation: '',
  motherName: '',
  motherAddress: '',
  motherOccupation: '',
  isAcademicHead: false,
};

/**
 * `ເຄມີສາດ, ຊີວະສາດ` → two subjects.
 *
 * One text input rather than a repeatable row: a teacher names two or three
 * subjects, and the staff register already writes them on one line. Both
 * separators are accepted because the register uses `/` and a typist reaches
 * for `,`.
 */
function parseSubjects(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` creates; a record edits. */
  teacher: Teacher | null;
}

export function TeacherFormDialog({ open, onOpenChange, teacher }: Props) {
  const { t } = useTranslation();
  const create = teachers.useCreate();
  const update = teachers.useUpdate();
  // Only while creating: an existing teacher already has a code, and asking the
  // API for the next one would show a number this record is not going to get.
  const nextCode = useNextTeacherCode(open && !teacher);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      teacher
        ? {
            teacherCode: teacher.teacherCode,
            title: teacher.title ?? '',
            firstNameLo: teacher.firstNameLo,
            lastNameLo: teacher.lastNameLo,
            firstNameEn: teacher.firstNameEn ?? '',
            lastNameEn: teacher.lastNameEn ?? '',
            gender: teacher.gender,
            dateOfBirth: toDateInput(teacher.dateOfBirth),
            ethnicity: teacher.ethnicity ?? '',
            birthVillage: teacher.placeOfBirth?.village ?? '',
            birthDistrict: teacher.placeOfBirth?.district ?? '',
            birthProvince: teacher.placeOfBirth?.province ?? '',
            nationalId: teacher.nationalId ?? '',
            phone: teacher.phone ?? '',
            email: teacher.email ?? '',
            villageId: refId(teacher.villageId) ?? '',
            addressDetail: teacher.addressDetail ?? '',
            qualification: teacher.qualification ?? '',
            specialization: teacher.specialization ?? '',
            subjectGroupId: refId(teacher.subjectGroupId) ?? undefined,
            institution: teacher.education?.institution ?? '',
            graduatedYear: teacher.education?.graduatedYear ?? '',
            teachingSubjects: (teacher.teachingSubjects ?? []).join(', '),
            professionalLevel: teacher.professionalLevel ?? '',
            hireDate: toDateInput(teacher.hireDate),
            joinedOrgDate: toDateInput(teacher.joinedOrgDate),
            maritalStatus: teacher.maritalStatus ?? undefined,
            childrenCount: teacher.childrenCount ?? undefined,
            housingType: teacher.housingType ?? undefined,
            livingWith: teacher.livingWith ?? '',
            siblings: teacher.siblings ?? '',
            fatherName: teacher.father?.fullNameLo ?? '',
            fatherAddress: teacher.father?.address ?? '',
            fatherOccupation: teacher.father?.occupation ?? '',
            motherName: teacher.mother?.fullNameLo ?? '',
            motherAddress: teacher.mother?.address ?? '',
            motherOccupation: teacher.mother?.occupation ?? '',
            isAcademicHead: teacher.isAcademicHead,
            status: teacher.status,
          }
        : EMPTY,
    );
  }, [open, teacher, form]);

  function submit(values: FormValues) {
    const {
      birthVillage,
      birthDistrict,
      birthProvince,
      institution,
      graduatedYear,
      fatherName,
      fatherAddress,
      fatherOccupation,
      motherName,
      motherAddress,
      motherOccupation,
      teachingSubjects,
      ...rest
    } = values;

    // The flat inputs are regrouped into the nested shape the API takes; blanks
    // are dropped by `stripEmpty`, so an untouched group posts as `{}`.
    const payload = stripEmpty({
      ...rest,
      placeOfBirth: {
        village: birthVillage,
        district: birthDistrict,
        province: birthProvince,
      },
      education: { institution, graduatedYear },
      father: {
        fullNameLo: fatherName,
        address: fatherAddress,
        occupation: fatherOccupation,
      },
      mother: {
        fullNameLo: motherName,
        address: motherAddress,
        occupation: motherOccupation,
      },
      teachingSubjects: parseSubjects(teachingSubjects),
    });

    // `teacherCode` never travels: on an update the API's DTO does not accept it
    // — and rejects unknown properties rather than ignoring them — while on a
    // create the API mints it. Either way the form only ever displays it.
    const { teacherCode: _code, ...body } = payload;

    if (teacher) {
      void update
        .mutateAsync({
          id: teacher.id,
          // `stripEmpty` drops a cleared department, which would silently leave
          // the teacher on their old group. Only the update DTO accepts the null
          // — on a create there is nothing to detach from.
          body: {
            ...body,
            subjectGroupId: values.subjectGroupId ?? null,
          } as TeacherUpdateInput,
        })
        .then(() => onOpenChange(false))
        .catch(() => {});
      return;
    }

    // `status` is not part of the create DTO — the API starts every teacher active.
    const { status: _status, ...createBody } = body;
    void create
      .mutateAsync(createBody as TeacherInput)
      .then(() => onOpenChange(false))
      .catch(() => {});
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={teacher ? t('teacher.edit') : t('teacher.create')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending}
      size="xl"
    >
      <Form {...form}>
        <div className="space-y-5">
          <FieldSection title={t('person.basicInfo')}>
            <TextField
              control={form.control}
              name="teacherCode"
              label={t('teacher.teacherCode')}
              disabled
              placeholder={nextCode.data?.teacherCode ?? ''}
              description={teacher ? undefined : t('teacher.codeGeneratedHint')}
            />
            <SelectField
              control={form.control}
              name="gender"
              label={t('person.gender')}
              required
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
            />
            <TextField control={form.control} name="title" label={t('person.title')} />
            <TextField control={form.control} name="ethnicity" label={t('person.ethnicity')} />
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
            <DateField control={form.control} name="dateOfBirth" label={t('person.dateOfBirth')} />
            <TextField control={form.control} name="nationalId" label={t('person.nationalId')} />
          </FieldSection>

          <FieldSection title={t('person.placeOfBirth')} columns={3}>
            <TextField control={form.control} name="birthVillage" label={t('person.village')} />
            <TextField control={form.control} name="birthDistrict" label={t('person.district')} />
            <TextField control={form.control} name="birthProvince" label={t('person.province')} />
          </FieldSection>

          <FieldSection title={t('person.contactInfo')}>
            <TextField control={form.control} name="phone" label={t('person.phone')} type="tel" />
            <TextField control={form.control} name="email" label={t('person.email')} type="email" />
          </FieldSection>

          <FieldSection title={t('person.addressInfo')}>
            <EntitySelectField
              control={form.control}
              name="villageId"
              label={t('person.village')}
              useOptions={useVillageOptions}
              searchPlaceholder={t('location.searchVillage')}
            />
            <TextField
              control={form.control}
              name="addressDetail"
              label={t('person.addressDetail')}
            />
          </FieldSection>

          <FieldSection title={t('person.workInfo')}>
            <TextField
              control={form.control}
              name="institution"
              label={t('teacher.institution')}
            />
            <TextField
              control={form.control}
              name="graduatedYear"
              label={t('teacher.graduatedYear')}
              placeholder="2016-2017"
            />
            <TextField
              control={form.control}
              name="qualification"
              label={t('teacher.qualification')}
            />
            <TextField
              control={form.control}
              name="specialization"
              label={t('teacher.specialization')}
            />
            {/* The department, unlike `specialization` and `teachingSubjects`
                above, is a real reference — it is what groups this teacher's rows
                on the lesson-plan compliance matrix. */}
            <EntitySelectField
              control={form.control}
              name="subjectGroupId"
              label={t('subjectGroup.title')}
              useOptions={useSubjectGroupOptions}
            />
            <TextField
              control={form.control}
              name="teachingSubjects"
              label={t('teacher.teachingSubjects')}
              description={t('teacher.teachingSubjectsHint')}
              className="sm:col-span-2"
            />
            <TextField
              control={form.control}
              name="professionalLevel"
              label={t('teacher.professionalLevel')}
            />
            <DateField control={form.control} name="hireDate" label={t('teacher.hireDate')} />
            <DateField
              control={form.control}
              name="joinedOrgDate"
              label={t('teacher.joinedOrgDate')}
            />
            {teacher && (
              <SelectField
                control={form.control}
                name="status"
                label={t('person.status')}
                options={TEACHER_STATUSES.map((status) => ({
                  value: status,
                  label: t(`teacherStatus.${status}`),
                }))}
              />
            )}
            <CheckboxField
              control={form.control}
              name="isAcademicHead"
              label={t('teacher.isAcademicHead')}
              description={t('teacher.academicHeadHint')}
              className="sm:col-span-2"
            />
          </FieldSection>

          <FieldSection title={t('teacher.personalInfo')}>
            <SelectField
              control={form.control}
              name="maritalStatus"
              label={t('teacher.maritalStatus')}
              options={MARITAL_STATUSES.map((status) => ({
                value: status,
                label: t(`maritalStatus.${status}`),
              }))}
            />
            <NumberField
              control={form.control}
              name="childrenCount"
              label={t('teacher.childrenCount')}
              min={0}
              max={30}
              step={1}
            />
            <SelectField
              control={form.control}
              name="housingType"
              label={t('teacher.housingType')}
              options={HOUSING_TYPES.map((type) => ({
                value: type,
                label: t(`housingType.${type}`),
              }))}
            />
            <TextField control={form.control} name="livingWith" label={t('teacher.livingWith')} />
            <TextareaField
              control={form.control}
              name="siblings"
              label={t('teacher.siblings')}
              description={t('teacher.siblingsHint')}
              className="sm:col-span-2"
            />
          </FieldSection>

          <FieldSection title={t('teacher.father')} columns={3}>
            <TextField control={form.control} name="fatherName" label={t('person.fullName')} />
            <TextField control={form.control} name="fatherAddress" label={t('person.address')} />
            <TextField
              control={form.control}
              name="fatherOccupation"
              label={t('guardian.occupation')}
            />
          </FieldSection>

          <FieldSection title={t('teacher.mother')} columns={3}>
            <TextField control={form.control} name="motherName" label={t('person.fullName')} />
            <TextField control={form.control} name="motherAddress" label={t('person.address')} />
            <TextField
              control={form.control}
              name="motherOccupation"
              label={t('guardian.occupation')}
            />
          </FieldSection>
        </div>
      </Form>
    </FormDialog>
  );
}
