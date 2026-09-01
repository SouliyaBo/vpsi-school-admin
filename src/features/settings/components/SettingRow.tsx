import { AlertTriangle, Globe, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Setting } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { settingMeta } from '../catalog';
import { SettingValueField, type SettingDraft } from './SettingValueField';

interface SettingRowProps {
  setting: Setting;
  draft?: SettingDraft;
  /** True once the draft differs from the stored value. */
  isDirty: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onChange: (key: string, draft: SettingDraft) => void;
  onRevert: (key: string) => void;
  onDelete: (setting: Setting) => void;
}

/**
 * One labelled setting.
 *
 * The dotted key is shown under the label on purpose: it is what an
 * administrator finds in the API docs, in an audit entry and in a support
 * conversation, and a screen that only shows the translated label leaves them
 * guessing which row an error message is about.
 */
export function SettingRow({
  setting,
  draft,
  isDirty,
  canEdit,
  canDelete,
  onChange,
  onRevert,
  onDelete,
}: SettingRowProps) {
  const { t } = useTranslation();
  const fieldId = useId();
  const meta = settingMeta(setting);
  // The weekday editor is seven checkboxes, not one control: the row label
  // names the group through `aria-labelledby` instead of pointing `htmlFor` at
  // an element that does not exist.
  const labelledControl = meta.kind !== 'weekdays';

  /**
   * The explanation under the label, translated where possible.
   *
   * `Setting.description` is stored by the seed in English and is the same text
   * for every reader, so it cannot follow the language switcher. A catalogued
   * key takes its hint from the i18n catalogue instead; the stored description
   * remains the fallback, which is what a setting the office added itself —
   * with a note it typed — should show.
   */
  const hint =
    (meta.name ? t(`setting.hint.${meta.name}`, { defaultValue: '' }) : '') ||
    setting.description ||
    '';

  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-2 border-b border-border px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]',
        isDirty && 'bg-warning-subtle/30',
      )}
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Label
            htmlFor={labelledControl ? fieldId : undefined}
            id={`${fieldId}-label`}
            className="font-medium"
          >
            {meta.name ? t(`setting.label.${meta.name}`) : setting.key}
          </Label>
          {isDirty && <Badge variant="warning">{t('setting.unsaved')}</Badge>}
        </div>

        <p className="break-all font-mono text-xs text-muted-foreground">{setting.key}</p>

        <div className="flex flex-wrap items-center gap-1.5">
          {setting.isPublic && (
            <Badge variant="info" title={t('setting.publicHint')}>
              <Globe className="size-3" aria-hidden />
              {t('setting.public')}
            </Badge>
          )}
          {setting.isSystem && (
            <Badge variant="secondary" title={t('setting.systemHint')}>
              <Lock className="size-3" aria-hidden />
              {t('setting.system')}
            </Badge>
          )}
        </div>

        {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>

      <div className="min-w-0 space-y-2">
        <SettingValueField
          id={fieldId}
          meta={meta}
          stored={setting.value}
          draft={draft}
          disabled={!canEdit}
          onChange={(next) => onChange(setting.key, next)}
        />

        {draft?.invalid && (
          <p role="alert" className="text-xs text-danger">
            {meta.kind === 'json' ? t('setting.invalidJson') : t('setting.valueRequired')}
          </p>
        )}

        {meta.cautionKey && (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            {t(meta.cautionKey)}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {draft && (
            <Button variant="ghost" size="sm" onClick={() => onRevert(setting.key)}>
              <RotateCcw />
              {t('setting.revert')}
            </Button>
          )}
          {canDelete && !setting.isSystem && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:text-danger"
              onClick={() => onDelete(setting)}
            >
              <Trash2 />
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
