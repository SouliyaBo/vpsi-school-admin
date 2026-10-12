import { ChevronDown, FileText, Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { cn, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClassMonthSheet as ClassMonthData } from '../api';
import {
  buildParentReportArchive,
  buildParentReportWorkbook,
  parentReportFileName,
  type ParentReportLabels,
  type ParentReportRemarks,
} from '../lib/parent-report-workbook';
import { loadRegisters } from '../lib/load-registers';

/**
 * ໃບລາຍງານຜູ້ປົກຄອງ — the month's marks as the letter that goes home.
 *
 * One file per student, never the class in one workbook: the office sends each
 * letter to its own parent, and a class file would put every child's marks in
 * front of every other child's family. Two ways to get them, both from the
 * rows already on the summary so the letter and the sheet cannot disagree —
 * a button on each row for one child, and a button over the table that zips a
 * chosen set of them, one `.xlsx` each, for a whole class at month's end.
 *
 * Both buttons open a remark form before anything is built — one field per
 * subject and one for the month. The per-subject fields open on ເຫດຜົນ as the
 * subject teacher wrote it when they entered the marks, which is where an
 * explanation belongs: it is written while the month is still fresh, it is kept
 * with the marks, and the same month exported twice now says the same thing
 * both times. Edits made here are the office's own wording for this letter —
 * kept per student while the sheet is open, so a letter re-downloaded or
 * downloaded again in the batch does not start over, and not written back to
 * the register, which is the teacher's.
 *
 * ຄຳເຫັນຂອງຄູປະຈຳຫ້ອງ for the month as a whole is still typed here and kept
 * nowhere else: it is the homeroom teacher's remark on the child's month, and
 * no screen collects one.
 */

type Row = ClassMonthData['rows'][number];
export type RemarkStore = Map<string, ParentReportRemarks>;

/** A row that can have a letter: still in the room, and with a mark to print. */
export const canReport = (row: Row) => row.isEnrolled && row.average !== null;

/**
 * The remarks typed so far, keyed by student — held over the sheet, not a
 * button, so the row form and the batch form share them. Emptied when the
 * sheet under them changes: a remark about ກຸມພາ is not one about ມີນາ.
 */
export function useRemarkStore(sheet: ClassMonthData | undefined): {
  remarks: RemarkStore;
  setRemark: (studentId: string, remark: ParentReportRemarks) => void;
} {
  const [remarks, setRemarks] = useState<RemarkStore>(() => new Map());
  const key = sheet ? `${sheet.classroom.id}:${sheet.semester.id}:${sheet.month}` : '';
  useEffect(() => setRemarks(new Map()), [key]);
  return {
    remarks,
    setRemark: (studentId, remark) =>
      setRemarks((current) => new Map(current).set(studentId, remark)),
  };
}

/**
 * What the remark form opens on for a student nobody has edited here.
 *
 * The per-subject fields carry ເຫດຜົນ from the mark sheet, aligned with the
 * summary's subject columns; the month's own remark starts blank, since nothing
 * collects one. An API that predates the stored remark answers without them and
 * the form opens empty, exactly as it used to.
 */
const storedRemark = (sheet: ClassMonthData, row: Row): ParentReportRemarks => ({
  bySubject: sheet.subjects.map((_, index) => row.remarks?.[index] ?? ''),
  overall: '',
});

/** Whether a remark says anything at all — what the batch list marks a row by. */
const hasAnything = (remark: ParentReportRemarks): boolean =>
  Boolean(remark.overall.trim() || remark.bySubject.some((text) => text.trim()));

/** Everything on the letter that is a word, in the language the screen is in. */
function labelsFor(t: TFunction, sheet: ClassMonthData, schoolYear: string): ParentReportLabels {
  const monthNumber = String(sheet.month).padStart(2, '0');
  return {
    sheetName: t('monthlyMark.parentReport'),
    title: t('monthlyMark.parentReportTitle', {
      month: t(`month.${sheet.month}`),
      monthNumber,
      year: schoolYear,
    }),
    studentName: t('monthlyMark.studentName'),
    classroom: t('monthlyMark.classroom'),
    rollNumber: t('monthlyMark.rollNumber'),
    corner: t('monthlyMark.parentReportCorner'),
    testRow: t('monthlyMark.parentReportTestRow'),
    totalRow: t('monthlyMark.parentReportTotalRow'),
    subjectGradeRow: t('monthlyMark.parentReportSubjectGradeRow'),
    remarkRow: t('monthlyMark.parentReportRemarkRow'),
    total: t('monthlyMark.parentReportTotal'),
    subjectCount: t('monthlyMark.parentReportSubjectCount'),
    average: t('monthlyMark.parentReportAverage'),
    grade: t('monthlyMark.parentReportGrade'),
    incompleteRow: (recorded, total) => t('monthlyMark.ofSubjects', { recorded, total }),
    registerCorner: t('monthlyMark.parentReportRegisterCorner'),
    conductPoints: t('monthlyMark.conductPoints'),
    deducted: t('monthlyMark.deducted'),
    remaining: t('monthlyMark.remaining'),
    absences: t('monthlyMark.absences'),
    excused: t('monthlyMark.excusedAbsence'),
    unexcused: t('monthlyMark.unexcusedAbsence'),
    absencesTotal: t('monthlyMark.absencesTotal'),
    note: t('monthlyMark.parentReportNote'),
    gradeScaleLines: t('monthlyMark.parentReportScale').split('\n'),
    printedOn: t('monthlyMark.printedOn', { date: formatDate(new Date()) }),
  };
}

/** ໃບລາຍງານຜູ້ປົກຄອງເດືອນກຸມພາ(02) — the head of every file name. */
function fileHeading(t: TFunction, sheet: ClassMonthData): string {
  return t('monthlyMark.parentReportFileName', {
    month: t(`month.${sheet.month}`),
    monthNumber: String(sheet.month).padStart(2, '0'),
  });
}

/**
 * The stale-API check both buttons make before opening anything.
 *
 * The letter needs two columns the summary did not always carry — ກວດກາ and
 * the letter per subject. An API built before they were added answers without
 * them, and the generic "could not build" would send the office looking at
 * the wrong thing.
 */
function apiCarriesLetter(rows: Row[], t: TFunction): boolean {
  if (rows.some((row) => !row.testScores || !row.subjectGrades)) {
    notify.error(new Error(t('monthlyMark.parentReportNeedsApi')));
    return false;
  }
  return true;
}

const trimmed = (remark: ParentReportRemarks): ParentReportRemarks => ({
  bySubject: remark.bySubject.map((text) => text.trim()),
  overall: remark.overall.trim(),
});

/**
 * The remark form for one student: a field under each subject, with that
 * subject's mark and letter beside the name so the teacher writes against the
 * figure, then one field for the month.
 */
function RemarkFields({
  sheet,
  row,
  value,
  onChange,
}: {
  sheet: ClassMonthData;
  row: Row;
  value: ParentReportRemarks;
  onChange: (next: ParentReportRemarks) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sheet.subjects.map((subject, index) => (
        <div key={subject.id} className="space-y-1.5">
          <Label htmlFor={`remark-${row.studentId}-${subject.id}`}>
            {subject.nameLo}
            {row.scores[index] !== null && (
              <span className="ms-2 font-normal tabular-nums text-muted-foreground">
                {(row.scores[index] as number).toFixed(2)}
                {row.subjectGrades?.[index] && ` · ${row.subjectGrades[index]}`}
              </span>
            )}
          </Label>
          <Textarea
            id={`remark-${row.studentId}-${subject.id}`}
            rows={2}
            value={value.bySubject[index] ?? ''}
            onChange={(event) =>
              onChange({
                ...value,
                bySubject: sheet.subjects.map((_, at) =>
                  at === index ? event.target.value : (value.bySubject[at] ?? ''),
                ),
              })
            }
          />
        </div>
      ))}
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`remark-${row.studentId}-overall`}>
          {t('monthlyMark.parentReportOverallRemark')}
        </Label>
        <Textarea
          id={`remark-${row.studentId}-overall`}
          rows={2}
          value={value.overall}
          onChange={(event) => onChange({ ...value, overall: event.target.value })}
        />
      </div>
    </div>
  );
}

