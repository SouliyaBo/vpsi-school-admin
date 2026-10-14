import type { Cell, Worksheet } from 'exceljs';
import {
  addCrest,
  HEADER_FILL,
  laoFont,
  numberFont,
  safeFileName,
  THIN_BORDER,
} from '@/lib/workbook';
import {
  MOVEMENT_ROWS,
  MOVEMENT_SIGN,
  startOfYear,
  type GradeColumn,
  type GradeFigures,
  type Headcount,
  type MovementRow,
} from './district-report';
import { EXAM_PERCENT_ROWS, EXAM_ROWS, type ExamFigures, type ExamRow } from './exam-results';

/** ມ.ຕົ້ນ or ມ.ປາຍ — one exam table each. */
export interface ExamGroup {
  label: string;
  grades: GradeColumn[];
}

/** 3. ຜົນການສອບເສັງປະຈຳເດືອນ — the month's figures and its labels. */
export interface ExamSection {
  title: string;
  groups: ExamGroup[];
  figures: Map<string, ExamFigures>;
  /** ເນື້ອໃນ */
  content: string;
  /** ຄິດເປັນ % */
  percent: string;
  rows: Record<ExamRow, string>;
}

/** Every string the sheet prints, resolved by the caller through `t`. */
export interface DistrictReportLabels {
  schoolName: string;
  /** ຮ່າງລາຍງານເມືອງ ສົກຮຽນ 2026-2027. */
  title: string;
  /** 2. ຈຳນວນນັກຮຽນ. */
  tableTitle: string;
  sheetName: string;
  grade: string;
  /** ລ */
  total: string;
  /** ຍ */
  female: string;
  /** The ລວມ column over every grade. */
  allGrades: string;
  start: string;
  current: string;
  movements: Record<MovementRow, string>;
  printedOn: string;
  /** Left out when the month's sheets could not be read. */
  exams?: ExamSection;
}

/**
 * The table as the office's own sheet lays it out: a grade per pair of columns,
 * ລ then ຍ, a ລວມ pair at the end, one row per movement.
 *
 * ປະຈຸບັນ and the ລວມ columns are formulas, not figures, so a number corrected
 * in Excel carries through the way it would on the paper form. Each formula is
 * written with its result, so the file reads right before Excel recalculates.
 */
