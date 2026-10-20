import { useTranslation } from 'react-i18next';
import { classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { cn, refId } from '@/lib/utils';
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
 * Class, then subject, then term.
 *
 * The school's own files run the other way — one workbook per subject, a block
 * per class inside it — but a subject exists once per grade, so the subject list
 * cannot be drawn until the class says which grade to draw it from. Picking the
 * class first is what makes the second picker show eight relevant subjects
 * rather than forty-six.
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

  /**
   * The subject list is narrowed to the class that is picked.
   *
   * Every subject exists once per grade, so the unfiltered list is 46 rows of
   * which at most eight can be marked for the class on screen — and choosing a
   * ມ.7 subject for a ມ.1 class produces a sheet that is wrong in a way nothing
   * on it says. `marked` drops the two ສາຍວິຊາ that are taught but not marked,
   * which the API refuses a sheet for anyway.
   */
  const classroom = classrooms.useDetail(value.classroomId);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;
  const useSubjectsForClass = (search: string) => useSubjectOptions(search, gradeLevelId, 'marked');

  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      <div className="space-y-1.5">
        <Label htmlFor="sheet-classroom">{t('monthlyMark.classroom')}</Label>
        <EntitySelect
          id="sheet-classroom"
          value={value.classroomId ?? null}
          // A class of another grade has other subjects, so the one on screen is
          // dropped rather than left pointing at a sheet this class cannot have.
          onChange={(classroomId) => onChange({ ...value, classroomId, subjectId: undefined })}
          useOptions={useClassroomsForYear}
          placeholder={t('monthlyMark.selectClassroom')}
        />
      </div>

      {showSubject && (
        <div className="space-y-1.5">
          <Label htmlFor="sheet-subject">{t('monthlyMark.subject')}</Label>
          <EntitySelect
            id="sheet-subject"
            value={value.subjectId ?? null}
            onChange={(subjectId) => onChange({ ...value, subjectId })}
            useOptions={useSubjectsForClass}
            disabled={!value.classroomId}
            placeholder={
              value.classroomId ? t('monthlyMark.selectSubject') : t('monthlyMark.pickClassFirst')
            }
          />
        </div>
      )}

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

/** More than the two decimal places a mark is typed to. */
const TOO_PRECISE = /\.\d{3,}/;

/**
 * One cell of the form.
 *
 * Held as text while it is being typed — a number input bound to a number cannot
 * represent "0." on the way to "0.5", and clearing it has to mean "unmarked"
 * rather than zero. What leaves is `null` or a number the column can hold.
 *
 * Marks are typed to two decimal places at most (the office's rule since 20 Oct
 * 2026; it was one before): a third digit after the point is not taken.
 */
export function MarkInput({
  value,
  max,
  disabled,
  label,
  suggested,
  onChange,
}: {
  value: number | null;
  max: number;
  disabled?: boolean;
  label: string;
  /** Full marks put there for the teacher, not yet saved — drawn faintly. */
  suggested?: boolean;
  onChange: (next: number | null) => void;
}) {
  const invalid = value !== null && (value < 0 || value > max);

  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.01"
      min={0}
      max={max}
      aria-label={label}
      aria-invalid={invalid}
      disabled={disabled}
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw === '') return onChange(null);
        if (TOO_PRECISE.test(raw)) return;
        const parsed = Number(raw);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className={cn(
        'h-9 w-16 px-2 text-center tabular-nums',
        suggested && 'border-dashed text-muted-foreground',
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
