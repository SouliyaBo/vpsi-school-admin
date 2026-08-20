import { AlertCircle, ClipboardCheck, ListChecks, Save, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { errorMessage } from '@/lib/error-message';
import { notify } from '@/lib/toast';
import { fullName, nickname as nicknameOf, refId, toDateInput } from '@/lib/utils';
import type { VaccinationCampaign } from '@/types/entities';
import type { ConsentStatus, VaccinationStatus } from '@/types/enums';
import { CONSENT_STATUSES, VACCINATION_STATUSES } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import { useCampaignRoll, useRecordCampaignDoses, type DoseInput, type RollEntry } from '../api';

/** What the nurse has marked for one student, before the sheet is submitted. */
interface DoseDraft {
  status: VaccinationStatus;
  administeredDate?: string;
  batchNumber?: string;
  consent: ConsentStatus;
  notes?: string;
}

/**
 * Campaign day: one sheet for the whole roll.
 *
 * Nothing is pre-selected. An unmarked row means "not yet decided", which is a
 * different fact from every outcome the sheet can record — including `absent`.
 * Defaulting the roll to `administered` would let an untouched sheet be filed as
 * a completed round, which is the failure this screen exists to prevent.
 *
 * Re-opening a campaign seeds from what is already recorded, because the API
 * upserts per (student, vaccine, dose): submitting again corrects the sheet
 * rather than adding a second dose.
 *
 * A row marked `administered` needs a date and a guardian's consent, and the save
 * is blocked until both are there rather than letting the API reject the sheet
 * after it has been filled in. Every other outcome saves as it stands: a refusal
 * that cannot be filed is how "no record" goes back to meaning two things.
 */
export function DoseSheet({ campaign }: { campaign: VaccinationCampaign }) {
  const { t, i18n } = useTranslation();
  const can = useCan();

  const [outstandingOnly, setOutstandingOnly] = useState(false);
  /** Narrows the view for a round spanning classes; never changes the round. */
  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, DoseDraft>>({});
  const [saveError, setSaveError] = useState<unknown>(null);

  /** Campaign-day defaults, applied by the fill-the-gaps button. */
  const [bulkDate, setBulkDate] = useState(() => toDateInput(campaign.scheduledDate));
  const [bulkBatch, setBulkBatch] = useState('');

  const useClassroomsForYear = (search: string) =>
    useClassroomOptions(search, refId(campaign.schoolYearId) ?? undefined);

  const roll = useCampaignRoll(campaign.id, { outstandingOnly, classroomId });
  const record = useRecordCampaignDoses(campaign.id);

  const entries = useMemo(() => roll.data ?? [], [roll.data]);

  useEffect(() => {
    const seeded: Record<string, DoseDraft> = {};
    for (const entry of entries) {
      if (!entry.record) continue;
      seeded[entry.student.id] = {
        status: entry.record.status,
        administeredDate: toDateInput(entry.record.administeredDate) || undefined,
        batchNumber: entry.record.batchNumber ?? undefined,
        consent: entry.record.consent?.status ?? 'pending',
        notes: entry.record.notes ?? undefined,
      };
    }
    setDraft(seeded);
    setSaveError(null);
  }, [entries]);

  const marked = entries.filter((entry) => draft[entry.student.id]).length;

  /**
   * Rows the API would refuse. Counted here so the sheet says which ones before
   * the save, rather than the whole request failing on the first bad row.
   */
  const incomplete = entries.filter((entry) => blockedReason(draft[entry.student.id]) !== null);

  function update(studentId: string, patch: Partial<DoseDraft>) {
    setDraft((previous) => {
      const current = previous[studentId];
      if (!current) return previous;
      return { ...previous, [studentId]: { ...current, ...patch } };
    });
  }

  function setStatus(studentId: string, status: VaccinationStatus | '') {
    setDraft((previous) => {
      if (status === '') {
        const { [studentId]: _cleared, ...rest } = previous;
        return rest;
      }
      const current = previous[studentId];
      // The date and the vial belong to `administered` alone: correcting a row to
      // `absent` must not carry over the batch of a dose nobody received — that
      // is the number a recall is traced by.
      return {
        ...previous,
        [studentId]:
          status === 'administered'
            ? {
                status,
                consent: current?.consent ?? 'pending',
                administeredDate: current?.administeredDate ?? bulkDate,
                batchNumber: current?.batchNumber ?? bulkBatch ?? undefined,
                notes: current?.notes,
              }
            : { status, consent: current?.consent ?? 'pending', notes: current?.notes },
      };
    });
  }

  /**
   * Fills the unmarked rows with "given, today, this vial".
   *
   * Only the gaps: a refusal already recorded must not be overwritten by a
   * convenience button. Consent is left at whatever is on file — this button
   * cannot claim a parent agreed.
   */
  function markRemainingGiven() {
    setDraft((previous) => {
      const next = { ...previous };
      for (const entry of entries) {
        next[entry.student.id] ??= {
          status: 'administered',
          administeredDate: bulkDate,
          batchNumber: bulkBatch || undefined,
          consent: entry.record?.consent?.status ?? 'pending',
        };
      }
      return next;
    });
  }

  function save() {
    if (incomplete.length > 0) return;
    setSaveError(null);

    const records: DoseInput[] = entries
      .filter((entry) => draft[entry.student.id])
      .map((entry) => {
        const chosen = draft[entry.student.id];
        const given = chosen.status === 'administered';
        return {
          studentId: entry.student.id,
          status: chosen.status,
          ...(given && chosen.administeredDate ? { administeredDate: chosen.administeredDate } : {}),
          ...(given && chosen.batchNumber ? { batchNumber: chosen.batchNumber } : {}),
          consent: {
            status: chosen.consent,
            // The primary guardian is who the consent form went home with. Sent
            // only when one is on file; the API checks it against the student's
            // own list rather than trusting the sheet.
            ...(primaryGuardianId(entry) ? { guardianId: primaryGuardianId(entry)! } : {}),
          },
          ...(chosen.notes?.trim() ? { notes: chosen.notes.trim() } : {}),
        };
      });

    record
      .mutateAsync(records)
      .then((result) => {
        notify.success(t('vaccination.saved', { count: result.recorded }));
        void roll.refetch();
      })
      .catch(setSaveError);
  }

  const canRecord = can('vaccinations', 'create');

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="dose-date">{t('vaccination.administeredDate')}</Label>
            <Input
              id="dose-date"
              type="date"
              value={bulkDate}
              onChange={(event) => setBulkDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dose-batch">{t('vaccination.batchNumber')}</Label>
            <Input
              id="dose-batch"
              value={bulkBatch}
              placeholder="B2409-17"
              onChange={(event) => setBulkBatch(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button variant="outline" onClick={markRemainingGiven} disabled={!canRecord}>
              <ListChecks />
              {t('vaccination.markRemainingGiven')}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sheet-classroom">{t('vaccination.classroom')}</Label>
            {/* A view filter only — the round's students are whoever the picker
                put on it, and narrowing the sheet never takes anyone off. */}
            <EntitySelect
              id="sheet-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('vaccination.everyClass')}
              clearable
            />
          </div>
          <div className="flex items-end">
            <Button
              variant={outstandingOnly ? 'default' : 'outline'}
              onClick={() => setOutstandingOnly((current) => !current)}
            >
              <Users />
              {t('vaccination.outstandingOnly')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {roll.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : roll.error ? (
            <ErrorState error={roll.error} onRetry={roll.refetch} compact />
          ) : entries.length === 0 ? (
            <EmptyState
              icon={outstandingOnly ? ClipboardCheck : Users}
              title={
                outstandingOnly ? t('vaccination.noneOutstanding') : t('vaccination.emptyRoll')
              }
              description={outstandingOnly ? undefined : t('vaccination.emptyRollHint')}
              // Nobody on the round is a picker problem now, not a rule problem.

            />
          ) : (
            <div className="space-y-3">
              <div className="scrollbar-thin overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden md:table-cell">
                        {t('student.studentCode')}
                      </TableHead>
                      <TableHead>{t('attendance.student')}</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        {t('vaccination.classroom')}
                      </TableHead>
                      <TableHead className="w-44">{t('vaccination.outcome')}</TableHead>
                      <TableHead className="w-40">{t('vaccination.consent')}</TableHead>
                      <TableHead className="w-40">{t('vaccination.administeredDate')}</TableHead>
                      <TableHead className="w-36">{t('vaccination.batchNumber')}</TableHead>
                      <TableHead className="w-48">{t('vaccination.reason')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const chosen = draft[entry.student.id];
                      const given = chosen?.status === 'administered';
                      const blocked = blockedReason(chosen);

                      return (
                        <TableRow key={entry.student.id}>
                          <TableCell className="hidden font-mono text-xs md:table-cell">
                            {entry.student.studentCode}
                          </TableCell>
                          <TableCell>
                            <StudentName
                              name={fullName(entry.student, i18n.language)}
                              nickname={nicknameOf(entry.student, i18n.language)}
                            />
                            {blocked && (
                              <span className="ms-2 text-xs text-danger">
                                {t(`vaccination.${blocked}`)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                            {entry.classroom?.name ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={chosen?.status ?? ''}
                              onValueChange={(value) =>
                                setStatus(entry.student.id, value as VaccinationStatus)
                              }
                              disabled={!canRecord}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={t('vaccination.notDecided')} />
                              </SelectTrigger>
                              <SelectContent>
                                {VACCINATION_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {t(`vaccinationStatus.${status}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {/* Editable whatever the outcome: a parent's refusal
                                is worth recording even when the child was absent
                                that day. */}
                            <Select
                              value={chosen?.consent ?? ''}
                              onValueChange={(value) =>
                                update(entry.student.id, { consent: value as ConsentStatus })
                              }
                              disabled={!canRecord || !chosen}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="—" />
                              </SelectTrigger>
                              <SelectContent>
                                {CONSENT_STATUSES.map((status) => (
                                  <SelectItem key={status} value={status}>
                                    {t(`consentStatus.${status}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {given ? (
                              <Input
                                type="date"
                                value={chosen.administeredDate ?? ''}
                                onChange={(event) =>
                                  update(entry.student.id, { administeredDate: event.target.value })
                                }
                                disabled={!canRecord}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {given ? (
                              <Input
                                value={chosen.batchNumber ?? ''}
                                onChange={(event) =>
                                  update(entry.student.id, { batchNumber: event.target.value })
                                }
                                disabled={!canRecord}
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {/* The reason behind a refusal or a contraindication —
                                the only clinical note this sheet takes. */}
                            <Input
                              value={chosen?.notes ?? ''}
                              onChange={(event) =>
                                update(entry.student.id, { notes: event.target.value })
                              }
                              disabled={!canRecord || !chosen}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {saveError !== null && (
                <p className="flex items-center gap-2 rounded-md border border-danger/20 bg-danger-subtle px-3 py-2 text-sm text-danger">
                  <AlertCircle className="size-4 shrink-0" />
                  {errorMessage(saveError)}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
                <span className="text-sm text-muted-foreground">
                  {t('vaccination.markedOf', { marked, total: entries.length })}
                </span>
                {incomplete.length > 0 && (
                  <span className="flex items-center gap-1.5 text-sm text-danger">
                    <AlertCircle className="size-4 shrink-0" />
                    {t('vaccination.incompleteRows', { count: incomplete.length })}
                  </span>
                )}
                <Button
                  className="ms-auto"
                  onClick={save}
                  disabled={!canRecord || marked === 0 || incomplete.length > 0 || record.isPending}
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

/**
 * Why this row cannot be saved, or `null` when it can.
 *
 * Mirrors the API's `violationFor` so the sheet reports it inline instead of the
 * whole request failing. Only `administered` is constrained: the school is
 * stating it gave a dose, which needs a date and a parent's agreement. A refusal
 * or an absence is the school recording what happened, and demanding consent for
 * one would mean the honest answer could not be filed.
 */
function blockedReason(draft: DoseDraft | undefined): 'needsDate' | 'needsConsent' | null {
  if (!draft || draft.status !== 'administered') return null;
  if (!draft.administeredDate) return 'needsDate';
  if (draft.consent !== 'given') return 'needsConsent';
  return null;
}

/** The guardian the consent form went home with, when one is on file. */
function primaryGuardianId(entry: RollEntry): string | null {
  const primary = entry.student.guardians?.find((link) => link.isPrimary);
  return primary ? refId(primary.guardianId) : null;
}
