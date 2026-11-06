/**
 * The day a new month's sheet becomes the one a mark page opens on.
 *
 * Teachers finish the month behind them in its first days, so a page that turned
 * over on the 1st opened on ພະຈິກ while they were still typing ຕຸລາ — and the
 * marks went into the wrong month. Until the 5th the page stays on the last one.
 */
export const NEW_MONTH_FROM_DAY = 5;

/** The calendar month a mark page opens on, before the term has had its say. */
export function markingMonth(today: Date = new Date()): number {
  const month = today.getMonth() + 1;
  if (today.getDate() >= NEW_MONTH_FROM_DAY) return month;
  return month === 1 ? 12 : month - 1;
}

/**
 * `month`, or the term's month nearest to it when the term does not collect it.
 *
 * A month past the term — ທັນວາ and ມັງກອນ are exam months — lands on its last
 * month; one before it, on its first, so ມັງກອນ in the second term opens on ກຸມພາ
 * rather than on a ເມສາ nobody has marked yet. Months are compared round the
 * calendar from the term's first, so a term running over the new year still
 * reads in order; a month as near one end as the other counts as past it.
 */
export function monthInTerm(month: number, months: number[]): number {
  if (months.length === 0 || months.includes(month)) return month;
  const first = months[0];
  const last = months[months.length - 1];
  const from = (value: number) => (value - first + 12) % 12;
  const afterEnd = from(month) - from(last);
  const beforeStart = 12 - from(month);
  return afterEnd <= beforeStart ? last : first;
}
