import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SelectOption } from './fields';

/**
 * Reference picker backed by a server search.
 *
 * A plain `<Select>` cannot be used for villages, teachers or guardians: there
 * are thousands of villages, and the list endpoints are paginated. This keeps
 * the search term in the query, so the dropdown always shows a live page of
 * matches rather than whatever happened to be on page 1.
 */

export interface EntitySelectProps {
  value?: string | null;
  onChange: (value: string | undefined) => void;
  /** Query hook, called with the debounced search term. */
  useOptions: (search: string) => { data?: SelectOption[]; isLoading: boolean };
  /** Label for the current value — the selected row may not be in this page. */
  selectedLabel?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
  invalid?: boolean;
  /**
   * Accessible name, for the standalone case.
   *
   * A `combobox` takes its name from the author, not from its contents, so a
   * picker used without a `<label>` is unnamed to a screen reader. Omit it inside
   * `EntitySelectField`, where `FormLabel` already names the control.
   */
  label?: string;
  /**
   * Wiring `FormControl` puts on its child.
   *
   * `FormLabel` points its `htmlFor` at this id, so without forwarding it the
   * label names nothing, clicking it does not focus the picker, and any
   * `FormDescription` goes unannounced. The trigger is a `<button>`, which is a
   * labelable element, so the association works once the id lands on it.
   */
  id?: string;
  'aria-describedby'?: string;
}

export function EntitySelect({
  value,
  onChange,
  useOptions,
  selectedLabel,
  placeholder,
  searchPlaceholder,
  disabled = false,
  clearable = true,
  className,
  invalid = false,
  label,
  id,
  'aria-describedby': describedBy,
}: EntitySelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const { data: options, isLoading } = useOptions(debouncedSearch);

  const activeLabel =
    selectedLabel ?? options?.find((option) => option.value === value)?.label ?? null;

  return (
    /*
     * `modal` is what makes the list scrollable inside a dialog.
     *
     * Radix's `Dialog.Content` installs `react-remove-scroll` with itself as the
     * only allowed scroll area, and this popover renders in its own portal —
     * outside that node — so every wheel event over the options was swallowed and
     * the list appeared stuck on its first page. A modal popover brings its own
     * `RemoveScroll`, which makes its subtree the allowed one.
     */
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          id={id}
          aria-expanded={open}
          aria-invalid={invalid}
          aria-label={label}
          aria-describedby={describedBy}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            invalid && 'border-danger',
            className,
          )}
        >
          <span className="truncate">
            {value ? (activeLabel ?? '…') : (placeholder ?? t('common.selectPlaceholder'))}
          </span>
          <span className="flex items-center gap-1">
            {clearable && value && (
              <X
                className="size-3.5 opacity-60 hover:opacity-100"
                role="button"
                aria-label={t('common.remove')}
                onClick={(event) => {
                  // Clearing must not also open the dropdown.
                  event.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder ?? t('common.search')}
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
            autoFocus
          />
          {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-64 overflow-y-auto p-1 scrollbar-thin">
          {!isLoading && !options?.length && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('common.noResults')}
            </p>
          )}

          {options?.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                setSearch('');
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-start text-sm',
                'hover:bg-accent disabled:pointer-events-none disabled:opacity-50',
                option.value === value && 'bg-accent',
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.value === value && <Check className="size-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface EntitySelectFieldProps<T extends FieldValues>
  extends Omit<EntitySelectProps, 'value' | 'onChange' | 'invalid'> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  required?: boolean;
}

/** `EntitySelect` bound to a react-hook-form field. */
export function EntitySelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  ...selectProps
}: EntitySelectFieldProps<T>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <EntitySelect
              {...selectProps}
              value={field.value ?? null}
              onChange={field.onChange}
              invalid={Boolean(fieldState.error)}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
