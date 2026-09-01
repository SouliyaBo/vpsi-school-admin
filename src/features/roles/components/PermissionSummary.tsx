import { useTranslation } from 'react-i18next';
import type { PermissionAction } from '@/types/enums';
import { Badge } from '@/components/ui/badge';
import { RESOURCE_GROUPS, toMatrix, ungroupedResources } from '../permission-matrix';

/**
 * The matrix as prose rather than as a grid: only what is granted, grouped, one
 * line per resource.
 *
 * This is the reading view — an account holder with `roles:read` and nothing
 * else never opens the editor, and someone auditing "what can the registrar
 * do?" wants the granted rows, not 224 checkboxes of which 40 are ticked.
 */
export function PermissionSummary({
  permissions,
}: {
  permissions: { resource: string; actions: string[] }[] | undefined;
}) {
  const { t } = useTranslation();
  const matrix = toMatrix(permissions);

  const orphans = ungroupedResources();
  const groups = orphans.length
    ? [...RESOURCE_GROUPS, { labelKey: 'other', resources: orphans }]
    : RESOURCE_GROUPS;

  const granted = groups
    .map((group) => ({
      labelKey: group.labelKey,
      rows: group.resources
        .map((resource) => ({ resource, actions: matrix[resource] ?? [] }))
        .filter((row) => row.actions.length > 0),
    }))
    .filter((group) => group.rows.length > 0);

  if (!granted.length) {
    return <p className="text-sm text-muted-foreground">{t('role.noPermissions')}</p>;
  }

  return (
    <div className="space-y-4">
      {granted.map((group) => (
        <div key={group.labelKey} className="space-y-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`role.group.${group.labelKey}`)}
          </h4>
          <ul className="space-y-1">
            {group.rows.map((row) => (
              <li
                key={row.resource}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/50 py-1 last:border-0"
              >
                <span className="text-sm">{t(`role.resource.${row.resource}`)}</span>
                <span className="flex flex-wrap gap-1">
                  {row.actions.includes('manage') ? (
                    // `manage` is the only grant worth calling out on its own —
                    // it is the one that keeps covering new endpoints as they
                    // are added.
                    <Badge variant="info">{t('role.action.manage')}</Badge>
                  ) : (
                    row.actions.map((action) => (
                      <Badge key={action} variant="secondary">
                        {t(`role.action.${action as PermissionAction}`)}
                      </Badge>
                    ))
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
