import { BellRing, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { classLabel, subjectLabel } from '@/features/coverage/api';
import { useMyBehaviorWeek } from '../api';

/** Enough to act on; the rest is a count, so the banner cannot push the page down. */
const LISTED = 4;

/**
 * The teacher's own week, at the top of the register.
 *
 * A behaviour row is written in the minutes after a lesson or not at all, so the
 * thing that goes unnoticed is a week quietly passing with nothing on file. The
 * banner is that reminder, and it is deliberately about the *teacher's own*
 * lessons: the API scopes it to the account on the session, which is why it can
 * be rendered for everyone — an office account has no lessons of its own and gets
 * nothing to show.
 *
 * A lesson still ahead in the week is not counted. Being told on Monday about
 * Thursday's class is how a reminder becomes something to scroll past.
 */
export function MyWeekReminder() {
  const { t, i18n } = useTranslation();
  const week = useMyBehaviorWeek();

  const data = week.data;
  // No teacher on the account, or no lesson of their own this week — there is
  // nothing to remind them of, and an empty banner is worse than none.
  if (!data?.teacherId || data.rows.length === 0) return null;

  const missing = data.rows.filter((row) => row.status === 'missing');
  const range = t('behaviorLog.weekRange', {
    from: formatDate(data.startDate),
    to: formatDate(data.endDate),
  });

  if (missing.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success print:hidden">
        <CheckCircle2 className="size-4 shrink-0" />
        {t('behaviorLog.myWeekDone', { range })}
      </p>
    );
  }

  return (
    <Card className="border-warning/30 bg-warning-subtle/40 print:hidden">
      <CardContent className="flex items-start gap-3 pt-5">
        <BellRing className="mt-0.5 size-5 shrink-0 text-warning" />
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium text-warning">
            {t('behaviorLog.myWeekMissing', { count: missing.length })}
          </p>
          <p className="text-xs text-muted-foreground">{range}</p>

          <ul className="space-y-0.5 text-sm">
            {missing.slice(0, LISTED).map((row) => (
              <li key={row.teachingAssignmentId} className="truncate">
                <span className="font-medium">{classLabel(row)}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {subjectLabel(row, i18n.language)}
                  {' · '}
                  {t('behaviorLog.lessonsTaught', { count: row.lessonsElapsed })}
                </span>
              </li>
            ))}
          </ul>

          {missing.length > LISTED && (
            <p className="text-xs text-muted-foreground">
              {t('behaviorLog.andMore', { count: missing.length - LISTED })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t('behaviorLog.myWeekHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
