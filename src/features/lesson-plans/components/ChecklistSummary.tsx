import { AlertTriangle, CheckCircle2, ListChecks, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { MonthChecklist } from '../api';

/** The four numbers either side of the checklist acts on. */
export function ChecklistSummary({ summary }: { summary: MonthChecklist['summary'] }) {
  const { t } = useTranslation();

  const tiles = [
    {
      icon: ListChecks,
      label: t('lessonPlan.handedInCount'),
      value: `${summary.submitted}/${summary.total}`,
      tone: 'text-foreground',
    },
    {
      icon: CheckCircle2,
      label: t('lessonPlanStatus.approved'),
      value: String(summary.approved),
      tone: summary.approved > 0 ? 'text-success' : 'text-muted-foreground',
    },
    {
      icon: AlertTriangle,
      label: t('lessonPlan.overdue'),
      value: String(summary.overdue),
      tone: summary.overdue > 0 ? 'text-danger' : 'text-muted-foreground',
    },
    {
      icon: Paperclip,
      label: t('lessonPlan.withAttachments'),
      value: String(summary.withFiles),
      tone: 'text-foreground',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 pt-6">
            <tile.icon className={cn('size-5 shrink-0', tile.tone)} />
            <div className="min-w-0">
              <p className={cn('text-xl font-semibold tabular-nums', tile.tone)}>{tile.value}</p>
              <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
