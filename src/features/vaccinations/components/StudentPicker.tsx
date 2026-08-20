import { AlertCircle, CheckCheck, Save, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { errorMessage } from '@/lib/error-message';
import { fullName, nickname as nicknameOf, refId } from '@/lib/utils';
import type { VaccinationCampaign } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { StudentName } from '@/components/common/StudentName';
import { useCampaignCandidates, useSetCampaignStudents } from '../api';

/**
 * Who the round covers, chosen class by class.
 *
 * The roll used to be swept from the eligibility rule, which put every matching
 * child in the school on the sheet — broader than any round the health centre
 * actually runs. So the round holds an explicit list, and this is where it is
 * built: pick a class, tick the students.
 *
 * The eligibility rule still narrows what is on offer — a boy is listed for an
 * HPV round but cannot be ticked — because a filtered list is quicker to work
 * through than the whole class. Names it excludes are shown rather than hidden,
 * so a short list reads as "the round does not cover them" instead of a missing
 * enrolment.
 *
 * Editing is per class and saved per class: the campaign's students from other
 * classes are carried through untouched, because this screen only ever sees one
 * class and must not mistake "not shown" for "not selected".
 */
export function StudentPicker({ campaign }: { campaign: VaccinationCampaign }) {
  const { t, i18n } = useTranslation();
  const can = useCan();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  /** The ticked students in the class on screen. `null` until it loads. */
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);

  const candidates = useCampaignCandidates(campaign.id, classroomId);
  const save = useSetCampaignStudents(campaign.id);

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, refId(campaign.schoolYearId) ?? undefined);

  const entries = useMemo(() => candidates.data ?? [], [candidates.data]);

  useEffect(() => {
    setPicked(
      candidates.data
        ? new Set(candidates.data.filter((entry) => entry.selected).map((e) => e.student.id))
        : null,
    );
    setSaveError(null);
  }, [candidates.data]);

  const canEdit = can('vaccinations', 'update');
  const pickable = entries.filter((entry) => entry.eligible);
  const dirty =
    picked !== null &&
    entries.some((entry) => entry.selected !== picked.has(entry.student.id));

  function toggle(studentId: string, on: boolean) {
    setPicked((previous) => {
      if (!previous) return previous;
      const next = new Set(previous);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  }

  function selectAllEligible() {
    setPicked((previous) => {
      if (!previous) return previous;
      const next = new Set(previous);
      for (const entry of pickable) next.add(entry.student.id);
      return next;
    });
  }

  /** Clears the class, but keeps anyone whose dose is already recorded. */
  function clearClass() {
    setPicked((previous) => {
      if (!previous) return previous;
      const next = new Set(previous);
      for (const entry of entries) if (!entry.record) next.delete(entry.student.id);
      return next;
    });
  }

  function submit() {
    if (!picked) return;
    setSaveError(null);

    // The class on screen is a window onto the round. Everyone the campaign
    // already holds who is not in this class stays on it — otherwise saving one
    // class would silently drop every other.
    const shown = new Set(entries.map((entry) => entry.student.id));
    const elsewhere = (campaign.studentIds ?? []).filter((id) => !shown.has(id));

    save.mutateAsync([...new Set([...elsewhere, ...picked])]).catch(setSaveError);
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="picker-classroom">{t('vaccination.classroom')}</Label>
            <EntitySelect
              id="picker-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('vaccination.selectClassroom')}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              onClick={selectAllEligible}
              disabled={!canEdit || pickable.length === 0}
            >
              <CheckCheck />
              {t('vaccination.selectAllEligible')}
            </Button>
            <Button
              variant="outline"
              onClick={clearClass}
              disabled={!canEdit || entries.length === 0}
            >
              <X />
              {t('vaccination.clearClass')}
            </Button>
          </div>
          <div className="flex items-end justify-end">
            <Badge variant="outline">
              {t('vaccination.onRound', { count: campaign.studentIds?.length ?? 0 })}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId ? (
            <EmptyState icon={Users} title={t('vaccination.pickClassroomHint')} />
          ) : candidates.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : candidates.error ? (
            <ErrorState error={candidates.error} onRetry={candidates.refetch} compact />
          ) : entries.length === 0 ? (
            <EmptyState icon={Users} title={t('vaccination.emptyClass')} />
          ) : (
            <div className="space-y-3">
              <div className="grid gap-1 sm:grid-cols-2">
                {entries.map((entry) => {
                  const isPicked = picked?.has(entry.student.id) ?? false;
                  // A recorded dose pins the student to the round: the record is a
                  // fact about a child who attended, and dropping them would
                  // orphan it from the reason it exists.
                  const locked = !canEdit || !entry.eligible || Boolean(entry.record);

                  return (
                    <label
                      key={entry.student.id}
                      className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                        locked ? 'text-muted-foreground' : 'cursor-pointer hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isPicked}
                        disabled={locked}
                        onCheckedChange={(checked) => toggle(entry.student.id, Boolean(checked))}
                      />
                      <span className="font-mono text-xs">{entry.student.studentCode}</span>
                      <StudentName
                        name={fullName(entry.student, i18n.language)}
                        nickname={nicknameOf(entry.student, i18n.language)}
                      />
                      {!entry.eligible && (
                        <Badge variant="secondary" className="ms-auto">
                          {t('vaccination.notEligible')}
                        </Badge>
                      )}
                      {entry.record && (
                        <StatusBadge
                          status={entry.record.status}
                          namespace="vaccinationStatus"
                          className="ms-auto"
                        />
                      )}
                    </label>
                  );
                })}
              </div>

              {saveError !== null && (
                <p className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-sm text-danger">
                  <AlertCircle className="size-4 shrink-0" />
                  {errorMessage(saveError)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">
                  {t('vaccination.pickedOf', {
                    picked: entries.filter((e) => picked?.has(e.student.id)).length,
                    total: entries.length,
                  })}
                </span>
                <Button
                  className="ms-auto"
                  onClick={submit}
                  disabled={!canEdit || !dirty || save.isPending}
                >
                  <Save />
                  {t('common.save')}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
