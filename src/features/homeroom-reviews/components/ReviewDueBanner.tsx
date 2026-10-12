import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { roomLabel, useMyHomerooms, type MyHomeroom } from '../api';

/**
 * "Your class is waiting to be looked at."
 *
 * The ວັນພຸດ/ວັນສຸກ instruction, where the teacher already is. The Telegram
 * reminder reaches a phone in the evening; this reaches the screen they open in
 * the morning, and the two read from the same endpoint so they cannot disagree.
 *
 * Renders nothing for an account with no homeroom, and nothing when every room is
 * confirmed — a banner that is always there is a banner nobody reads.
 *
 * Every link carries the room *and* the day it is about. The first version linked
 * to `/homeroom-reviews` alone, which from the review page itself is the page you
 * are already on: the button appeared to do nothing, and the missing days it was
 * naming were the one thing the sheet would not open.
 */

/** The day this room most needs opened: the oldest one owed, else the current one. */
function targetDay(room: MyHomeroom): string | undefined {
  // `missingDays` arrives newest first — the oldest is the one the office has been
  // counting against this room the longest.
  const oldestMissing = room.missingDays[room.missingDays.length - 1];
  return oldestMissing ?? room.reviewDay ?? undefined;
}

function sheetLink(room: MyHomeroom): string {
  const params = new URLSearchParams({ classroomId: room.classroom.id });
  const day = targetDay(room);
  if (day) params.set('dueDate', day);
  return `/homeroom-reviews?${params.toString()}`;
}

export function ReviewDueBanner() {
  const { t } = useTranslation();
  const rooms = useMyHomerooms();

  const mine = rooms.data ?? [];
  if (mine.length === 0) return null;

  const outstanding = mine.filter(
    (room) => room.status === 'pending' || room.status === 'missing' || room.missingDays.length > 0,
  );
  if (outstanding.length === 0) return null;

  // Anything already past its deadline is the sharper message: the office's report
  // is about to name it.
  const overdue = outstanding.filter(
    (room) => room.status === 'missing' || room.missingDays.length > 0,
  );

  return (
    <Card className={overdue.length > 0 ? 'border-danger/40' : undefined}>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-3">
          {overdue.length > 0 ? (
            <AlertTriangle className="size-5 text-danger" />
          ) : (
            <ClipboardCheck className="size-5 text-muted-foreground" />
          )}
          <p className="font-medium">
            {overdue.length > 0
              ? t('homeroomReview.bannerOverdue', { count: overdue.length })
              : t('homeroomReview.bannerDue', { count: outstanding.length })}
          </p>
        </div>

        {/* One line per room, each opening the day it is about. A single button for
            several rooms could only ever open one of them. */}
        <ul className="space-y-2">
          {outstanding.map((room) => {
            const days = room.missingDays.slice(0, 3).map((day) => formatDate(day));
            return (
              <li key={room.classroom.id} className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{roomLabel(room.classroom)}</span>
                <span className="text-sm text-muted-foreground">
                  {days.length > 0
                    ? t('homeroomReview.bannerMissingDays', { days: days.join(', ') })
                    : t('homeroomReview.bannerToday', {
                        date: room.reviewDay ? formatDate(room.reviewDay) : '',
                      })}
                  {room.flagged > 0
                    ? ` — ${t('homeroomReview.flaggedCount', { count: room.flagged })}`
                    : ''}
                </span>
                <Button
                  asChild
                  size="sm"
                  className="ms-auto"
                  variant={room.missingDays.length > 0 ? 'default' : 'outline'}
                >
                  <Link to={sheetLink(room)}>
                    <CheckCircle2 />
                    {t('homeroomReview.openSheet')}
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
