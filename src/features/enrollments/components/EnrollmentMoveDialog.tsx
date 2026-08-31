import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, GraduationCap, RotateCcw, UserMinus } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { stripEmpty } from '@/lib/payload';
import { optionalId, optionalText } from '@/lib/zod-helpers';
import { vmsg } from '@/lib/form-message';
import type { EnrollmentStatus } from '@/types/enums';
import type { Enrollment } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, TextareaField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { useChangeEnrollmentStatus } from '../api';

const baseSchema = z.object({
  transferredToClassroomId: optionalId(),
  reason: optionalText(500),
});

/** Only a transfer needs a destination; the other moves just take a reason. */
const transferSchema = baseSchema.refine((values) => Boolean(values.transferredToClassroomId), {
  path: ['transferredToClassroomId'],
  message: vmsg('validation.required'),
});

type StatusFormValues = z.infer<typeof baseSchema>;

export const STATUS_ICONS: Partial<Record<EnrollmentStatus, typeof ArrowRightLeft>> = {
  transferred: ArrowRightLeft,
  promoted: GraduationCap,
  dropped: UserMinus,
  repeated: RotateCcw,
  active: RotateCcw,
};

export const STATUS_LABEL_KEYS: Record<EnrollmentStatus, string> = {
  transferred: 'enrollment.transfer',
  promoted: 'enrollment.promote',
  dropped: 'enrollment.drop',
  repeated: 'enrollment.repeat',
  active: 'enrollment.reactivate',
};

/** The move a caller has opened the dialog for: one enrollment, one destination status. */
export interface EnrollmentMove {
  enrollment: Enrollment;
  status: EnrollmentStatus;
}

interface Props {
  move: EnrollmentMove | null;
  onClose: () => void;
  /**
   * The class the student sits in today, for the subtitle. The roster knows it
   * because it was picked; the student page reads it off the populated row.
   */
  fromLabel?: string;
}

/**
 * Moves one enrollment to another status — a transfer, a promotion, a drop.
 *
 * Shared by the class roster and the student's own page, because "move this
 * child to another room" is asked from both: the roster when working through a
 * class, the student page when the office has one child in front of them. One
 * component so the rules — a destination is required only for a transfer, the
 * reason goes into the history — cannot drift between the two.
 */
export function EnrollmentMoveDialog({ move, onClose, fromLabel }: Props) {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const changeStatus = useChangeEnrollmentStatus();

  const form = useForm<StatusFormValues>({
    // Which rule applies depends on the move being made, so the resolver follows
    // the open dialog rather than carrying the branch inside one schema.
    resolver: zodResolver(move?.status === 'transferred' ? transferSchema : baseSchema),
    defaultValues: { transferredToClassroomId: '', reason: '' },
  });

  // Reset on open rather than at the call site, so no caller can forget and
  // carry the previous move's destination into the next one.
  useEffect(() => {
    if (move) form.reset({ transferredToClassroomId: '', reason: '' });
  }, [move, form]);

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, activeYear.data?.id);

  function submit(values: StatusFormValues) {
    if (!move) return;

    changeStatus
      .mutateAsync({
        id: move.enrollment.id,
        body: { status: move.status, ...(stripEmpty(values) as StatusFormValues) },
      })
      .then(onClose)
      .catch(() => {});
  }

  return (
    <FormDialog
      open={move !== null}
      onOpenChange={(open) => !open && onClose()}
      title={move ? t(STATUS_LABEL_KEYS[move.status]) : ''}
      description={
        move
          ? `${move.enrollment.studentCode} — ${move.enrollment.studentNameLo}${
              fromLabel ? ` · ${fromLabel}` : ''
            }`
          : undefined
      }
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={changeStatus.isPending}
      submitLabel={move ? t(STATUS_LABEL_KEYS[move.status]) : undefined}
    >
      <Form {...form}>
        <FieldSection columns={1}>
          {move?.status === 'transferred' && (
            <EntitySelectField
              control={form.control}
              name="transferredToClassroomId"
              label={t('enrollment.transferTo')}
              required
              useOptions={useClassroomsForYear}
              searchPlaceholder={t('enrollment.selectClassroom')}
            />
          )}
          <TextareaField
            control={form.control}
            name="reason"
            label={t('enrollment.statusReason')}
            description={t('enrollment.statusReasonHint')}
          />
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
