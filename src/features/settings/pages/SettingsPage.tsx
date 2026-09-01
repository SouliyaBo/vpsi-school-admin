import { Plus, Save, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { formatDateTime } from '@/lib/utils';
import type { Setting } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { useDeleteSetting, useSaveSettings, useSettings, type SettingInput } from '../api';
import { compareSettings, sameValue, sortCategories } from '../catalog';
import { AddSettingDialog } from '../components/AddSettingDialog';
import { SettingRow } from '../components/SettingRow';
import type { SettingDraft } from '../components/SettingValueField';

/**
 * The settings catalogue, one tab per category.
 *
 * Edits accumulate in `drafts` and are written by an explicit Save rather than
 * on blur. These values are read on hot paths — the grade scale decides every
 * term result, the school day bounds reject a mistyped period — and a
 * half-finished figure that saves itself the moment focus moves is how a school
 * ends up with a passing mark of `5` because someone was on their way to `50`.
 *
 * Only `key` and `value` are sent on save: the API's upsert keeps the stored
 * `category`, `description` and `isPublic` when they are omitted, so a row
 * cannot quietly reclassify a setting it only meant to re-value.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const canEdit = can('settings', 'update');
  const canDelete = can('settings', 'delete');

  const list = useSettings();
  const save = useSaveSettings();
  const remove = useDeleteSetting();

  const [drafts, setDrafts] = useState<Record<string, SettingDraft>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Setting | null>(null);
  const [tab, setTab] = useState<string | null>(null);

  // Memoised so the derivations below do not see a new array on every render.
  const settings = useMemo(() => list.data ?? [], [list.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, Setting[]>();
    for (const setting of settings) {
      const bucket = map.get(setting.category);
      if (bucket) bucket.push(setting);
      else map.set(setting.category, [setting]);
    }
    for (const bucket of map.values()) bucket.sort(compareSettings);
    return map;
  }, [settings]);

  const categories = useMemo(() => sortCategories([...grouped.keys()]), [grouped]);
  // A tab chosen before a refetch can disappear (its last custom setting was
  // deleted), so the selection is validated against the current categories.
  const activeTab = tab && grouped.has(tab) ? tab : categories[0];

  const changed = useMemo(
    () =>
      settings.filter((setting) => {
        const draft = drafts[setting.key];
        return draft && !draft.invalid && !sameValue(draft.value, setting.value);
      }),
    [settings, drafts],
  );

  const invalidCount = Object.values(drafts).filter((draft) => draft.invalid).length;

  const lastUpdated = useMemo(() => {
    const stamps = settings
      .map((setting) => setting.updatedAt)
      .filter((value): value is string => Boolean(value));
    return stamps.length
      ? stamps.reduce((latest, value) => (value > latest ? value : latest))
      : null;
  }, [settings]);

  function changeDraft(key: string, draft: SettingDraft) {
    setDrafts((previous) => ({ ...previous, [key]: draft }));
  }

  function revertDraft(key: string) {
    setDrafts(({ [key]: _dropped, ...rest }) => rest);
  }

  function saveChanges() {
    const entries: SettingInput[] = changed.map((setting) => ({
      key: setting.key,
      value: drafts[setting.key]!.value,
    }));
    const savedKeys = entries.map((entry) => entry.key);

    void save
      .mutateAsync(entries)
      .then(() =>
        // Only the keys that went to the server are cleared — an unfinished
        // draft elsewhere on the page is left as it was.
        setDrafts((previous) =>
          Object.fromEntries(Object.entries(previous).filter(([key]) => !savedKeys.includes(key))),
        ),
      )
      .catch(() => {
        /* the global handler toasts; the drafts stay for another attempt */
      });
  }

  function createSetting(input: SettingInput) {
    void save
      .mutateAsync([input])
      .then(() => {
        setAddOpen(false);
        setTab(input.category ?? null);
      })
      .catch(() => {
        /* toasted globally; the dialog stays open with the values intact */
      });
  }

  if (list.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('nav.settings')} description={t('setting.subtitle')} />
        <Skeleton className="h-9 w-72" />
        <Card className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <Skeleton className="h-5 w-64" />
              <Skeleton className="h-9 flex-1" />
            </div>
          ))}
        </Card>
      </div>
    );
  }

  if (list.error) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('nav.settings')} description={t('setting.subtitle')} />
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.settings')}
        description={t('setting.subtitle')}
        actions={
          canEdit && (
            <Button variant="outline" onClick={() => setAddOpen(true)}>
              <Plus />
              {t('setting.create')}
            </Button>
          )
        }
      />

      {!canEdit && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t('setting.readOnly')}
        </p>
      )}

      {settings.length === 0 ? (
        <Card>
          <EmptyState title={t('common.noData')} description={t('setting.emptyHint')} />
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={setTab}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            {categories.map((category) => {
              const dirtyInTab = changed.filter((setting) => setting.category === category).length;
              return (
                <TabsTrigger key={category} value={category}>
                  {t(`setting.categories.${category}`, { defaultValue: category })}
                  {dirtyInTab > 0 && (
                    <Badge variant="warning" className="px-1.5 py-0">
                      {dirtyInTab}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category} value={category}>
              <Card className="overflow-hidden p-0">
                {(grouped.get(category) ?? []).map((setting) => (
                  <SettingRow
                    key={setting.key}
                    setting={setting}
                    draft={drafts[setting.key]}
                    isDirty={changed.some((entry) => entry.key === setting.key)}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onChange={changeDraft}
                    onRevert={revertDraft}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {lastUpdated && (
        <p className="text-xs text-muted-foreground">
          {t('common.updatedAt')}: {formatDateTime(lastUpdated)}
        </p>
      )}

      {/* The bar only appears once there is something to save, so it never
          covers the last row of a page nobody is editing. */}
      {canEdit && (changed.length > 0 || invalidCount > 0) && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <p className="text-sm">
            {invalidCount > 0 ? (
              <span className="text-danger">
                {t('setting.fixInvalid', { count: invalidCount })}
              </span>
            ) : (
              t('setting.pendingChanges', { count: changed.length })
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setDrafts({})} disabled={save.isPending}>
              <Undo2 />
              {t('setting.discard')}
            </Button>
            <Button
              onClick={saveChanges}
              loading={save.isPending}
              disabled={changed.length === 0 || save.isPending}
            >
              <Save />
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}

      <AddSettingDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isSubmitting={save.isPending}
        onSubmit={createSetting}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('setting.deleteTitle')}
        description={deleteTarget?.key}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          const key = deleteTarget.key;
          void remove
            .mutateAsync(key)
            .then(() => revertDraft(key))
            .finally(() => setDeleteTarget(null));
        }}
      />
    </div>
  );
}
