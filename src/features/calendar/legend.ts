import type { CalendarEventType, DayState, SchoolDayEffect } from '@/types/enums';

/**
 * The printed sheet's own colours.
 *
 * The office fills this screen in with `SCHOOL CALENDAR — SECONDARY` on the desk
 * beside them, and checks their work by comparing the two. So the grid is painted
 * in the paper's colours rather than in the app's status palette: a holiday is the
 * sheet's pink and not `--danger`, because the only question being asked of the
 * screen is "does this match?".
 *
 * `cell` paints a day in the grid, `swatch` the legend and the event list. Both
 * are deliberately light: the day number has to stay readable on top.
 */
export interface EventStyle {
  cell: string;
  swatch: string;
}

const STYLES: Record<CalendarEventType, EventStyle> = {
  first_day: { cell: 'bg-emerald-200 text-emerald-950', swatch: 'bg-emerald-300' },
  year_end_program: { cell: 'bg-rose-300 text-rose-950', swatch: 'bg-rose-400' },
  holiday: { cell: 'bg-rose-100 text-rose-900', swatch: 'bg-rose-200' },
  celebration: { cell: 'bg-sky-100 text-sky-900', swatch: 'bg-sky-200' },
  exam: { cell: 'bg-slate-200 text-slate-900', swatch: 'bg-slate-300' },
  lao_exam: { cell: 'bg-lime-200 text-lime-950', swatch: 'bg-lime-300' },
  report_card: { cell: 'bg-yellow-200 text-yellow-950', swatch: 'bg-yellow-300' },
  open_house: { cell: 'bg-violet-200 text-violet-950', swatch: 'bg-violet-300' },
  professional_development: { cell: 'bg-orange-200 text-orange-950', swatch: 'bg-orange-300' },
  // Not on the sheet's legend; kept muted so they never read as one of its bands.
  meeting: { cell: 'bg-teal-100 text-teal-900', swatch: 'bg-teal-200' },
  activity: { cell: 'bg-cyan-100 text-cyan-900', swatch: 'bg-cyan-200' },
  deadline: { cell: 'bg-amber-100 text-amber-900', swatch: 'bg-amber-200' },
  other: { cell: 'bg-muted text-muted-foreground', swatch: 'bg-muted-foreground/40' },
};

/** The nine bands the sheet prints, in its own order — what the legend renders. */
export const LEGEND_TYPES: CalendarEventType[] = [
  'first_day',
  'year_end_program',
  'holiday',
  'celebration',
  'exam',
  'lao_exam',
  'report_card',
  'open_house',
  'professional_development',
];

export function eventStyle(type: CalendarEventType): EventStyle {
  return STYLES[type] ?? STYLES.other;
}

/**
 * A day with no event of its own.
 *
 * A weekend is greyed rather than painted with the holiday band: the sheet tints
 * them the same pink, but on screen that makes fifty-two closures a teacher has to
 * read past to find the two that matter.
 */
const PLAIN: Record<DayState, string> = {
  teaching: 'bg-card text-foreground',
  no_classes: 'bg-slate-100 text-slate-700',
  closed: 'bg-rose-50 text-rose-800',
  weekend: 'bg-muted/60 text-muted-foreground',
  out_of_year: 'bg-transparent text-muted-foreground/50',
};

/**
 * How a day should be painted: by the event that decided it, or by its bare state.
 *
 * The events arrive most restrictive first, so the first one is the one that
 * settled the day — a celebration inside an exam week is painted as the exam week,
 * which is what the day actually was.
 */
export function dayCellClass(
  state: DayState,
  events: { type: CalendarEventType }[] = [],
): string {
  if (state === 'weekend' || state === 'out_of_year') return PLAIN[state];
  return events.length > 0 ? eventStyle(events[0].type).cell : PLAIN[state];
}

/** Tone for the `open` / `no_classes` / `closed` badge on an event row. */
export const DAY_EFFECT_TONE: Record<SchoolDayEffect, 'success' | 'warning' | 'danger'> = {
  open: 'success',
  no_classes: 'warning',
  closed: 'danger',
};
