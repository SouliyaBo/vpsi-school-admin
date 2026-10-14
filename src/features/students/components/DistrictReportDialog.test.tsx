import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '@/lib/api-client';
import { paginated, renderWithProviders } from '@/test/utils';
import { DistrictReportDialog } from './DistrictReportDialog';

const placed = (gradeLevelId: string) => ({ currentEnrollment: { gradeLevelId } });

/** ມ.1: three on the roll (two girls), a girl transferred out; ມ.2: one suspended. ບໍ່ເອົາໃບປະກາດ is not counted. */
const roster = [
  { id: 's1', status: 'active', gender: 'male', ...placed('g1') },
  { id: 's2', status: 'active', gender: 'female', ...placed('g1') },
  { id: 's3', status: 'active', gender: 'female', ...placed('g1') },
  { id: 's4', status: 'transferred', gender: 'female', ...placed('g1') },
  {
    id: 's5',
    status: 'suspended',
    gender: 'male',
    suspendedAt: '2026-09-15T00:00:00.000Z',
    ...placed('g2'),
  },
  // Suspended with no date: not counted, and the dialog says so.
  { id: 's8', status: 'suspended', gender: 'female', ...placed('g2') },
  { id: 's6', status: 'active', gender: 'male', ...placed('g2') },
  { id: 's7', status: 'no_certificate', gender: 'female', ...placed('g1') },
];

const examRow = (studentId: string, scores: (number | null)[], isPassing: boolean | null) => ({
  studentId,
  isEnrolled: true,
  scores,
  testScores: scores.map((score) => (score === null ? null : 4)),
  isPassing,
});

/** The months the exam table asked for, in order. */
const months: number[] = [];