export async function buildDistrictReportWorkbook(
  grades: GradeColumn[],
  figures: Map<string, GradeFigures>,
  labels: DistrictReportLabels,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  // exceljs drops a cached result of 0, so Excel works every formula out on open.
  workbook.calcProperties.fullCalcOnLoad = true;

  const lastColumn = Math.max(
    1 + (grades.length + 1) * 2,
    ...(labels.exams?.groups.map((group) => 1 + group.grades.length * 3) ?? []),
  );
  const worksheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  worksheet.columns = [
    { width: 20 },
    // Wide enough for the exam table's `97.73%` as well as a headcount.
    ...Array.from({ length: lastColumn - 1 }, () => ({ width: 7.5 })),
  ];

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = (text: string, size: number, bold: boolean) => {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = size + 8;
  };
  heading(labels.schoolName, 14, true);
  heading(labels.title, 12, true);
  await addCrest(workbook, worksheet, 42);
  worksheet.addRow([]);

  const tableTitle = worksheet.addRow([labels.tableTitle]);
  tableTitle.getCell(1).font = laoFont({ bold: true, size: 12 });

  // ── Column headings: the grade over its ລ / ຍ pair ─────────────────────────
  const gradeRow = worksheet.addRow([labels.grade]);
  const pairRow = worksheet.addRow([]);
  worksheet.mergeCells(gradeRow.number, 1, pairRow.number, 1);
  [...grades.map((grade) => grade.label), labels.allGrades].forEach((label, index) => {
    const column = 2 + index * 2;
    gradeRow.getCell(column).value = label;
    worksheet.mergeCells(gradeRow.number, column, gradeRow.number, column + 1);
    pairRow.getCell(column).value = labels.total;
    pairRow.getCell(column + 1).value = labels.female;
  });
  for (const row of [gradeRow, pairRow]) {
    row.height = 22;
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.font = laoFont({ bold: true });
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  // ── The figures ──────────────────────────────────────────────────────────
  const body: { label: string; read: (grade: GradeFigures) => Headcount }[] = [
    { label: labels.start, read: startOfYear },
    ...MOVEMENT_ROWS.map((row) => ({
      label: labels.movements[row],
      read: (grade: GradeFigures) => grade.movements[row],
    })),
  ];
  const firstBodyRow = pairRow.number + 1;
  const currentRowNumber = firstBodyRow + body.length;
  const columnLetter = (column: number) => worksheet.getColumn(column).letter;

  const styleRow = (cells: Cell[], bold = false) => {
    cells.forEach((cell, index) => {
      cell.border = THIN_BORDER;
      cell.font = index === 0 ? laoFont({ bold }) : numberFont({ bold });
      cell.alignment = {
        horizontal: index === 0 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: true,
      };
    });
  };

  /** `=B6+B7-B8…` for one column, in the sheet's own arithmetic. */
  const currentFormula = (column: number) => {
    const letter = columnLetter(column);
    return [
      `${letter}${firstBodyRow}`,
      ...MOVEMENT_ROWS.map(
        (row, index) => `${MOVEMENT_SIGN[row] > 0 ? '+' : '-'}${letter}${firstBodyRow + 1 + index}`,
      ),
    ].join('');
  };
  const sumFormula = (row: number, offset: 0 | 1) =>
    grades.map((_, index) => `${columnLetter(2 + index * 2 + offset)}${row}`).join('+');
  const sumColumn = 2 + grades.length * 2;

  body.forEach(({ label, read }) => {
    const row = worksheet.addRow([label]);
    let total = 0;
    let female = 0;
    grades.forEach((grade, index) => {
      const count = read(figures.get(grade.gradeLevelId)!);
      row.getCell(2 + index * 2).value = count.total;
      row.getCell(3 + index * 2).value = count.female;
      total += count.total;
      female += count.female;
    });
    row.getCell(sumColumn).value = { formula: sumFormula(row.number, 0), result: total };
    row.getCell(sumColumn + 1).value = { formula: sumFormula(row.number, 1), result: female };
    styleRow(Array.from({ length: lastColumn }, (_, column) => row.getCell(column + 1)));
  });

  const current = worksheet.addRow([labels.current]);
  let total = 0;
  let female = 0;
  grades.forEach((grade, index) => {
    const count = figures.get(grade.gradeLevelId)!.current;
    current.getCell(2 + index * 2).value = {
      formula: currentFormula(2 + index * 2),
      result: count.total,
    };
    current.getCell(3 + index * 2).value = {
      formula: currentFormula(3 + index * 2),
      result: count.female,
    };
    total += count.total;
    female += count.female;
  });
  current.getCell(sumColumn).value = { formula: sumFormula(currentRowNumber, 0), result: total };
  current.getCell(sumColumn + 1).value = {
    formula: sumFormula(currentRowNumber, 1),
    result: female,
  };
  styleRow(
    Array.from({ length: lastColumn }, (_, column) => current.getCell(column + 1)),
    true,
  );

  if (labels.exams) addExamTables(worksheet, labels, labels.exams);

  worksheet.addRow([]);
  const printed = worksheet.addRow([labels.printedOn]);
  printed.getCell(1).font = laoFont({ size: 9, color: { argb: 'FF6B7280' } });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * ຜົນການສອບເສັງ as the office lays it out: ມ.ຕົ້ນ then ມ.ປາຍ, each grade three
 * columns — ລ, ຍ and ຄິດເປັນ % — the % a formula over the grade's ຈ/ນ
 * ນັກຮຽນທັງໝົດ, and crossed out on the two rows that are not shares.
 */
function addExamTables(worksheet: Worksheet, labels: DistrictReportLabels, exams: ExamSection) {
  worksheet.addRow([]);
  const title = worksheet.addRow([exams.title]);
  title.getCell(1).font = laoFont({ bold: true, size: 12 });

  for (const group of exams.groups) {
    const lastColumn = 1 + group.grades.length * 3;
    const groupTitle = worksheet.addRow([`* ${group.label}`]);
    groupTitle.getCell(1).font = laoFont({ bold: true });

    const gradeRow = worksheet.addRow([exams.content]);
    const pairRow = worksheet.addRow([]);
    worksheet.mergeCells(gradeRow.number, 1, pairRow.number, 1);
    group.grades.forEach((grade, index) => {
      const column = 2 + index * 3;
      gradeRow.getCell(column).value = grade.label;
      worksheet.mergeCells(gradeRow.number, column, gradeRow.number, column + 1);
      pairRow.getCell(column).value = labels.total;
      pairRow.getCell(column + 1).value = labels.female;
      gradeRow.getCell(column + 2).value = exams.percent;
      worksheet.mergeCells(gradeRow.number, column + 2, pairRow.number, column + 2);
    });
    for (const row of [gradeRow, pairRow]) {
      row.height = 22;
      for (let column = 1; column <= lastColumn; column += 1) {
        const cell = row.getCell(column);
        cell.font = laoFont({ bold: true });
        cell.fill = HEADER_FILL;
        cell.border = THIN_BORDER;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }
    }

    const studentsRow = pairRow.number + 1;
    for (const key of EXAM_ROWS) {
      const row = worksheet.addRow([exams.rows[key]]);
      row.getCell(1).font = laoFont();
      row.getCell(1).border = THIN_BORDER;
      row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      group.grades.forEach((grade, index) => {
        const column = 2 + index * 3;
        const counts = exams.figures.get(grade.gradeLevelId)!;
        row.getCell(column).value = counts[key].total;
        row.getCell(column + 1).value = counts[key].female;
        const percent = row.getCell(column + 2);
        if (EXAM_PERCENT_ROWS.includes(key)) {
          const part = `${worksheet.getColumn(column).letter}${row.number}`;
          const whole = `${worksheet.getColumn(column).letter}${studentsRow}`;
          const total = counts.students.total;
          percent.value = {
            formula: `IF(${whole}=0,"",${part}/${whole})`,
            result: total > 0 ? counts[key].total / total : '',
          };
          percent.numFmt = '0.00%';
          percent.border = THIN_BORDER;
        } else {
          // The office's sheet crosses these out: a total is not a share of itself.
          percent.border = {
            ...THIN_BORDER,
            diagonal: { up: true, down: true, style: 'thin', color: { argb: 'FF000000' } },
          };
        }
        for (const cell of [row.getCell(column), row.getCell(column + 1), percent]) {
          cell.font = numberFont();
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
        row.getCell(column).border = THIN_BORDER;
        row.getCell(column + 1).border = THIN_BORDER;
      });
    }
    worksheet.addRow([]);
  }
}

export function districtReportFileName(title: string): string {
  return `${safeFileName(title)}.xlsx`;
}