/** The icon on a row of the summary: this child's letter. */
export function ParentReportRowButton({
  sheet,
  row,
  schoolYear,
  schoolYearId,
  remarks,
  setRemark,
}: {
  sheet: ClassMonthData;
  row: Row;
  schoolYear: string;
  /** The year ຄະແນນຄຸນສົມບັດ is counted over; without it the conduct cells print empty. */
  schoolYearId: string | undefined;
  remarks: RemarkStore;
  setRemark: (studentId: string, remark: ParentReportRemarks) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const remark = remarks.get(row.studentId) ?? storedRemark(sheet, row);

  async function exportReport() {
    setBusy(true);
    try {
      const registers = await loadRegisters(sheet, schoolYearId);
      const blob = await buildParentReportWorkbook(sheet, labelsFor(t, sheet, schoolYear), {
        studentId: row.studentId,
        remarks: new Map([[row.studentId, trimmed(remark)]]),
        registers,
      });
      saveBlob(blob, parentReportFileName(sheet, fileHeading(t, sheet), row.studentNameLo));
      setOpen(false);
    } catch (error) {
      notify.error(error, t('monthlyMark.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  const label = t('monthlyMark.parentReportFor', { name: row.studentNameLo });
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => apiCarriesLetter([row], t) && setOpen(true)}
        disabled={!canReport(row)}
        aria-label={label}
        title={label}
      >
        <FileText />
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{t('monthlyMark.parentReportRemarkHint')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            <RemarkFields
              sheet={sheet}
              row={row}
              value={remark}
              onChange={(next) => setRemark(row.studentId, next)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={exportReport} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <FileText />}
              {busy ? t('monthlyMark.exporting') : t('monthlyMark.parentReportDownload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The button over the table: a chosen set of letters, zipped one file each.
 *
 * Opens on every child who can have a letter, all ticked, because the common
 * case is the whole class at month's end; the office unticks the few it is
 * not sending yet. Each name folds open onto that child's remark form, so the
 * remarks can be written in the same sitting as the download — or left blank
 * for a letter that carries only the marks.
 */
export function ParentReportBatchButton({
  sheet,
  schoolYear,
  schoolYearId,
  remarks,
  setRemark,
}: {
  sheet: ClassMonthData;
  schoolYear: string;
  schoolYearId: string | undefined;
  remarks: RemarkStore;
  setRemark: (studentId: string, remark: ParentReportRemarks) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const eligible = sheet.rows.filter(canReport);
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  function openForm() {
    if (!apiCarriesLetter(eligible, t)) return;
    setChosen(new Set(eligible.map((row) => row.studentId)));
    setExpanded(null);
    setOpen(true);
  }

  const toggle = (studentId: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(studentId);
      else next.delete(studentId);
      return next;
    });

  const allChosen = eligible.length > 0 && eligible.every((row) => chosen.has(row.studentId));

  async function exportArchive() {
    setBusy(true);
    try {
      const heading = fileHeading(t, sheet);
      // Built over the chosen rows rather than over what was typed: a letter for
      // a child nobody opened the form for still carries the teacher's ເຫດຜົນ,
      // which is the whole reason the remark is now kept with the marks.
      const withRemarks: RemarkStore = new Map(
        eligible
          .filter((row) => chosen.has(row.studentId))
          .map((row) => [
            row.studentId,
            trimmed(remarks.get(row.studentId) ?? storedRemark(sheet, row)),
          ]),
      );
      // Read once for the class, not once per letter.
      const registers = await loadRegisters(sheet, schoolYearId);
      const blob = await buildParentReportArchive(
        sheet,
        labelsFor(t, sheet, schoolYear),
        [...chosen],
        withRemarks,
        (student) => parentReportFileName(sheet, heading, student.studentNameLo),
        registers,
      );
      saveBlob(blob, parentReportFileName(sheet, heading).replace(/\.xlsx$/, '.zip'));
      setOpen(false);
    } catch (error) {
      notify.error(error, t('monthlyMark.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={openForm} disabled={eligible.length === 0}>
        <Users />
        {t('monthlyMark.parentReportBatch')}
      </Button>

      <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('monthlyMark.parentReportBatch')}</DialogTitle>
            <DialogDescription>{t('monthlyMark.parentReportBatchHint')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 border-b pb-2">
            <Checkbox
              id="parent-report-all"
              checked={allChosen}
              onCheckedChange={(value) =>
                setChosen(
                  value === true ? new Set(eligible.map((row) => row.studentId)) : new Set(),
                )
              }
            />
            <Label htmlFor="parent-report-all" className="font-normal">
              {t('monthlyMark.parentReportSelectAll')}
            </Label>
            <span className="ms-auto text-sm text-muted-foreground">
              {t('monthlyMark.parentReportChosen', { count: chosen.size, total: eligible.length })}
            </span>
          </div>

          <div className="max-h-[55vh] space-y-1 overflow-y-auto">
            {eligible.map((row) => {
              const isOpen = expanded === row.studentId;
              const hasRemark = hasAnything(remarks.get(row.studentId) ?? storedRemark(sheet, row));
              return (
                <Collapsible
                  key={row.studentId}
                  open={isOpen}
                  onOpenChange={(next) => setExpanded(next ? row.studentId : null)}
                  className="rounded-md border"
                >
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Checkbox
                      id={`parent-report-${row.studentId}`}
                      checked={chosen.has(row.studentId)}
                      onCheckedChange={(value) => toggle(row.studentId, value === true)}
                    />
                    <Label
                      htmlFor={`parent-report-${row.studentId}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      <span className="me-2 tabular-nums text-muted-foreground">
                        {row.rollNumber ?? '—'}
                      </span>
                      {row.studentNameLo}
                    </Label>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t('monthlyMark.parentReportRemarksFor', {
                          name: row.studentNameLo,
                        })}
                      >
                        <span className={cn('text-xs', hasRemark && 'font-semibold text-primary')}>
                          {t('monthlyMark.parentReportRemarks')}
                        </span>
                        <ChevronDown
                          className={cn('transition-transform', isOpen && 'rotate-180')}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="border-t px-3 py-3">
                    <RemarkFields
                      sheet={sheet}
                      row={row}
                      value={remarks.get(row.studentId) ?? storedRemark(sheet, row)}
                      onChange={(next) => setRemark(row.studentId, next)}
                    />
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={exportArchive} disabled={busy || chosen.size === 0}>
              {busy ? <Loader2 className="animate-spin" /> : <FileText />}
              {busy
                ? t('monthlyMark.exporting')
                : t('monthlyMark.parentReportDownloadCount', { count: chosen.size })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
