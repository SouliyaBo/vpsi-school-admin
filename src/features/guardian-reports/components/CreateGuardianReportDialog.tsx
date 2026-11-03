import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/error-message';
import { formatDate } from '@/lib/utils';
import type { GuardianReportSection, Semester } from '@/types/entities';
import { FormDialog } from '@/components/common/FormDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCreateGuardianReport, useGuardianReportDraft, type IssuedGuardianReport } from '../api';
import { defaultReportMonth, termMonths } from '../lib/report-link';
import { GuardianReportView } from './GuardianReportView';

const SECTIONS: GuardianReportSection[] = ['monthlyMarks', 'attendance', 'conduct', 'behavior'];
const MESSAGE_MAX = 1000;

/**
 * ສົ່ງລາຍງານຫາຜູ້ປົກຄອງ — choose a month, a guardian and what to include, see
 * exactly what the family will see, and get a link.
 *
 * The figures are not edited here and are not sent from here: the dialog sends
 * the choices, and the server assembles the report again from the same reads the
 * preview came from. The one row-by-row choice is the behaviour register, where a
 * free-text entry can name another child and only the teacher can tell.
 */
export function CreateGuardianReportDialog({
  open,
  onOpenChange,
  studentId,
  semester,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  semester: Semester | undefined;
  onIssued: (issued: IssuedGuardianReport, guardianId: string) => void;
}) {
  const { t } = useTranslation();
  const months = useMemo(
    () => (semester ? termMonths(semester.startDate, semester.endDate) : []),
    [semester],
  );

  const [month, setMonth] = useState<number | undefined>(undefined);
  const [guardianId, setGuardianId] = useState('');
  const [sections, setSections] = useState<GuardianReportSection[]>(SECTIONS);
  // Entries the teacher has *un*ticked — so a fresh month starts with all of its
  // own entries in, and switching month does not carry choices across.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setMonth(defaultReportMonth(months));
    setGuardianId('');
    setSections(SECTIONS);
    setExcluded(new Set());
    setMessage('');
  }, [open, months]);

  const draft = useGuardianReportDraft(
    open && month ? { studentId, month, semesterId: semester?.id } : null,
  );
  const create = useCreateGuardianReport();

  const eligible = (draft.data?.guardians ?? []).filter(
    (guardian) => guardian.canViewRecords && guardian.hasPhone,
  );

  // The primary guardian, if they can receive it; otherwise the first who can.
  useEffect(() => {
    if (!draft.data || guardianId) return;
    const pick = eligible.find((guardian) => guardian.isPrimary) ?? eligible[0];
    if (pick) setGuardianId(pick.id);
  }, [draft.data, eligible, guardianId]);

  const behavior = draft.data?.behavior ?? [];
  const chosenBehavior = behavior.filter((entry) => !excluded.has(entry.id));
  const guardian = draft.data?.guardians.find((entry) => entry.id === guardianId);

  const toggleSection = (section: GuardianReportSection, on: boolean) =>
    setSections((current) =>
      on
        ? SECTIONS.filter((s) => s === section || current.includes(s))
        : current.filter((s) => s !== section),
    );

  const toggleEntry = (id: string, on: boolean) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });

  const canSubmit =
    Boolean(draft.data && month && guardian) && (sections.length > 0 || message.trim().length > 0);

  const submit = () => {
    if (!canSubmit || !month) return;
    create.mutate(
      {
        studentId,
        month,
        semesterId: semester?.id,
        guardianId,
        sections,
        behaviorLogIds: sections.includes('behavior')
          ? chosenBehavior.map((entry) => entry.id)
          : undefined,
        message: message.trim(),
      },
      {
        onSuccess: (issued) => {
          onOpenChange(false);
          onIssued(issued, guardianId);
        },
      },
    );
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('guardianReport.createTitle')}
      description={t('guardianReport.createDescription')}
      onSubmit={submit}
      isSubmitting={create.isPending}
      submitLabel={t('guardianReport.send')}
      submitDisabled={!canSubmit}
      size="xl"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="guardian-report-month">{t('guardianReport.month')}</Label>
              <Select
                value={month ? String(month) : ''}
                onValueChange={(value) => {
                  setMonth(Number(value));
                  setExcluded(new Set());
                }}
              >
                <SelectTrigger id="guardian-report-month">
                  <SelectValue placeholder={t('guardianReport.month')} />
                </SelectTrigger>
                <SelectContent>
                  {months.map((entry) => (
                    <SelectItem key={entry} value={String(entry)}>
                      {t(`month.${entry}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="guardian-report-guardian">{t('guardianReport.guardian')}</Label>
              <Select value={guardianId} onValueChange={setGuardianId} disabled={!draft.data}>
                <SelectTrigger id="guardian-report-guardian">
                  <SelectValue placeholder={t('guardianReport.guardian')} />
                </SelectTrigger>
                <SelectContent>
                  {(draft.data?.guardians ?? []).map((entry) => {
                    const reason = !entry.canViewRecords
                      ? t('guardianReport.guardianNoView')
                      : !entry.hasPhone
                        ? t('guardianReport.guardianNoPhone')
                        : null;
                    return (
                      <SelectItem key={entry.id} value={entry.id} disabled={reason !== null}>
                        {entry.nameLo} ({t(`relationship.${entry.relationship}`)})
                        {reason && ` — ${reason}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {draft.data && eligible.length === 0 && (
            <p className="rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
              {t('guardianReport.noGuardians')}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('guardianReport.sections')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {SECTIONS.map((section) => (
                <label
                  key={section}
                  htmlFor={`guardian-report-section-${section}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={`guardian-report-section-${section}`}
                    checked={sections.includes(section)}
                    onCheckedChange={(value) => toggleSection(section, value === true)}
                  />
                  <span>{t(`guardianReport.section.${section}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {sections.includes('behavior') && draft.data && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                {t('guardianReport.section.behavior')}
              </legend>
              {behavior.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('guardianReport.noBehavior')}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t('guardianReport.behaviorPick')}
                  </p>
                  <div className="space-y-1">
                    {behavior.map((entry) => (
                      <label
                        key={entry.id}
                        htmlFor={`guardian-report-entry-${entry.id}`}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          id={`guardian-report-entry-${entry.id}`}
                          className="mt-0.5"
                          checked={!excluded.has(entry.id)}
                          onCheckedChange={(value) => toggleEntry(entry.id, value === true)}
                        />
                        <span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(entry.date)}
                            {entry.subjectNameLo && ` · ${entry.subjectNameLo}`}
                          </span>
                          {[entry.behavior, entry.action, entry.remark].filter(Boolean).join(' · ')}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </fieldset>
          )}

          <div className="space-y-1">
            <Label htmlFor="guardian-report-message">{t('guardianReport.message')}</Label>
            <Textarea
              id="guardian-report-message"
              value={message}
              maxLength={MESSAGE_MAX}
              rows={3}
              placeholder={t('guardianReport.messagePlaceholder')}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('guardianReport.preview')}</p>
          <div className="rounded-lg border border-border p-4">
            {draft.isLoading && <Skeleton className="h-64 w-full" />}
            {draft.error && (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(draft.error)}
              </p>
            )}
            {draft.data && (
              <GuardianReportView
                content={{ ...draft.data, behavior: chosenBehavior }}
                sections={sections}
                message={message.trim() || null}
                guardian={
                  guardian
                    ? { nameLo: guardian.nameLo, relationship: guardian.relationship }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
