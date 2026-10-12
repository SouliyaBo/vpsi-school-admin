import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { classrooms } from '@/features/classrooms/api';
import { formatDate, fullName, refObject } from '@/lib/utils';
import type { HomeroomTerm, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * ປະຫວັດຄູປະຈຳຫ້ອງ — who held this room, and when.
 *
 * `homeroomTeacherId` answers "who is it now" and nothing else, which was enough
 * until a teacher left mid-term. After that the question the office actually asks
 * becomes unanswerable from the screen: a room that went three weeks without a
 * ຄູປະຈຳຫ້ອງ looks, afterwards, exactly like a room whose teacher simply never
 * reviewed it — and the ວັນພຸດ/ວັນສຸກ report blames whoever holds it today for days
 * nobody held it at all.
 *
 * Read from the single-classroom endpoint rather than from the row the form was
 * opened with: the list deliberately leaves the history's teachers unpopulated,
 * because naming them on every row of every page would be a cost paid for a panel
 * almost nobody opens.
 */
export function HomeroomHistory({ classroomId }: { classroomId: string }) {
  const { t, i18n } = useTranslation();
  const detail = classrooms.useDetail(classroomId);

  const spells = detail.data?.homeroomHistory ?? [];

  return (
    <div className="space-y-1.5 sm:col-span-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <History className="size-4 shrink-0 text-muted-foreground" />
        {t('handover.history')}
      </p>

      {detail.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : spells.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('handover.historyEmpty')}</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {/* Newest first: the recent change is the one being checked. */}
          {[...spells].reverse().map((spell, index) => (
            <Spell key={`${spell.from}-${index}`} spell={spell} language={i18n.language} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Spell({ spell, language }: { spell: HomeroomTerm; language: string }) {
  const { t } = useTranslation();
  const teacher = refObject<Teacher>(spell.teacherId);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={teacher ? 'font-medium' : 'text-muted-foreground'}>
        {teacher ? fullName(teacher, language) : t('handover.historyVacant')}
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">
        {formatDate(spell.from)} –{' '}
        {spell.to ? (
          formatDate(spell.to)
        ) : (
          <Badge variant="secondary" className="align-middle">
            {t('handover.historyCurrent')}
          </Badge>
        )}
      </span>
      {spell.note && <span className="text-xs text-muted-foreground">· {spell.note}</span>}
    </li>
  );
}
