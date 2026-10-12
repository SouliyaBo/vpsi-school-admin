import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import type { ScheduleSpell, TeachingAssignment } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { formatPeriodTime, weekdayKey } from '../schedule';

/**
 * ປະຫວັດຕາຕະລາງ — the arrangements this lesson has had.
 *
 * Worth showing because the thing it records is invisible otherwise: the reports
 * read each week under the timetable that was in force then, so two weeks of the
 * same lesson can legitimately be owed on different days. Without this panel that
 * looks like the report contradicting the timetable on screen.
 *
 * Nothing is shown for a lesson that has never moved, which is most of them.
 */
export function ScheduleHistory({ assignment }: { assignment: TeachingAssignment | null }) {
  const { t } = useTranslation();
  const spells = assignment?.scheduleHistory ?? [];
  if (spells.length === 0) return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <History className="size-4 shrink-0 text-muted-foreground" />
        {t('assignment.scheduleHistory')}
      </p>
      <ol className="space-y-1">
        {/* Newest first: the recent change is the one being checked. */}
        {[...spells].reverse().map((spell, index) => (
          <Spell key={`${spell.from}-${index}`} spell={spell} />
        ))}
      </ol>
    </div>
  );
}

function Spell({ spell }: { spell: ScheduleSpell }) {
  const { t } = useTranslation();

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      <span className="tabular-nums text-xs text-muted-foreground">
        {formatDate(spell.from)} –{' '}
        {spell.to ? formatDate(spell.to) : t('assignment.scheduleCurrent')}
      </span>
      <span className="flex flex-wrap gap-1">
        {spell.schedule.map((period, index) => (
          <Badge key={index} variant="secondary" className="tabular-nums">
            {t(weekdayKey(period.dayOfWeek))} {formatPeriodTime(period)}
          </Badge>
        ))}
      </span>
      {spell.note && <span className="text-xs text-muted-foreground">· {spell.note}</span>}
    </li>
  );
}