describe('DistrictReportDialog', () => {
  beforeEach(() => {
    months.length = 0;
    vi.spyOn(apiClient, 'get').mockImplementation((path: string, config?: unknown) => {
      if (path === '/school-years/active')
        return Promise.resolve({
          id: 'sy',
          code: '2026-2027',
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2027-06-30T00:00:00.000Z',
        });
      if (path === '/grade-levels')
        return Promise.resolve(
          paginated([
            { id: 'g1', code: 'm1', nameLo: 'ມ.1', level: 1 },
            { id: 'g2', code: 'm2', nameLo: 'ມ.2', level: 2 },
            { id: 'g5', code: 'm5', nameLo: 'ມ.5', level: 5 },
          ]),
        );
      if (path === '/classrooms') return Promise.resolve(paginated([{ id: 'c1' }, { id: 'c2' }]));
      if (path === '/monthly-marks/class-month') {
        const { classroomId, month } = (config as { params: Record<string, string> }).params;
        months.push(Number(month));
        const sheet = (rows: unknown[]) => Promise.resolve({ months: [9, 10, 11], rows });
        // ມ.1/ກ: s1 passes everything, s2 fails a subject but passes overall,
        // s3 was absent; ມ.2/ກ: s6 passes everything.
        return classroomId === 'c1'
          ? sheet([
              examRow('s1', [6, 7], true),
              examRow('s2', [4, 8], true),
              { ...examRow('s3', [null, null], null), testScores: [null, null] },
            ])
          : sheet([examRow('s6', [9, 9], true)]);
      }
      return Promise.resolve(paginated(roster));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('asks for every student, not just the roll', async () => {
    renderWithProviders(<DistrictReportDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'District report draft' }));
    await screen.findByLabelText('Transferred in ມ.1 T');
    const params = vi
      .mocked(apiClient.get)
      .mock.calls.filter(([path]) => path === '/students')
      .map(([, config]) => (config as { params: Record<string, unknown> }).params);
    expect(params[0]).toMatchObject({ status: 'all' });
  });

  it('prefills from the statuses, takes the office’s figures, and exports with formulas', async () => {
    const created = vi.fn((_blob: Blob) => 'blob:report');
    vi.stubGlobal('URL', { ...URL, createObjectURL: created, revokeObjectURL: vi.fn() });
    const filenames: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });

    renderWithProviders(<DistrictReportDialog />);
    await userEvent.click(screen.getByRole('button', { name: 'District report draft' }));
    expect(await screen.findByLabelText('Transferred out ມ.1 T')).toHaveValue(1);
    expect(screen.getByLabelText('Transferred out ມ.1 F')).toHaveValue(1);
    // A suspension dated this year lands in ປະລະ, not in the ໂຈະ…ມາຮຽນຄືນ row.
    expect(screen.getByLabelText('Dropped out ມ.2 T')).toHaveValue(1);
    expect(screen.getByLabelText('Dropped out ມ.2 F')).toHaveValue(0);
    expect(screen.getByLabelText('Suspended / returned ມ.2 T')).toHaveValue(0);
    expect(screen.getByText(/1 suspended students have no suspension date/)).toBeInTheDocument();
    // Two repeaters in ມ.1, one of them a girl.
    fireEvent.change(screen.getByLabelText('Repeating the grade ມ.1 T'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Repeating the grade ມ.1 F'), {
      target: { value: '1' },
    });
    await userEvent.click(screen.getByRole('button', { name: /export excel/i }));
    await waitFor(() => expect(created).toHaveBeenCalled());

    const [blob] = created.mock.calls[0];
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes.buffer as ArrayBuffer);
    const sheet = workbook.worksheets[0];

    const rowOf = (label: string) => {
      let found = 0;
      sheet.eachRow((row, number) => {
        if (!found && row.getCell(1).value === label) found = number;
      });
      return sheet.getRow(found);
    };
    const result = (value: unknown) =>
      // A formula whose result is 0 is saved without one; Excel recalculates on open.
      typeof value === 'object' && value !== null && 'formula' in value
        ? ((value as { result?: number }).result ?? 0)
        : value;
    // ມ.1, ມ.2 and ມ.5 pairs, then ລວມ.
    const figures = (label: string) =>
      [2, 3, 4, 5, 8, 9].map((column) => result(rowOf(label).getCell(column).value));

    // ມ.1 start: 3 now + 1 out − 2 repeating = 2 (girls 2 + 1 − 1 = 2).
    expect(figures('Start of year')).toEqual([2, 2, 2, 0, 4, 2]);
    expect(figures('Repeating the grade')).toEqual([2, 1, 0, 0, 2, 1]);
    expect(figures('Current')).toEqual([3, 2, 1, 0, 4, 2]);
    const current = rowOf('Current').getCell(2).value as { formula: string };
    expect(current.formula).toMatch(/^B\d+\+B\d+-B\d+-B\d+\+B\d+\+B\d+$/);
    expect(filenames).toEqual(['District report draft 2026-2027.xlsx']);

    // 3. The month's exam table, ມ.ຕົ້ນ first: ລ, ຍ, then the share of the roll.
    const examFigures = (label: string) =>
      [2, 3, 4, 5, 6, 7].map((column) => result(rowOf(label).getCell(column).value));
    expect(examFigures('All students')).toEqual([3, 2, null, 1, 0, null]);
    expect(examFigures('Sat the exam')).toEqual([2, 1, null, 1, 0, null]);
    expect(examFigures('Passed every subject')[0]).toBe(1);
    expect(result(rowOf('Passed every subject').getCell(4).value)).toBeCloseTo(1 / 3, 6);
    expect(examFigures('Below target').slice(0, 2)).toEqual([1, 1]);
    expect(examFigures('Passed overall').slice(0, 2)).toEqual([2, 1]);
    expect(rowOf('Passed overall').getCell(4).numFmt).toBe('0.00%');
    // ມ.5 has nobody, but still heads the ມ.ປາຍ table.
    expect(rowOf('* Upper secondary').number).toBeGreaterThan(rowOf('Passed overall').number);
    // A month the term does not mark snaps to its last one; one it does is asked for as is.
    expect(months.every((month) => [9, 10, 11].includes(month) || month === months[0])).toBe(true);
    expect(months.at(-1)).toSatisfy((month: number) => [9, 10, 11].includes(month));
  });
});
