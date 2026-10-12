import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { vmsg } from '@/lib/form-message';
import { stripEmpty } from '@/lib/payload';
import {
  optionalDate,
  optionalText,
  requiredDate,
  requiredNumber,
  requiredText,
} from '@/lib/zod-helpers';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import {
  DateField,
  FieldSection,
  NumberField,
  SelectField,
  TextField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { useStudentOptions } from '@/features/students/api';
import { useTeacherOptions } from '@/features/teachers/api';
import {
  bookKeyToTarget,
  useCreateBookLoan,
  useLendableOptions,
  type BookLoanInput,
  type BookTitle,
  type BorrowerType,
} from '../api';

/**
 * Where the dialog was opened from, which decides how much of the book is
 * already chosen:
 * - `title` — a ປື້ມອຸປະຖຳ / ເອກະສານອ້າງອີງ row: the book is fixed.
 * - `row` — a ຄູ່ມືຄູ / ແບບຮຽນ row: the subject is fixed, the grade is picked.
 * - `null` — the loans tab: the book is searched for.
 */
export type LoanStart =
  | { kind: 'title'; title: BookTitle }
  | {
      kind: 'row';
      label: string;
      /** One per grade the row holds, each a book key with what is left of it. */
      cells: { key: string; grade: string; available: number }[];
    }
  | null;

const BORROWER_TYPES: BorrowerType[] = ['teacher', 'student', 'other'];

const today = () => new Date().toISOString().slice(0, 10);

const schema = z
  .object({
    /** `t:<titleId>` or `c:<sheetId>:<rowId>:<gradeLevelId>` — see `bookKeyToTarget`. */
    bookKey: requiredText(200),
    borrowerType: z.enum(['teacher', 'student', 'other']),
    teacherId: z.string().optional(),
    studentId: z.string().optional(),
    borrowerName: optionalText(200),
    quantity: requiredNumber({ min: 1, integer: true }),
    loanedOn: requiredDate(),
    dueOn: optionalDate(),
    note: optionalText(500),
  })
  // The borrower's own field must be filled for the kind picked.
  .superRefine((values, ctx) => {
    const missing =
      (values.borrowerType === 'teacher' && !values.teacherId && 'teacherId') ||
      (values.borrowerType === 'student' && !values.studentId && 'studentId') ||
      (values.borrowerType === 'other' && !values.borrowerName?.trim() && 'borrowerName');
    if (missing) {
      ctx.addIssue({ code: 'custom', path: [missing], message: vmsg('validation.required') });
    }
  });

type FormValues = z.infer<typeof schema>;

/**
 * ຢືມປື້ມ — lend copies of one book, never more than are on the shelf. The API
 * holds the line too; the form only saves a round trip.
 */
export function LoanDialog({
  open,
  start,
  onOpenChange,
}: {
  open: boolean;
  start: LoanStart;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateBookLoan();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bookKey: '', borrowerType: 'teacher', quantity: 1, loanedOn: today() },
  });

  useEffect(() => {
    if (!open) return;
    const firstCell = start?.kind === 'row' ? start.cells.find((cell) => cell.available > 0) : null;
    form.reset({
      bookKey: start?.kind === 'title' ? `t:${start.title.id}` : (firstCell?.key ?? ''),
      borrowerType: 'teacher',
      quantity: 1,
      loanedOn: today(),
    });
  }, [open, start, form]);

  const borrowerType = form.watch('borrowerType');
  const bookKey = form.watch('bookKey');
  const available =
    start?.kind === 'title'
      ? start.title.available
      : start?.kind === 'row'
        ? start.cells.find((cell) => cell.key === bookKey)?.available
        : undefined;

  function submit(values: FormValues) {
    const body = stripEmpty({
      ...bookKeyToTarget(values.bookKey),
      borrowerType: values.borrowerType,
      teacherId: values.borrowerType === 'teacher' ? values.teacherId : undefined,
      studentId: values.borrowerType === 'student' ? values.studentId : undefined,
      borrowerName: values.borrowerType === 'other' ? values.borrowerName : undefined,
      quantity: values.quantity,
      loanedOn: values.loanedOn,
      dueOn: values.dueOn,
      note: values.note,
    }) as BookLoanInput;
    create.mutateAsync(body).then(
      () => onOpenChange(false),
      () => {},
    );
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('library.loan.create')}
      description={
        start?.kind === 'title'
          ? t('library.loan.createHint', {
              title: start.title.title,
              available: start.title.available,
            })
          : start?.kind === 'row'
            ? start.label
            : undefined
      }
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending}
      submitDisabled={available !== undefined && available < 1}
    >
      <Form {...form}>
        {start?.kind === 'row' && (
          <FieldSection title={t('library.loan.book')}>
            <SelectField
              control={form.control}
              name="bookKey"
              label={t('library.workbook.grade')}
              required
              options={start.cells.map((cell) => ({
                value: cell.key,
                label: `${cell.grade} — ${t('library.title.available', { n: cell.available })}`,
              }))}
            />
          </FieldSection>
        )}
        {start === null && (
          <FieldSection title={t('library.loan.book')}>
            <div className="sm:col-span-2">
              <EntitySelectField
                control={form.control}
                name="bookKey"
                label={t('library.title.name')}
                required
                useOptions={useLendableOptions}
                placeholder={t('library.loan.pickBook')}
              />
            </div>
          </FieldSection>
        )}
        <FieldSection title={t('library.loan.borrower')}>
          <SelectField
            control={form.control}
            name="borrowerType"
            label={t('library.loan.borrowerType')}
            required
            options={BORROWER_TYPES.map((type) => ({
              value: type,
              label: t(`library.loan.borrowerTypes.${type}`),
            }))}
          />
          {borrowerType === 'teacher' && (
            <EntitySelectField
              control={form.control}
              name="teacherId"
              label={t('library.loan.borrowerTypes.teacher')}
              required
              useOptions={useTeacherOptions}
            />
          )}
          {borrowerType === 'student' && (
            <EntitySelectField
              control={form.control}
              name="studentId"
              label={t('library.loan.borrowerTypes.student')}
              required
              useOptions={useStudentOptions}
            />
          )}
          {borrowerType === 'other' && (
            <TextField
              control={form.control}
              name="borrowerName"
              label={t('library.loan.borrowerName')}
              required
            />
          )}
          <NumberField
            control={form.control}
            name="quantity"
            label={t('library.loan.quantity')}
            required
            min={1}
            max={available}
          />
          <DateField
            control={form.control}
            name="loanedOn"
            label={t('library.loan.loanedOn')}
            required
          />
          <DateField control={form.control} name="dueOn" label={t('library.loan.dueOn')} />
          <TextField
            control={form.control}
            name="note"
            label={t('library.title.note')}
            className="sm:col-span-2"
          />
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
