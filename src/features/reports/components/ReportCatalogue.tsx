import {
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  Clock,
  FileBadge,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCan, useSeesEveryStudent } from '@/features/auth/hooks';
import type { PermissionAction, PermissionResource } from '@/types/enums';
import { Card, CardContent } from '@/components/ui/card';

interface CatalogueEntry {
  /** Key under `report.catalogue.items`, holding `title` and `description`. */
  key: string;
  to: string;
  icon: LucideIcon;
  resource: PermissionResource;
  action?: PermissionAction;
  /** Only for accounts that look across the school — the office, not a homeroom teacher. */
  officeOnly?: boolean;
}

/**
 * Every report the admin already makes, filed by what it is about.
 *
 * They were built where their data is entered — the monthly summary on the marks
 * page, the district report on the student list — and stay there; this is the
 * one place that lists them, with a link that opens the page on the right tab.
 * An entry the account cannot open is left out rather than shown and refused.
 */
const GROUPS: { key: string; entries: CatalogueEntry[] }[] = [
  {
    key: 'students',
    entries: [
      {
        key: 'district',
        to: '/students',
        icon: FileBarChart,
        resource: 'students',
        officeOnly: true,
      },
      { key: 'studentList', to: '/students', icon: FileSpreadsheet, resource: 'students' },
    ],
  },
  {
    key: 'marks',
    entries: [
      { key: 'monthSheet', to: '/scores?tab=month', icon: CalendarDays, resource: 'scores' },
      { key: 'semesterSheet', to: '/scores?tab=semester', icon: CalendarRange, resource: 'scores' },
      { key: 'annualSheet', to: '/scores?tab=annual', icon: FileText, resource: 'scores' },
      {
        key: 'termResults',
        to: '/term-results?tab=class',
        icon: FileBadge,
        resource: 'term-results',
      },
      {
        key: 'studentResult',
        to: '/term-results?tab=student',
        icon: UserRound,
        resource: 'term-results',
      },
    ],
  },
  {
    key: 'attendance',
    entries: [
      {
        key: 'classAttendance',
        to: '/attendances?tab=summary',
        icon: BarChart3,
        resource: 'attendances',
      },
      {
        key: 'coverage',
        to: '/attendances?tab=coverage',
        icon: CalendarCheck,
        resource: 'attendances',
        action: 'manage',
      },
      {
        key: 'timeliness',
        to: '/attendances?tab=timeliness',
        icon: Clock,
        resource: 'attendances',
        action: 'manage',
      },
      {
        key: 'conduct',
        to: '/conduct-deductions?tab=standing',
        icon: ShieldCheck,
        resource: 'conduct-scores',
      },
    ],
  },
  {
    key: 'homeroom',
    entries: [
      {
        key: 'homeroomReport',
        to: '/homeroom-reviews?tab=report',
        icon: FileText,
        resource: 'homeroom-reviews',
      },
      {
        key: 'homeroomCompliance',
        to: '/homeroom-reviews?tab=report-compliance',
        icon: FileCheck2,
        resource: 'homeroom-reviews',
        action: 'manage',
      },
    ],
  },
];

export function ReportCatalogue() {
  const { t } = useTranslation();
  const can = useCan();
  const seesEveryStudent = useSeesEveryStudent();

  const groups = GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter(
      (entry) =>
        can(entry.resource, entry.action ?? 'read') && (!entry.officeOnly || seesEveryStudent),
    ),
  })).filter((group) => group.entries.length > 0);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t('report.catalogue.hint')}</p>
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t(`report.catalogue.groups.${group.key}`)}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.entries.map((entry) => (
              <Link
                key={entry.key}
                to={entry.to}
                className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors group-hover:border-primary">
                  <CardContent className="flex items-start gap-3 pt-5">
                    <entry.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">
                        {t(`report.catalogue.items.${entry.key}.title`)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t(`report.catalogue.items.${entry.key}.description`)}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
