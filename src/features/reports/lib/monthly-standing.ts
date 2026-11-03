import type { StandingBand, StandingPeriod, StandingStudent } from '../api';

/**
 * What the page adds to the API's figures: which way a share moved, and who
 * changed band. The bands and shares themselves are the API's.
 */

/** A `Select` value naming one month of one term. */
export function periodKey(period: Pick<StandingPeriod, 'semesterId' | 'month'>): string {
  return `${period.semesterId}:${period.month}`;
}

export function parsePeriodKey(key: string): { semesterId: string; month: number } {
  const [semesterId, month] = key.split(':');
  return { semesterId: semesterId ?? '', month: Number(month) };
}

/** Percentage points between two shares, or `null` when either is missing. */
export function shareChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null) return null;
  return Math.round((now - before) * 100) / 100;
}

/** Best first, so "down" means further down the list. */
const ORDER: Record<Exclude<StandingBand, 'incomplete'>, number> = { top: 0, middle: 1, below: 2 };

export interface BandChange {
  student: StandingStudent;
  from: Exclude<StandingBand, 'incomplete'>;
  to: Exclude<StandingBand, 'incomplete'>;
}

/**
 * The students whose band moved since the month compared with, split by way.
 *
 * Only students decided in both months: a month that is not finished has no
 * band to have left or reached.
 */
export function bandChanges(students: StandingStudent[]): { down: BandChange[]; up: BandChange[] } {
  const down: BandChange[] = [];
  const up: BandChange[] = [];
  for (const student of students) {
    const from = student.previousBand;
    const to = student.band;
    if (!from || from === 'incomplete' || to === 'incomplete' || from === to) continue;
    (ORDER[to] > ORDER[from] ? down : up).push({ student, from, to });
  }
  return { down, up };
}
