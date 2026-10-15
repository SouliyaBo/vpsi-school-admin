import { describe, expect, it } from 'vitest';
import {
  countDistrictReport,
  everyone,
  reportYear,
  startOfYear,
  undatedSuspensions,
  type DistrictReportStudent,
} from './district-report';

const grades = [
  { gradeLevelId: 'm1', label: 'ມ.1', level: 1 },
  { gradeLevelId: 'm2', label: 'ມ.2', level: 2 },
];

const kid = (
  gradeLevelId: string | null,
  status: DistrictReportStudent['status'],
  gender: 'male' | 'female' = 'male',
): DistrictReportStudent => ({ gradeLevelId, status, gender });

describe('countDistrictReport', () => {
  it('puts each status in its row, by grade and with the girls apart', () => {
    const figures = countDistrictReport(
      [
        kid('m1', 'active'),
        kid('m1', 'active', 'female'),
        kid('m1', 'no_certificate', 'female'),
        kid('m1', 'transferred', 'female'),
        { ...kid('m1', 'suspended'), suspendedAt: '2026-09-15T00:00:00.000Z' },
        // Had declined the certificate before stopping: not reported as a suspension.
        {
          ...kid('m1', 'suspended'),
          suspendedAt: '2026-09-15T00:00:00.000Z',
          statusBeforeSuspension: 'no_certificate',
        },
        // Suspended last year, and suspended with no date: neither is this year's.
        { ...kid('m1', 'suspended'), suspendedAt: '2026-03-01T00:00:00.000Z' },
        kid('m1', 'suspended', 'female'),
        kid('m2', 'dropped'),
        kid('m2', 'graduated'),
        kid('m2', 'new'),
        kid(null, 'active'),
      ],
      grades,
      { startDate: '2026-09-01T00:00:00.000Z', endDate: '2027-06-30T00:00:00.000Z' },
    );
    const m1 = figures.get('m1')!;
    // The ບໍ່ເອົາໃບປະກາດ girl is outside ປະຈຸບັນ but inside ລວມທັງໝົດ.
    expect(m1.current).toEqual({ total: 2, female: 1 });
    expect(m1.noCertificate).toEqual({ total: 1, female: 1 });
    expect(everyone(m1)).toEqual({ total: 3, female: 2 });
    expect(m1.movements.transferOut).toEqual({ total: 1, female: 1 });
    // This year's suspension is reported under ປະລະ; ໂຈະ…ມາຮຽນຄືນ is the office's to fill.
    expect(m1.movements.dropped).toEqual({ total: 1, female: 0 });
    expect(m1.movements.suspended).toEqual({ total: 0, female: 0 });
    expect(m1.movements.transferIn).toEqual({ total: 0, female: 0 });
    const m2 = figures.get('m2')!;
    expect(m2.current).toEqual({ total: 0, female: 0 });
    expect(m2.movements.dropped).toEqual({ total: 1, female: 0 });
  });
});

describe('startOfYear', () => {
  it('works back from today with the office sheet’s arithmetic', () => {
    // ມ.2 on the office's sheet: 39 + 1 − 2 + 5 = 43, girls 22 + 0 − 1 + 1 = 22.
    expect(
      startOfYear({
        current: { total: 43, female: 22 },
        // Not part of the arithmetic: ຕົ້ນປີ leaves them out as ປະຈຸບັນ does.
        noCertificate: { total: 3, female: 2 },
        movements: {
          transferIn: { total: 1, female: 0 },
          transferOut: { total: 2, female: 1 },
          dropped: { total: 0, female: 0 },
          suspended: { total: 0, female: 0 },
          repeating: { total: 5, female: 1 },
        },
      }),
    ).toEqual({ total: 39, female: 22 });
  });
});

describe('reportYear', () => {
  const active = { startDate: '2026-08-17T00:00:00.000Z', endDate: '2027-06-10T00:00:00.000Z' };

  it('starts the day after the previous school year ended', () => {
    expect(
      reportYear(active, [
        active,
        { startDate: '2025-09-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' },
        { startDate: '2024-09-01T00:00:00.000Z', endDate: '2025-06-30T00:00:00.000Z' },
      ]),
    ).toEqual({ startDate: '2026-07-01T00:00:00.000Z', endDate: active.endDate });
  });

  it('counts a child who left over the holidays, before opening day', () => {
    const year = reportYear(active, [
      active,
      { startDate: '2025-09-01T00:00:00.000Z', endDate: '2026-06-30T00:00:00.000Z' },
    ]);
    const figures = countDistrictReport(
      [
        { ...kid('m1', 'suspended'), suspendedAt: '2026-08-03T00:00:00.000Z' },
        { ...kid('m1', 'suspended'), suspendedAt: '2026-06-30T00:00:00.000Z' },
      ],
      grades,
      year,
    );
    expect(figures.get('m1')!.movements.dropped.total).toBe(1);
  });

  it('falls back to the school year itself when no earlier one is on file', () => {
    expect(reportYear(active, [active])).toEqual(active);
  });
});

describe('undatedSuspensions', () => {
  it('counts the suspended children with no date, and only them', () => {
    expect(
      undatedSuspensions([
        kid('m1', 'suspended'),
        { ...kid('m1', 'suspended'), suspendedAt: '2026-09-15T00:00:00.000Z' },
        kid('m1', 'active'),
      ]),
    ).toBe(1);
  });
});
