import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { PermissionAction, PermissionResource } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ACTION_COLUMNS,
  RESOURCE_GROUPS,
  actionApplies,
  clearGroup,
  grantReadToGroup,
  isGranted,
  toggleGrant,
  ungroupedResources,
  type PermissionMatrix,
} from '../permission-matrix';

interface PermissionMatrixEditorProps {
  value: PermissionMatrix;
  onChange: (next: PermissionMatrix) => void;
  /** Read-only rendering, used for a system role whose matrix the API pins. */
  disabled?: boolean;
}

/**
 * The permission grid: 32 resources down, seven actions across.
 *
 * Two things keep it readable at that size. The rows are grouped the way the
 * sidebar is, and `manage` is drawn as the last column with the four verbs it
 * covers shown ticked-but-disabled underneath it — so "full access to
 * classrooms" is one click and still looks like what it means.
 *
 * Nothing here decides what is allowed. The same matrix is enforced by
 * `PermissionsGuard` on every request; this only writes it down.
 */
export function PermissionMatrixEditor({
  value,
  onChange,
  disabled = false,
}: PermissionMatrixEditorProps) {
  const { t } = useTranslation();

  // Empty in normal operation. A resource added to the API and mirrored into
  // `PERMISSION_RESOURCES` but not yet placed in a group would otherwise vanish
  // from the grid, silently ungrantable.
  const orphans = ungroupedResources();
  const groups = orphans.length
    ? [...RESOURCE_GROUPS, { labelKey: 'other', resources: orphans }]
    : RESOURCE_GROUPS;

  const actionLabel = (action: PermissionAction) => t(`role.action.${action}`);

  return (
    // A bounded box of its own rather than 32 more rows of dialog: the header
    // row can then stay put while the grid scrolls under it.
    <div className="scrollbar-thin max-h-80 overflow-auto rounded-md border border-border">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr>
            <th
              scope="col"
              className="bg-muted px-3 py-2 text-start text-xs font-medium text-muted-foreground"
            >
              {t('role.resourceColumn')}
            </th>
            {ACTION_COLUMNS.map((action) => (
              <th
                key={action}
                scope="col"
                className={cn(
                  'w-16 bg-muted px-1 py-2 text-center text-xs font-medium text-muted-foreground',
                  action === 'manage' && 'border-s border-border text-foreground',
                )}
              >
                {actionLabel(action)}
              </th>
            ))}
          </tr>
        </thead>

        {groups.map((group) => (
          <tbody key={group.labelKey} className="border-t border-border">
            <tr className="bg-muted/30">
              <th
                scope="colgroup"
                colSpan={ACTION_COLUMNS.length + 1}
                className="px-3 py-1.5 text-start"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`role.group.${group.labelKey}`)}
                  </span>
                  {!disabled && (
                    // Building a role from nothing means 32 rows of clicking, and
                    // most rows in most roles are "may look, may not touch".
                    <span className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs font-normal"
                        onClick={() => onChange(grantReadToGroup(value, group.resources))}
                      >
                        {t('role.grantGroupRead')}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs font-normal"
                        onClick={() => onChange(clearGroup(value, group.resources))}
                      >
                        {t('role.clearGroup')}
                      </Button>
                    </span>
                  )}
                </span>
              </th>
            </tr>

            {group.resources.map((resource) => (
              <ResourceRow
                key={resource}
                resource={resource}
                matrix={value}
                disabled={disabled}
                onToggle={(action) => onChange(toggleGrant(value, resource, action))}
              />
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function ResourceRow({
  resource,
  matrix,
  disabled,
  onToggle,
}: {
  resource: PermissionResource;
  matrix: PermissionMatrix;
  disabled: boolean;
  onToggle: (action: PermissionAction) => void;
}) {
  const { t } = useTranslation();
  const resourceLabel = t(`role.resource.${resource}`);
  const managed = matrix[resource]?.includes('manage') ?? false;

  return (
    <tr className="border-t border-border/60 even:bg-muted/10">
      <th scope="row" className="px-3 py-1.5 text-start font-normal">
        {resourceLabel}
      </th>

      {ACTION_COLUMNS.map((action) => {
        if (!actionApplies(resource, action)) {
          return <td key={action} aria-hidden className="px-1 py-1.5" />;
        }

        const checked = isGranted(matrix, resource, action);
        // Under `manage`, the four verbs are consequences rather than choices:
        // shown so the row reads truthfully, locked so a click cannot half-undo
        // the umbrella grant.
        const locked = disabled || (managed && action !== 'manage');

        return (
          <td
            key={action}
            className={cn(
              'px-1 py-1.5 text-center',
              action === 'manage' && 'border-s border-border',
            )}
          >
            <Checkbox
              checked={checked}
              disabled={locked}
              onCheckedChange={() => onToggle(action)}
              aria-label={`${resourceLabel} — ${t(`role.action.${action}`)}`}
            />
          </td>
        );
      })}
    </tr>
  );
}
