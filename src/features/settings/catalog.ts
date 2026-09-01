import { LOCALES } from '@/types/enums';
import type { Setting } from '@/types/entities';

/**
 * What the value of a given key looks like on screen.
 *
 * The API stores every value as `Mixed` and validates nothing, so nothing in a
 * response says whether `15:10` is a time or a string, or whether `[1,2,3,4,5]`
 * is a list of weekdays. This table supplies that — and for a key it does not
 * know, `settingMeta` falls back to the JavaScript type of the stored value.
 */
export type SettingEditorKind =
  'text' | 'textarea' | 'number' | 'boolean' | 'time' | 'select' | 'weekdays' | 'json';

export interface SettingMeta {
  kind: SettingEditorKind;
  /**
   * Leaf name under `setting.label.` and `setting.hint.`.
   *
   * One field for both, so a key cannot end up with a translated label and an
   * English hint. Absent for a key the catalogue does not know: that row falls
   * back to its dotted key and to the description the API stores.
   */
  name?: string;
  min?: number;
  max?: number;
  step?: number;
  /** For `select`: the allowed values, labelled by `optionLabelKey`. */
  options?: readonly string[];
  optionLabelKey?: (value: string) => string;
  /** Warns before an edit with consequences beyond this screen. */
  cautionKey?: string;
}

const LOCALE_OPTIONS: SettingMeta = {
  kind: 'select',
  name: 'defaultLocale',
  options: LOCALES,
  optionLabelKey: (value) => `setting.locale.${value}`,
};

/**
 * The seeded catalogue (`SeedService.seedSettings` on the API), key for key.
 *
 * A key that disappears from the seed and stays here is harmless — it simply
 * never matches a row. A key the seed adds and this table misses still renders,
 * as an inferred editor with its dotted key for a label, which is the reason
 * the fallback exists.
 */
export const SETTING_CATALOG: Readonly<Record<string, SettingMeta>> = {
  // ── school ──
  'school.nameLo': { kind: 'text', name: 'nameLo' },
  'school.nameEn': { kind: 'text', name: 'nameEn' },
  'school.nameFullLo': { kind: 'text', name: 'nameFullLo' },
  'school.authorityLo': { kind: 'text', name: 'authorityLo' },
  'school.provinceLo': { kind: 'text', name: 'provinceLo' },
  'school.phone': { kind: 'text', name: 'phone' },
  'school.addressLo': { kind: 'textarea', name: 'addressLo' },
  'school.principalTitleLo': { kind: 'text', name: 'principalTitleLo' },
  'school.documentCodeLo': {
    kind: 'text',
    name: 'documentCodeLo',
    // Baked into every letter number already issued; correcting it later
    // contradicts letters in circulation.
    cautionKey: 'setting.caution.documentCode',
  },
  'school.defaultLocale': LOCALE_OPTIONS,

  // ── certificates ──
  'certificates.studyVerificationNumberPadding': {
    kind: 'number',
    name: 'certificatePadding',
    min: 0,
    max: 6,
    step: 1,
  },
  'certificates.studyVerificationStartNumber': {
    kind: 'number',
    name: 'certificateStartNumber',
    min: 1,
    step: 1,
    cautionKey: 'setting.caution.certificateStartNumber',
  },

  // ── grading ──
  'grading.scale': {
    kind: 'json',
    name: 'gradeScale',
    cautionKey: 'setting.caution.gradeScale',
  },
  'grading.reportMarkScale': {
    kind: 'number',
    name: 'reportMarkScale',
    min: 1,
    max: 100,
    step: 1,
  },
  'grading.semesterMonths': {
    kind: 'json',
    name: 'semesterMonths',
    cautionKey: 'setting.caution.semesterMonths',
  },
  'grading.passingPercentage': {
    kind: 'number',
    name: 'passingPercentage',
    min: 0,
    max: 100,
    step: 1,
  },

  // ── attendance ──
  'attendance.alertAbsenceThreshold': {
    kind: 'number',
    name: 'alertAbsenceThreshold',
    min: 1,
    max: 60,
    step: 1,
  },

  // ── schedule ──
  'schedule.dayStartTime': { kind: 'time', name: 'dayStartTime' },
  'schedule.dayEndTime': { kind: 'time', name: 'dayEndTime' },
  'schedule.teachingDays': {
    kind: 'weekdays',
    name: 'teachingDays',
    cautionKey: 'setting.caution.teachingDays',
  },

  // ── lessonPlans ──
  'lessonPlans.submissionPolicy': {
    kind: 'json',
    name: 'submissionPolicy',
    cautionKey: 'setting.caution.submissionPolicy',
  },

  // ── exams ──
  'exams.passingPercentage': {
    kind: 'number',
    name: 'examPassingPercentage',
    min: 0,
    max: 100,
    step: 1,
  },
  'exams.eligibility': { kind: 'json', name: 'examEligibility' },
};

/** Tabs, in the order the office thinks about them; unknown ones follow. */
export const CATEGORY_ORDER = [
  'school',
  'grading',
  'schedule',
  'attendance',
  'lessonPlans',
  'certificates',
  'exams',
  'general',
] as const;

/** Editor for a value whose key is not in the catalogue. */
function inferKind(value: unknown): SettingEditorKind {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  // A long string gets room to breathe; anything structured goes to JSON.
  if (typeof value === 'string') return value.length > 60 ? 'textarea' : 'text';
  return 'json';
}

export function settingMeta(setting: Setting): SettingMeta {
  return SETTING_CATALOG[setting.key] ?? { kind: inferKind(setting.value) };
}

/**
 * Order within a tab: catalogued keys first, in the order this file lists them,
 * so the school's name is not sorted below its telephone number. Keys the
 * catalogue does not know follow, alphabetically.
 */
const CATALOG_ORDER = Object.keys(SETTING_CATALOG);

export function compareSettings(a: Setting, b: Setting): number {
  const indexA = CATALOG_ORDER.indexOf(a.key);
  const indexB = CATALOG_ORDER.indexOf(b.key);
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.key.localeCompare(b.key);
}

export function sortCategories(categories: string[]): string[] {
  const rank = (category: string) => {
    const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Whether an edited value still equals the stored one.
 *
 * Compared through JSON because a value may be an object or an array — a band
 * table re-parsed from identical text is a different object with the same
 * content, and must not count as an unsaved change.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
