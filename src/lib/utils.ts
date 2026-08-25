import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { twMerge } from 'tailwind-merge';
import type { Ref } from '@/types/common';
import { CURRENT_ROLL_STUDENT_STATUSES, type StudentStatus } from '@/types/enums';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Reference fields arrive as an id on list endpoints and as a populated object
 * on detail endpoints. These two readers work with either shape.
 */
export function refId<T>(ref: Ref<T> | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : (ref.id ?? null);
}

export function refObject<T>(ref: Ref<T> | undefined): T | null {
  if (!ref || typeof ref === 'string') return null;
  return ref;
}

/**
 * Whether a populated student ref names a child on the current roll.
 *
 * A student's status and their enrollment's status are separate records: the
 * office marks a child as transferred, dropped or suspended without closing the
 * enrollment that placed them in a room, so a class read off enrollments alone
 * still carries their name. Screens that ask "who is in the class today" — roll
 * call, the behaviour register — filter by this; screens that show what was
 * recorded, or that exist to fix the stale enrollment, do not.
 *
 * An unpopulated ref carries no status to judge by, so it is kept: the roster row
 * is then the only evidence there is.
 */
export function isOnCurrentRoll(ref: Ref<{ status?: StudentStatus }> | undefined): boolean {
  const status = refObject(ref)?.status;
  if (!status) return true;
  return (CURRENT_ROLL_STUDENT_STATUSES as readonly string[]).includes(status);
}

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * The API sends ISO 8601 strings. Anything unparseable renders as an em dash
 * rather than "Invalid Date".
 */
function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'dd/MM/yyyy',
): string {
  const date = toDate(value);
  return date ? format(date, pattern, { locale: enUS }) : '—';
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, 'dd/MM/yyyy HH:mm');
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

/** `yyyy-MM-dd`, the format the API's date-only fields expect. */
export function toDateInput(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
}

export function calculateAge(dateOfBirth: string | Date | null | undefined): number | null {
  const date = toDate(dateOfBirth);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

// ── Names ───────────────────────────────────────────────────────────────────

interface BilingualName {
  firstNameLo?: string | null;
  lastNameLo?: string | null;
  firstNameEn?: string | null;
  lastNameEn?: string | null;
}

/**
 * Full name in the active language, falling back to the other one — an English
 * record with no Lao name should still render something.
 */
export function fullName(person: BilingualName | null | undefined, locale = 'lo'): string {
  if (!person) return '—';
  const lo = [person.firstNameLo, person.lastNameLo].filter(Boolean).join(' ').trim();
  const en = [person.firstNameEn, person.lastNameEn].filter(Boolean).join(' ').trim();
  if (locale === 'en') return en || lo || '—';
  return lo || en || '—';
}

interface BilingualNickname {
  nickname?: string | null;
  nicknameEn?: string | null;
}

/**
 * Nickname in the active language, or `null` when there is none.
 *
 * Returns `null` rather than the em dash `fullName` uses, because a nickname is
 * shown as an aside next to the real name — a placeholder there would only be
 * noise. Callers that need a cell value supply their own fallback.
 */
export function nickname(
  person: BilingualNickname | null | undefined,
  locale = 'lo',
): string | null {
  if (!person) return null;
  const lo = person.nickname?.trim();
  const en = person.nicknameEn?.trim();
  return (locale === 'en' ? en || lo : lo || en) || null;
}

/**
 * `ສົມຈິດ ວົງສາ (ລິຕ້າ)` — the same aside as `<StudentName>`, flattened.
 *
 * For the places that can only take a string: a printed register's stacked cell,
 * a picker's option label. Prefer the component wherever markup is possible, so
 * the nickname keeps its muted styling.
 */
export function withNickname(
  name: string | null | undefined,
  nick: string | null | undefined,
): string {
  const base = name?.trim();
  if (!base) return '—';
  return nick?.trim() ? `${base} (${nick.trim()})` : base;
}

export function initials(person: BilingualName | null | undefined): string {
  const name = fullName(person);
  if (name === '—') return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

/** Picks `nameLo`/`nameEn` for the active language. */
export function localizedName(
  entity: { nameLo?: string | null; nameEn?: string | null } | null | undefined,
  locale = 'lo',
): string {
  if (!entity) return '—';
  if (locale === 'en') return entity.nameEn || entity.nameLo || '—';
  return entity.nameLo || entity.nameEn || '—';
}

// ── Query strings ───────────────────────────────────────────────────────────

/**
 * Drops `undefined`, `null` and `''` so an untouched filter never narrows the
 * result set, and `?search=` never reaches the API as an empty term.
 */
export function cleanParams<T extends Record<string, unknown>>(params: T): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    result[key] = String(value);
  }
  return result;
}

// ── Files ───────────────────────────────────────────────────────────────────

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Saves a fetched blob under `filename` without navigating away. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ── Misc ────────────────────────────────────────────────────────────────────

export function percentage(part: number, total: number, digits = 1): string {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(digits)}%`;
}

/** Stable colour index for a chart series or avatar, derived from a string. */
export function hashIndex(value: string, buckets: number): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) % 100_000;
  return hash % buckets;
}
