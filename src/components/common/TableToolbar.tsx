import { Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Search box that pushes the term up only after typing settles.
 *
 * Filtering is server-side, so an un-debounced input would fire one request per
 * keystroke against the students collection.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(value);
  const debounced = useDebouncedValue(local);

  // Push the settled term outward…
  useEffect(() => {
    if (debounced !== value) onChange(debounced);
    // `value`/`onChange` intentionally omitted: this effect reacts to typing only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // …and accept an external reset (Clear filters, back-navigation).
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={local}
        onChange={(event) => setLocal(event.target.value)}
        placeholder={placeholder ?? t('common.search')}
        className="ps-8"
        type="search"
      />
    </div>
  );
}

/**
 * Labelled dropdown filter with an "all" option.
 *
 * "All" normally clears the filter, which is the same thing when the endpoint
 * has no default of its own. Where it does — `GET /students` narrows to the
 * children currently attending — clearing would silently mean that default
 * instead of "everything", so `allValue` lets the option send a real value the
 * API understands, and `allLabel` lets it say what it actually returns.
 */
export function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  allValue,
  allLabel,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  className?: string;
  /** Sent when "all" is picked. Omit to clear the filter instead. */
  allValue?: string;
  /** Overrides the default `{placeholder}: all` wording. */
  allLabel?: string;
}) {
  const { t } = useTranslation();
  // With `allValue` set, the option carries that value rather than a sentinel —
  // otherwise the filter it puts in the URL would match no item and the trigger
  // would fall back to showing the placeholder.
  const ALL = allValue ?? '__all__';

  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? allValue : next)}>
      <SelectTrigger className={cn('w-auto min-w-36 gap-1.5', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>
          {allLabel ?? `${placeholder}: ${t('common.all')}`}
        </SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TableToolbar({
  children,
  hasActiveFilters,
  onClearFilters,
  className,
}: {
  children: ReactNode;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {hasActiveFilters && onClearFilters && (
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          <X />
          {t('common.clearFilters')}
        </Button>
      )}
    </div>
  );
}
