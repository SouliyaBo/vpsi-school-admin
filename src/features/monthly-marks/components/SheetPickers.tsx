import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EntitySelect } from '@/components/common/EntitySelect';

/**
 * Which sheet is on screen. `semesterId` empty means the active term.
 *
 * `Record` so it can be handed straight to the query hooks, which pass it
 * through `cleanParams`.
 */
export interface SheetTargetState extends Record<string, unknown> {
  subjectId?: string;
  classroomId?: string;
  semesterId?: string;
}

/**
 * Subject, then class, then term — the order the school's own files are filed in:
 * one workbook per subject, a block per class inside it.
 */
export function SheetPickers({
  value,
  onChange,
  showSubject = true,
  showSemester = true,
  className,
}: {
  value: SheetTargetState;
  onChange: (next: SheetTargetState) => void;
  /** The class-wide result sheet spans every subject, so it picks none. */
  showSubject?: boolean;
  showSemester?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {showSubject && (
        <div className="space-y-1.5">
          <Label htmlFor="sheet-subject">{t('monthlyMark.subject')}</Label>
          <EntitySelect
            id="sheet-subject"
            value={value.subjectId ?? null}
            onChange={(subjectId) => onChange({ ...value, subjectId })}
            useOptions={useSubjectOptions}
            placeholder={t('monthlyMark.selectSubject')}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="sheet-classroom">{t('monthlyMark.classroom')}</Label>
        <EntitySelect
          id="sheet-classroom"
          value={value.classroomId ?? null}
          onChange={(classroomId) => onChange({ ...value, classroomId })}
          useOptions={useClassroomsForYear}
          placeholder={t('monthlyMark.selectClassroom')}
        />
      </div>

      {showSemester && (
        <div className="space-y-1.5">
          <Label htmlFor="sheet-semester">{t('monthlyMark.semester')}</Label>
          <Select
            value={value.semesterId ?? activeSemester.data?.id ?? ''}
            onValueChange={(semesterId) => onChange({ ...value, semesterId })}
          >
            <SelectTrigger id="sheet-semester">
              <SelectValue placeholder={t('monthlyMark.semester')} />
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
      )}
    </div>
  );
}

/**
 * One cell of the form.
 *
 * Held as text while it is being typed — a number input bound to a number cannot
 * represent "0." on the way to "0.5", and clearing it has to mean "unmarked"
 * rather than zero. What leaves is `null` or a number the column can hold.
 */
export function MarkInput({
  value,
  max,
  disabled,
  label,
  onChange,
}: {
  value: number | null;
  max: number;
  disabled?: boolean;
  label: string;
  onChange: (next: number | null) => void;
}) {
  const invalid = value !== null && (value < 0 || value > max);

  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.1"
      min={0}
      max={max}
      aria-label={label}
      aria-invalid={invalid}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === '') return onChange(null);
        const parsed = Number(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className={cn(
        'h-9 w-16 px-2 text-center tabular-nums',
        invalid && 'border-danger focus-visible:ring-danger',
      )}
    />
  );
}

/** ກັນຍາ, ຕຸລາ … — the month names the sheet is columned by. */
export function useMonthName(): (month: number) => string {
  const { t } = useTranslation();
  return (month: number) => t(`month.${month}`);
}
