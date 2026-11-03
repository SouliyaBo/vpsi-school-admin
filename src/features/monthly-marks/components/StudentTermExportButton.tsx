import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SchoolYear } from '@/types/entities';
import { attendancesApi } from '@/features/attendances/api';
import { useCan } from '@/features/auth/hooks';
import { classroomHeading } from '@/features/classrooms/api';
import { conductDeductionsApi } from '@/features/conduct-deductions/api';
import { localizedName } from '@/lib/utils';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import type { StudentMonthlySheet } from '../api';
import {
  buildStudentTermWorkbook,
  studentTermFileName,
  termRegisters,
} from '../lib/student-term-workbook';

/**
 * ຜົນການຮຽນພາກຮຽນ of one child as the office's Excel sheet — the whole-term
 * block on the child's page, with the days missed and the conduct points beside
 * each month.
 *
 * Both registers are read on the click, a month at a time for the roll, and
 * only where the account may read them; a register it may not read prints as
 * empty columns rather than stopping the file.
 */
export function StudentTermExportButton({
  data,
  studentId,
  studentName,
  studentCode,
  schoolYear,
}: {
  data: StudentMonthlySheet;
  studentId: string;
  studentName?: string;
  studentCode?: string;
  schoolYear: SchoolYear | undefined;
}) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const [busy, setBusy] = useState(false);

  async function exportSheet() {
    if (!data.classroom) return;
    setBusy(true);
    try {
      const [absences, ledger] = await Promise.all([
        can('attendances')
          ? Promise.all(
              data.months.map((month) =>
                attendancesApi
                  .studentSummary(studentId, data.semester.id, month)
                  .then((roll) => ({ total: roll.absentTotal, unexcused: roll.absentUnexcused }))
                  // Nothing taken that month is a 404, and an empty cell.
                  .catch(() => null),
              ),
            )
          : Promise.resolve(null),
        can('conduct-scores') && schoolYear
          ? conductDeductionsApi.studentLedger(studentId, schoolYear.id).catch(() => null)
          : Promise.resolve(null),
      ]);

      const semester = localizedName(data.semester, i18n.language);
      const yearLabel = schoolYear?.code ?? localizedName(schoolYear, i18n.language);
      const name = studentName ?? '';
      const size = data.summary.classSize;
      // The ledger's months are ordered from the start of the school year; the
      // term's first month stands in for a year whose dates did not come back.
      const startMonth = schoolYear?.startDate
        ? Number(schoolYear.startDate.slice(5, 7))
        : data.months[0];

      const blob = await buildStudentTermWorkbook(
        data,
        {
          schoolName:
            (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
            (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
            '',
          title: t('monthlyMark.studentTermTitle', { semester, year: yearLabel }),
          sheetName: t('monthlyMark.termSheet.sheetName'),
          student: studentCode
            ? t('monthlyMark.termSheet.studentWithCode', { name, code: studentCode })
            : t('monthlyMark.termSheet.student', { name }),
          classroom: t('monthlyMark.termSheet.classroom', {
            classroom: classroomHeading(data.classroom),
          }),
          classSize: size
            ? t('monthlyMark.termSheet.classSize', { students: size.students, female: size.female })
            : null,
          corner: t('monthlyMark.termSheet.corner'),
          total: t('monthlyMark.termSheet.total'),
          subjectCount: t('monthlyMark.termSheet.subjectCount'),
          average: t('monthlyMark.termSheet.average'),
          grade: t('monthlyMark.termSheet.grade'),
          absentTotal: t('monthlyMark.termSheet.absentTotal'),
          absentUnexcused: t('monthlyMark.termSheet.absentUnexcused'),
          deducted: t('monthlyMark.termSheet.deducted'),
          remaining: t('monthlyMark.termSheet.remaining'),
          comment: t('monthlyMark.termSheet.comment'),
          months: data.months.map((month) => t(`month.${month}`)),
          threeMonth: t('monthlyMark.termSheet.threeMonth'),
          exam: t('monthlyMark.termSheet.exam', { semester }),
          term: t('monthlyMark.termSheet.term', { semester }),
          placeAndDate: t('monthlyMark.termSheet.placeAndDate', {
            school:
              (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
              (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
              '',
          }),
          director: t('monthlyMark.director'),
          homeroomTeacher: t('monthlyMark.homeroomTeacher'),
        },
        termRegisters(data.months, startMonth, absences, ledger),
        data.classroom.homeroomTeacherName,
      );
      saveBlob(
        blob,
        studentTermFileName(data, t('monthlyMark.termSheet.fileName', { semester }), name),
      );
    } catch (error) {
      notify.error(error, t('monthlyMark.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={exportSheet} disabled={busy || !data.classroom}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      {busy ? t('monthlyMark.exporting') : t('monthlyMark.exportExcel')}
    </Button>
  );
}
