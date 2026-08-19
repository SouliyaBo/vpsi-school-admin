import { z } from 'zod';
import { vmsg } from '@/lib/form-message';
import {
  optionalNumber,
  optionalText,
  requiredId,
  requiredNumber,
} from '@/lib/zod-helpers';
import { periodsOverlap } from './schedule';

/** Same 24-hour pattern the API's DTO enforces. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const requiredTime = () =>
  z
    .string({ required_error: vmsg('validation.required') })
    .regex(TIME_PATTERN, vmsg('assignment.invalidTime'));

export const periodSchema = z
  .object({
    dayOfWeek: requiredNumber({ min: 0, max: 6, integer: true }),
    startTime: requiredTime(),
    endTime: requiredTime(),
    room: optionalText(30),
    periodNumber: optionalNumber({ min: 1 }),
    isRotating: z.boolean().optional(),
  })
  .refine((period) => period.startTime < period.endTime, {
    path: ['endTime'],
    message: vmsg('assignment.endTimeBeforeStart'),
  });

/**
 * The create form. Editing reuses it — the four references are simply shown
 * read-only, because a PATCH may only replace the schedule, notes and status.
 *
 * The self-overlap pass repeats a check the API also makes. It runs here so a
 * schedule that clashes with *itself* is caught before the round trip, and the
 * offending row is marked rather than the whole form.
 */
export const assignmentSchema = z
  .object({
    teacherId: requiredId(),
    subjectId: requiredId(),
    classroomId: requiredId(),
    semesterId: requiredId(),
    schedule: z.array(periodSchema).min(1, vmsg('assignment.atLeastOnePeriod')),
    notes: optionalText(500),
  })
  .superRefine((values, ctx) => {
    // `isRotating` grants no exemption here, and must not: a swap alternates
    // between different assignments, while these periods are one teacher taking
    // one subject with one class — who cannot take turns with themselves.
    for (let i = 0; i < values.schedule.length; i += 1) {
      for (let j = i + 1; j < values.schedule.length; j += 1) {
        if (!periodsOverlap(values.schedule[i], values.schedule[j])) continue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['schedule', j, 'startTime'],
          message: vmsg('assignment.selfOverlap'),
        });
      }
    }
  });

export type AssignmentFormValues = z.infer<typeof assignmentSchema>;
export type PeriodFormValues = AssignmentFormValues['schedule'][number];

/**
 * A fresh row: Monday, the school's teaching window.
 *
 * The times match the `schedule.dayStartTime` / `dayEndTime` settings the API
 * validates against. A default outside that window — an 08:00 start at a school
 * that teaches from 15:10 — is not merely unhelpful: every new row comes back
 * `outsideSchoolDay` until it is retyped.
 */
export const EMPTY_PERIOD: PeriodFormValues = {
  dayOfWeek: 1,
  startTime: '15:10',
  endTime: '16:55',
  room: '',
  periodNumber: undefined,
  isRotating: false,
};

export const EMPTY_ASSIGNMENT: AssignmentFormValues = {
  teacherId: '',
  subjectId: '',
  classroomId: '',
  semesterId: '',
  schedule: [EMPTY_PERIOD],
  notes: '',
};

// ── Giving one teacher several subjects in one class ────────────────────────

/**
 * One teacher and one class, posted against several subjects in a single pass.
 *
 * The common shape at this school: a class has one teacher who takes most of its
 * timetable. Entering that as five assignments means re-picking the same
 * semester, class and teacher five times over; here they are picked once and the
 * subjects are ticked.
 *
 * Each subject still needs its own times — they are lessons of the same class,
 * so a shared schedule would put the class in two lessons at once and every
 * subject after the first would come back a 409.
 */
export const bulkAssignmentSchema = z
  .object({
    semesterId: requiredId(),
    classroomId: requiredId(),
    teacherId: requiredId(),
    targets: z
      .array(
        z.object({
          subjectId: requiredId(),
          /** Carried for display; never sent. */
          label: z.string(),
          schedule: z.array(periodSchema).min(1, vmsg('assignment.atLeastOnePeriod')),
        }),
      )
      .min(1, vmsg('assignment.pickAtLeastOneSubject')),
  })
  .superRefine((values, ctx) => {
    // Every period in the batch, flattened, so one pass catches both a subject
    // clashing with itself and two subjects booked on the same hour.
    const all = values.targets.flatMap((target, targetIndex) =>
      target.schedule.map((period, periodIndex) => ({ period, targetIndex, periodIndex })),
    );

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        if (!periodsOverlap(all[i].period, all[j].period)) continue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targets', all[j].targetIndex, 'schedule', all[j].periodIndex, 'startTime'],
          message:
            all[i].targetIndex === all[j].targetIndex
              ? vmsg('assignment.selfOverlap')
              : vmsg('assignment.batchOverlap'),
        });
      }
    }
  });

export type BulkAssignmentFormValues = z.infer<typeof bulkAssignmentSchema>;
export type BulkTargetValues = BulkAssignmentFormValues['targets'][number];

export const EMPTY_BULK_ASSIGNMENT: BulkAssignmentFormValues = {
  semesterId: '',
  classroomId: '',
  teacherId: '',
  targets: [],
};
