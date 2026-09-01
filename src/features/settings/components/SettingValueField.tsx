import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { SettingMeta } from '../catalog';

/**
 * One in-progress edit.
 *
 * `text` is kept alongside `value` for the JSON editor only: while the operator
 * is mid-keystroke the text does not parse, and re-deriving the textarea's
 * contents from a parsed value would erase what they were typing. `invalid`
 * marks a draft the Save button must refuse.
 */
export interface SettingDraft {
  value: unknown;
  text?: string;
  invalid?: boolean;
}

interface SettingValueFieldProps {
  id: string;
  meta: SettingMeta;
  /** The stored value, shown when no edit is in progress. */
  stored: unknown;
  draft?: SettingDraft;
  disabled?: boolean;
  onChange: (draft: SettingDraft) => void;
}

/** Weekday indices as `SchedulePeriod.dayOfWeek` numbers them: 0 = Sunday. */
const WEEKDAYS = [
  { day: 0, labelKey: 'weekday.sun' },
  { day: 1, labelKey: 'weekday.mon' },
  { day: 2, labelKey: 'weekday.tue' },
  { day: 3, labelKey: 'weekday.wed' },
  { day: 4, labelKey: 'weekday.thu' },
  { day: 5, labelKey: 'weekday.fri' },
  { day: 6, labelKey: 'weekday.sat' },
] as const;

export function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2);
}

/**
 * Renders the editor the key's `kind` calls for.
 *
 * Deliberately not a react-hook-form field: the two dozen rows on this screen
 * hold values of six different types under keys containing dots, which
 * `useForm` addresses as nested paths — `school.nameLo` would become an object
 * named `school`. Each row is a small controlled input instead, and the page
 * owns the draft map.
 */
export function SettingValueField({
  id,
  meta,
  stored,
  draft,
  disabled = false,
  onChange,
}: SettingValueFieldProps) {
  const { t } = useTranslation();
  const current = draft ? draft.value : stored;

  switch (meta.kind) {
    case 'boolean':
      return (
        <Switch
          id={id}
          checked={Boolean(current)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ value: checked })}
        />
      );

    case 'number':
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          className="max-w-40"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          disabled={disabled}
          value={typeof current === 'number' ? String(current) : ''}
          onChange={(event) => {
            const raw = event.target.value;
            // A setting has no "absent" state — the API requires a defined
            // value — so a cleared box is an invalid draft, not a deletion.
            onChange(
              raw === ''
                ? { value: undefined, invalid: true }
                : { value: Number(raw), invalid: Number.isNaN(Number(raw)) },
            );
          }}
        />
      );

    case 'time':
      return (
        <Input
          id={id}
          type="time"
          className="max-w-40"
          disabled={disabled}
          value={typeof current === 'string' ? current : ''}
          onChange={(event) =>
            onChange({ value: event.target.value, invalid: event.target.value === '' })
          }
        />
      );

    case 'select':
      return (
        <Select
          value={typeof current === 'string' ? current : ''}
          disabled={disabled}
          onValueChange={(value) => onChange({ value })}
        >
          <SelectTrigger id={id} className="max-w-60">
            <SelectValue placeholder={t('common.selectPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {(meta.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {meta.optionLabelKey ? t(meta.optionLabelKey(option)) : option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'weekdays': {
      const selected = Array.isArray(current) ? current.map(Number) : [];
      return (
        <div
          className="flex flex-wrap gap-x-4 gap-y-2"
          role="group"
          aria-labelledby={`${id}-label`}
        >
          {WEEKDAYS.map(({ day, labelKey }) => (
            <div key={day} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${day}`}
                checked={selected.includes(day)}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const next = checked
                    ? [...selected, day].sort((a, b) => a - b)
                    : selected.filter((entry) => entry !== day);
                  // An empty list would close the school; the API accepts it,
                  // so the guard belongs here.
                  onChange({ value: next, invalid: next.length === 0 });
                }}
              />
              <Label htmlFor={`${id}-${day}`} className="cursor-pointer font-normal">
                {t(labelKey)}
              </Label>
            </div>
          ))}
        </div>
      );
    }

    case 'json':
      return (
        <Textarea
          id={id}
          spellCheck={false}
          rows={Math.min(14, prettyJson(stored).split('\n').length + 1)}
          disabled={disabled}
          className={cn('font-mono text-xs', draft?.invalid && 'border-danger')}
          value={draft?.text ?? prettyJson(stored)}
          onChange={(event) => {
            const text = event.target.value;
            try {
              onChange({ value: JSON.parse(text) as unknown, text });
            } catch {
              onChange({ value: undefined, text, invalid: true });
            }
          }}
        />
      );

    case 'textarea':
      return (
        <Textarea
          id={id}
          rows={2}
          disabled={disabled}
          value={typeof current === 'string' ? current : ''}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      );

    case 'text':
    default:
      return (
        <Input
          id={id}
          disabled={disabled}
          value={typeof current === 'string' ? current : ''}
          onChange={(event) => onChange({ value: event.target.value })}
        />
      );
  }
}
