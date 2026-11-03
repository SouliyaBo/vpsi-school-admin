/**
 * Small rules the guardian-report screens share, kept apart so they can be
 * tested without rendering anything.
 */

/** The calendar months a term touches, in order, e.g. Aug → Jan for term one. */
export function termMonths(startDate: string, endDate: string): number[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months: number[] = [];
  for (
    let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    cursor <= end;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
  ) {
    months.push(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * The month a teacher most likely means: the one just finished, since a monthly
 * report goes out after the month is over — or the current one in the first
 * month of term, when there is no finished one yet.
 */
export function defaultReportMonth(months: number[], today = new Date()): number | undefined {
  const current = today.getUTCMonth() + 1;
  const index = months.indexOf(current);
  if (index > 0) return months[index - 1];
  if (index === 0) return current;
  return months[months.length - 1];
}

/** The four digits a guardian opens the report with — the server's rule, for display. */
export function phoneLastDigits(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/**
 * The number as `wa.me` wants it: country code, no `+`, no leading zero.
 * Lao numbers are on file as `020…` or `030…`, so a leading `0` is swapped for `856`.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  if (digits.startsWith('856')) return digits;
  return `856${digits.replace(/^0/, '')}`;
}

export function whatsappLink(phone: string | null | undefined, text: string): string {
  const number = whatsappNumber(phone);
  const query = `text=${encodeURIComponent(text)}`;
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`;
}

/** Whether a link copied from this page would travel in the clear. */
export function isInsecureOrigin(location: Pick<Location, 'protocol'> = window.location): boolean {
  return location.protocol !== 'https:';
}

/** The token from `/r#<token>`, or `null` for a link that lost its fragment. */
export function tokenFromHash(hash: string): string | null {
  const token = hash.replace(/^#/, '').trim();
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
