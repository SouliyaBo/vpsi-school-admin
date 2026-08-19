import { useTranslation } from 'react-i18next';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Tone = NonNullable<BadgeProps['variant']>;

/**
 * Status colour is decided once, here, for every enum the API can return — so
 * "active" is the same green in the students table, the teachers drawer and the
 * dashboard, and adding a status is a one-line change.
 */
const TONES: Record<string, Tone> = {
  // shared
  active: 'success',
  inactive: 'secondary',
  suspended: 'warning',
  // student
  new: 'info',
  graduated: 'info',
  no_certificate: 'warning',
  transferred: 'secondary',
  dropped: 'danger',
  // teacher
  on_leave: 'warning',
  resigned: 'secondary',
  retired: 'secondary',
  // semester
  upcoming: 'info',
  grading: 'warning',
  closed: 'secondary',
  // enrollment
  promoted: 'info',
  repeated: 'warning',
  // attendance
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
  sick: 'info',
  // lesson plan
  draft: 'secondary',
  submitted: 'info',
  under_review: 'warning',
  approved: 'success',
  returned: 'danger',
  // jobs / exams
  queued: 'info',
  processing: 'warning',
  completed: 'success',
  failed: 'danger',
  pending: 'warning',
  rejected: 'danger',
  cancelled: 'secondary',
  // subjects
  core: 'default',
  elective: 'info',
  extracurricular: 'secondary',
  // locations
  province: 'default',
  district: 'info',
  village: 'secondary',
};

interface StatusBadgeProps {
  status: string | null | undefined;
  /** i18n namespace holding the labels, e.g. `studentStatus`. */
  namespace: string;
  className?: string;
}

export function StatusBadge({ status, namespace, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  if (!status) return <span className="text-muted-foreground">—</span>;

  const label = t(`${namespace}.${status}`, { defaultValue: status.replace(/_/g, ' ') });

  return (
    <Badge variant={TONES[status] ?? 'secondary'} className={className}>
      {label}
    </Badge>
  );
}

/** Yes/no flags shown in the same visual language as statuses. */
export function BooleanBadge({ value, trueLabel, falseLabel }: { value?: boolean | null; trueLabel?: string; falseLabel?: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={value ? 'success' : 'secondary'}>
      {value ? (trueLabel ?? t('common.yes')) : (falseLabel ?? t('common.no'))}
    </Badge>
  );
}
