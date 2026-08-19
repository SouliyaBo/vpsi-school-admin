import { Plus, Trash2 } from 'lucide-react';
import {
  useFieldArray,
  type Control,
  type FieldArray,
  type FieldArrayPath,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  FieldsetMessage,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DAY_ORDER, weekdayKey } from '../schedule';
import { EMPTY_PERIOD } from '../schemas';

const COLUMNS =
  'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_auto]';

/**
 * The weekly periods of one assignment, as editable rows.
 *
 * Laid out as a table rather than as labelled fields: five periods a week is
 * normal, and repeating six labels per row would bury the values. The column
 * headings carry the labels on desktop, and each control names itself with
 * `aria-label` so the header row can be hidden on narrow screens without
 * leaving the inputs unnamed.
 *
 * Generic over the form it sits in, because the bulk dialog nests one of these
 * per classroom (`targets.2.schedule`) while the single form has just the one
 * (`schedule`).
 */
export function ScheduleEditor<T extends FieldValues>({
  control,
  name,
  /** Column headings are printed once per dialog, not once per classroom. */
  showHeader = true,
}: {
  control: Control<T>;
  name: FieldArrayPath<T>;
  showHeader?: boolean;
}) {
  const { t } = useTranslation();
  const { fields, append, remove } = useFieldArray({ control, name });

  // The array element type is opaque to this component; every row is a period.
  const at = (index: number, key: string) => `${name}.${index}.${key}` as FieldPath<T>;

  return (
    <div className="space-y-2">
      {showHeader && (
        <div
          className={`hidden gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid ${COLUMNS}`}
        >
          <span>{t('assignment.day')}</span>
          <span>{t('assignment.startTime')}</span>
          <span>{t('assignment.endTime')}</span>
          <span>{t('assignment.room')}</span>
          <span>{t('assignment.periodNumber')}</span>
          <span>{t('assignment.rotating')}</span>
          <span className="w-8" />
        </div>
      )}

      {fields.map((field, index) => (
        <div
          key={field.id}
          className={`grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:items-start sm:border-0 sm:p-0 ${COLUMNS}`}
        >
          <FormField
            control={control}
            name={at(index, 'dayOfWeek')}
            render={({ field: dayField }) => (
              <FormItem className="col-span-2 space-y-1 sm:col-span-1">
                <Select
                  value={String(dayField.value)}
                  onValueChange={(value) => dayField.onChange(Number(value))}
                >
                  <FormControl>
                    <SelectTrigger aria-label={t('assignment.day')}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {DAY_ORDER.map((day) => (
                      <SelectItem key={day} value={String(day)}>
                        {t(weekdayKey(day))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={at(index, 'startTime')}
            render={({ field: timeField }) => (
              <FormItem className="space-y-1">
                <FormControl>
                  <Input
                    {...timeField}
                    type="time"
                    value={timeField.value ?? ''}
                    aria-label={t('assignment.startTime')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={at(index, 'endTime')}
            render={({ field: timeField }) => (
              <FormItem className="space-y-1">
                <FormControl>
                  <Input
                    {...timeField}
                    type="time"
                    value={timeField.value ?? ''}
                    aria-label={t('assignment.endTime')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={at(index, 'room')}
            render={({ field: roomField }) => (
              <FormItem className="space-y-1">
                <FormControl>
                  <Input
                    {...roomField}
                    value={roomField.value ?? ''}
                    placeholder={t('assignment.room')}
                    aria-label={t('assignment.room')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name={at(index, 'periodNumber')}
            render={({ field: numberField }) => (
              <FormItem className="space-y-1">
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    name={numberField.name}
                    ref={numberField.ref}
                    onBlur={numberField.onBlur}
                    value={numberField.value ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value;
                      numberField.onChange(raw === '' ? undefined : Number(raw));
                    }}
                    placeholder="—"
                    aria-label={t('assignment.periodNumber')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Ticking this is how the school's Friday swap gets recorded: two
              teachers trading two classes in one slot, which the clash check
              would otherwise read as a triple double-booking. It only waives the
              check against other periods that are ticked too. */}
          <FormField
            control={control}
            name={at(index, 'isRotating')}
            render={({ field: rotatingField }) => (
              <FormItem className="flex items-center gap-2 space-y-0 sm:h-9">
                <FormControl>
                  <Checkbox
                    checked={rotatingField.value === true}
                    onCheckedChange={(checked) => rotatingField.onChange(checked === true)}
                    aria-label={t('assignment.rotating')}
                  />
                </FormControl>
                {/* The header names it on desktop; narrow screens have no header. */}
                <span className="text-xs text-muted-foreground sm:hidden">
                  {t('assignment.rotating')}
                </span>
              </FormItem>
            )}
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            // The API requires at least one period, so the last row cannot go.
            disabled={fields.length === 1}
            onClick={() => remove(index)}
            aria-label={t('assignment.removePeriod')}
          >
            <Trash2 className="text-danger" />
          </Button>
        </div>
      ))}

      <FieldsetMessage control={control} name={name as FieldPath<T>} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ ...EMPTY_PERIOD } as FieldArray<T, FieldArrayPath<T>>)}
      >
        <Plus />
        {t('assignment.addPeriod')}
      </Button>
    </div>
  );
}
