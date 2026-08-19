import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '@/lib/error-message';
import { scheduleConflicts, type ConflictKind } from '../api';
import { weekdayKey } from '../schedule';

const CONFLICT_LABEL: Record<ConflictKind, string> = {
  teacher: 'assignment.conflictTeacher',
  classroom: 'assignment.conflictClassroom',
  room: 'assignment.conflictRoom',
};

/**
 * Why a save was rejected, listed period by period.
 *
 * A 409 from this endpoint is not a generic failure: it names every clash it
 * found, and the schedule cannot be corrected without seeing which period hit
 * what. Anything else — a grade-level mismatch, a closed semester — falls back
 * to the single translated sentence.
 */
export function ConflictAlert({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;

  const conflicts = scheduleConflicts(error);

  return (
    <div role="alert" className="space-y-2 rounded-md border border-danger/20 bg-danger-subtle p-3">
      <p className="flex items-center gap-2 text-sm font-medium text-danger">
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        {errorMessage(error)}
      </p>

      {conflicts.length > 0 && (
        <ul className="space-y-1 ps-6 text-xs text-danger">
          {conflicts.map((conflict, index) => (
            <li key={index}>
              {t(CONFLICT_LABEL[conflict.kind], {
                day: t(weekdayKey(conflict.dayOfWeek)),
                requested: `${conflict.requested.startTime}–${conflict.requested.endTime}`,
                existing: `${conflict.existing.startTime}–${conflict.existing.endTime}`,
                room: conflict.existing.room ?? conflict.requested.room ?? '—',
              })}
              {/* Says which of the two lessons is the one still to be ticked, so
                  a half-marked swap does not read as a real double-booking. */}
              {conflict.rotationMismatch && ` — ${t('assignment.conflictNotMarked')}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
