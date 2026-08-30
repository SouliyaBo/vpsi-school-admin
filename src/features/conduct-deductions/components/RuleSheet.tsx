import { Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { errorMessage } from '@/lib/error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FormDialog } from '@/components/common/FormDialog';
import type { ConductRule } from '@/types/entities';
import { conductRules, useConductRules, useEscalationLadder } from '../api';
import { NotifyList } from './NotifyList';

/**
 * ລະບຽບການຕັດຄະແນນ — the published sheet, and the ladder underneath it.
 *
 * Grouped by what an occurrence costs, because that is how the sheet is printed:
 * four columns, 5 / 10 / 15 / 20, and a teacher finds a rule by knowing roughly
 * how serious it is. The columns are whatever point values the rules actually
 * use rather than a fixed four, so a school that adds a 25-point rule gets a
 * fifth column instead of a validation error.
 *
 * Editable here because the sheet is reissued every year and reworded in
 * between. Rewording a rule does not rewrite the deductions already taken under
 * it — each row keeps the wording it was applied with — which is what makes
 * editing safe enough to leave in the office's hands.
 */
export function RuleSheet() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const mayEdit = can('conduct-scores', 'manage');

  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [editing, setEditing] = useState<ConductRule | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<ConductRule | null>(null);

  const rules = useConductRules(showWithdrawn ? { includeWithdrawn: true } : {});
  const ladder = useEscalationLadder();
  const remove = conductRules.useDelete();

  /** The sheet's columns: one per distinct cost, cheapest first. */
  const columns = useMemo(() => {
    const byPoints = new Map<number, ConductRule[]>();
    for (const rule of rules.data?.data ?? []) {
      byPoints.set(rule.points, [...(byPoints.get(rule.points) ?? []), rule]);
    }
    return [...byPoints.entries()].sort(([a], [b]) => a - b);
  }, [rules.data]);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <div className="flex items-center gap-2">
            <Switch
              id="show-withdrawn"
              checked={showWithdrawn}
              onCheckedChange={setShowWithdrawn}
            />
            <Label htmlFor="show-withdrawn" className="text-sm font-normal">
              {t('conductRule.showWithdrawn')}
            </Label>
          </div>
          {mayEdit && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus />
              {t('conductRule.add')}
            </Button>
          )}
        </CardContent>
      </Card>

      {rules.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : rules.error ? (
        // Never fall through to the empty state on a failed load: "there are no
        // rules" is the one answer that would send the office off to retype a
        // sheet that is already there.
        <Card>
          <CardContent className="pt-5">
            <ErrorState error={rules.error} onRetry={rules.refetch} compact />
          </CardContent>
        </Card>
      ) : columns.length === 0 ? (
        <Card>
          <CardContent className="pt-5">
            <EmptyState
              icon={ScrollText}
              title={t('conductRule.empty')}
              description={t('conductRule.emptyHint')}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {columns.map(([points, items]) => (
            <Card key={points}>
              <CardContent className="space-y-2 pt-5">
                <h3 className="text-sm font-semibold">{t('conductRule.column', { points })}</h3>
                <ul className="divide-y">
                  {items.map((rule) => (
                    <li key={rule.id} className="flex items-start justify-between gap-2 py-2">
                      <span className="min-w-0 text-sm">
                        <span className="font-medium">{rule.code}</span>{' '}
                        <span className={rule.isActive ? '' : 'text-muted-foreground line-through'}>
                          {i18n.language === 'en' && rule.nameEn ? rule.nameEn : rule.nameLo}
                        </span>
                        {!rule.isActive && (
                          <Badge variant="outline" className="ms-2">
                            {t('conductRule.withdrawn')}
                          </Badge>
                        )}
                      </span>
                      {mayEdit && (
                        <span className="flex shrink-0 gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => setEditing(rule)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeleting(rule)}>
                            <Trash2 />
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* The ໝາຍເຫດ, served by the API so the screen cannot restate it wrongly. */}
      <Card>
        <CardContent className="space-y-2 pt-5">
          <h3 className="text-sm font-semibold">{t('conductRule.ladderTitle')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('conductRule.ladderHint', { base: ladder.data?.baseScore ?? 100 })}
          </p>
          <ul className="space-y-1.5">
            {(ladder.data?.rungs ?? [])
              .filter((rung) => rung.notify.length > 0)
              .map((rung) => (
                <li key={rung.level} className="text-xs">
                  <Badge variant="outline" className="me-2 tabular-nums">
                    {t('conductRule.fromPoints', { points: rung.minDeducted })}
                  </Badge>
                  {t(`conductEscalation.${rung.level}`)} — <NotifyList parties={rung.notify} />
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>

      <RuleDialog
        open={isAdding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsAdding(false);
            setEditing(null);
          }
        }}
        rule={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('conductRule.deleteConfirm', { code: deleting?.code ?? '' })}
        description={t('conductRule.deleteHint')}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          // Closed either way: a refusal — the rule has already been applied —
          // is reported by the toast, and leaving the dialog open would suggest
          // there is something left to confirm.
          void remove.mutateAsync(deleting.id).finally(() => setDeleting(null));
        }}
      />
    </div>
  );
}

/** Add or amend one line of the sheet. */
function RuleDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ConductRule | null;
}) {
  const { t } = useTranslation();
  const create = conductRules.useCreate();
  const update = conductRules.useUpdate();

  const [code, setCode] = useState('');
  const [points, setPoints] = useState('10');
  const [nameLo, setNameLo] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saveError, setSaveError] = useState<unknown>(null);

  // Re-seeded every time the dialog opens. The office types two or three rules
  // in a sitting, and a form still holding the last one is either retyped over
  // or filed as a duplicate of the rule just saved.
  useEffect(() => {
    if (!open) return;
    setCode(rule?.code ?? '');
    setPoints(String(rule?.points ?? 10));
    setNameLo(rule?.nameLo ?? '');
    setNameEn(rule?.nameEn ?? '');
    setIsActive(rule?.isActive ?? true);
    setSaveError(null);
  }, [open, rule]);

  const isPending = create.isPending || update.isPending;

  function submit() {
    const body = {
      code: code.trim(),
      points: Number(points),
      nameLo: nameLo.trim(),
      ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
      isActive,
    };
    if (!body.code || !body.nameLo || !Number.isFinite(body.points)) return;
    setSaveError(null);

    const request = rule ? update.mutateAsync({ id: rule.id, body }) : create.mutateAsync(body);
    request.then(() => onOpenChange(false)).catch(setSaveError);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(rule ? 'conductRule.edit' : 'conductRule.add')}
      description={t('conductRule.formHint')}
      isSubmitting={isPending}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rule-code">{t('conductRule.code')}</Label>
            <Input
              id="rule-code"
              value={code}
              placeholder="2.3"
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rule-points">{t('conductRule.points')}</Label>
            <Input
              id="rule-points"
              type="number"
              min={1}
              max={100}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-name-lo">{t('conductRule.nameLo')}</Label>
          <Textarea
            id="rule-name-lo"
            rows={2}
            value={nameLo}
            onChange={(event) => setNameLo(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rule-name-en">
            {t('conductRule.nameEn')}{' '}
            <span className="text-xs text-muted-foreground">({t('common.optional')})</span>
          </Label>
          <Textarea
            id="rule-name-en"
            rows={2}
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="rule-active" className="text-sm font-normal">
            {t('conductRule.inForce')}
          </Label>
        </div>

        {saveError != null && <p className="text-sm text-danger">{errorMessage(saveError)}</p>}
      </div>
    </FormDialog>
  );
}
