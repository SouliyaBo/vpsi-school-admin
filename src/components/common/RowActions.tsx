import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Renders in the danger tone and below a separator. */
  destructive?: boolean;
  /** Set from the permission check; a missing permission hides the entry. */
  hidden?: boolean;
  disabled?: boolean;
}

/**
 * The per-row "…" menu.
 *
 * Entries are filtered by `hidden`, which callers wire to `can(resource,
 * action)` — the user never sees an action that would come back 403.
 */
export function RowActions({ actions }: { actions: RowAction[] }) {
  const { t } = useTranslation();
  const visible = actions.filter((action) => !action.hidden);
  if (!visible.length) return null;

  const safe = visible.filter((action) => !action.destructive);
  const destructive = visible.filter((action) => action.destructive);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('common.actions')}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {safe.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {action.icon && <action.icon />}
            {action.label}
          </DropdownMenuItem>
        ))}

        {Boolean(safe.length) && Boolean(destructive.length) && <DropdownMenuSeparator />}

        {destructive.map((action) => (
          <DropdownMenuItem
            key={action.label}
            destructive
            disabled={action.disabled}
            onSelect={action.onSelect}
          >
            {action.icon && <action.icon />}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
