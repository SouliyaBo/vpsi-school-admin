import { CalendarDays, GraduationCap, Megaphone, School, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { gradeLevels } from '@/features/grade-levels/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester } from '@/features/semesters/api';
import { formatDate, localizedName, percentage } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import {
  useCount,
  useGenderSplit,
  useLatestAnnouncements,
  useStudentsByGrade,
  useStudentsByStatus,
  useUpcomingEvents,
} from '../api';

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const user = useCurrentUser();
  const can = useCan();

  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const studentCount = useCount('students', '/students', { status: 'active' });
  const teacherCount = useCount('teachers', '/teachers', { status: 'active' });
  const classroomCount = useCount('classrooms', '/classrooms');

  // Grade levels drive the distribution chart, so they are fetched whole (the
  // list is short and stable) rather than paged.
  const grades = gradeLevels.useList({ limit: 100, sortBy: 'level', sortOrder: 'asc' });
  const byGrade = useStudentsByGrade(grades.data?.data);
  const byStatus = useStudentsByStatus();
  const gender = useGenderSplit();

  const announcements = useLatestAnnouncements();
  const events = useUpcomingEvents();

  const now = new Date();
  const upcoming = (events.data ?? [])
    .filter((event) => new Date(event.endDate ?? event.startDate) >= now)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  const chartData = byGrade.data
    .filter((entry) => entry.count > 0 || !byGrade.isLoading)
    .map((entry) => ({
      name: entry.level.code,
      label: localizedName(entry.level, i18n.language),
      count: entry.count,
    }));

  const genderTotal = gender.male + gender.female;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('dashboard.title')}
        description={user ? t('dashboard.welcome', { name: user.username }) : undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {activeYear.data ? (
              <Badge variant="outline" className="gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {localizedName(activeYear.data, i18n.language)}
              </Badge>
            ) : (
              !activeYear.isLoading && <Badge variant="warning">{t('dashboard.noActiveYear')}</Badge>
            )}
            {activeSemester.data && (
              <Badge variant="outline">{localizedName(activeSemester.data, i18n.language)}</Badge>
            )}
          </div>
        }
      />

      {/* Headline figures: a number is the right form here — a chart of four
          independent totals would carry no extra information. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={GraduationCap}
          label={t('dashboard.totalStudents')}
          value={studentCount.data}
          isLoading={studentCount.isLoading}
          to={can('students') ? '/students' : undefined}
        />
        <StatCard
          icon={UsersRound}
          label={t('dashboard.totalTeachers')}
          value={teacherCount.data}
          isLoading={teacherCount.isLoading}
          to={can('teachers') ? '/teachers' : undefined}
        />
        <StatCard
          icon={School}
          label={t('dashboard.totalClassrooms')}
          value={classroomCount.data}
          isLoading={classroomCount.isLoading}
          to={can('classrooms') ? '/classrooms' : undefined}
        />
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{t('dashboard.genderSplit')}</p>
            {gender.isLoading ? (
              <Skeleton className="mt-3 h-8 w-full" />
            ) : genderTotal === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('common.noData')}</p>
            ) : (
              <div className="mt-3 space-y-2">
                {/* Two-part composition: one stacked bar with both parts labelled
                    directly, so identity never rests on colour alone. */}
                <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                  <div
                    className="bg-chart-1"
                    style={{ width: `${(gender.male / genderTotal) * 100}%` }}
                  />
                  <div
                    className="bg-chart-2"
                    style={{ width: `${(gender.female / genderTotal) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-chart-1" aria-hidden />
                    {t('gender.male')} {gender.male} ({percentage(gender.male, genderTotal, 0)})
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-chart-2" aria-hidden />
                    {t('gender.female')} {gender.female} ({percentage(gender.female, genderTotal, 0)})
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.studentsByGrade')}</CardTitle>
          </CardHeader>
          <CardContent>
            {grades.isLoading || byGrade.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length === 0 ? (
              <EmptyState title={t('common.noData')} />
            ) : (
              <div className="h-64">
                {/* One series, so no legend: the card title names the measure.
                    Horizontal bars keep grade codes readable at any count. */}
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={56}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Tooltip
                      cursor={{ fill: 'hsl(var(--accent))' }}
                      contentStyle={{
                        borderRadius: 'var(--radius)',
                        border: '1px solid hsl(var(--border))',
                        fontSize: 12,
                      }}
                      formatter={(value: number) => [value, t('dashboard.totalStudents')]}
                      labelFormatter={(name: string) =>
                        chartData.find((entry) => entry.name === name)?.label ?? name
                      }
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill="hsl(var(--chart-1))" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('dashboard.studentsByStatus')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byStatus.isLoading
              ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-6 w-full" />)
              : byStatus.data
                  .filter((entry) => entry.count > 0)
                  .map((entry) => (
                    <div key={entry.status} className="flex items-center justify-between gap-2">
                      <StatusBadge status={entry.status} namespace="studentStatus" />
                      <span className="text-sm font-medium">{entry.count.toLocaleString()}</span>
                    </div>
                  ))}
            {!byStatus.isLoading && byStatus.data.every((entry) => entry.count === 0) && (
              <p className="text-sm text-muted-foreground">{t('common.noData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {can('announcements') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.latestAnnouncements')}</CardTitle>
            </CardHeader>
            <CardContent>
              {announcements.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !announcements.data?.data.length ? (
                <EmptyState icon={Megaphone} title={t('dashboard.noAnnouncements')} />
              ) : (
                <ul className="divide-y divide-border">
                  {announcements.data.data.map((announcement) => (
                    <li key={announcement.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {i18n.language === 'en' && announcement.titleEn
                            ? announcement.titleEn
                            : announcement.titleLo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(announcement.publishedAt ?? announcement.createdAt)}
                        </p>
                      </div>
                      {announcement.priority && announcement.priority !== 'normal' && (
                        <Badge
                          variant={
                            announcement.priority === 'urgent'
                              ? 'danger'
                              : announcement.priority === 'high'
                                ? 'warning'
                                : 'secondary'
                          }
                        >
                          {announcement.priority}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {can('calendar') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dashboard.upcomingEvents')}</CardTitle>
            </CardHeader>
            <CardContent>
              {events.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : upcoming.length === 0 ? (
                <EmptyState icon={CalendarDays} title={t('dashboard.noEvents')} />
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {i18n.language === 'en' && event.titleEn ? event.titleEn : event.titleLo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(event.startDate)}
                          {event.endDate && event.endDate !== event.startDate &&
                            ` — ${formatDate(event.endDate)}`}
                        </p>
                      </div>
                      <Badge variant="outline">{event.type}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: typeof GraduationCap;
  label: string;
  value: number | undefined;
  isLoading: boolean;
  /** Makes the whole card a link to the module's list page. */
  to?: string;
}

function StatCard({ icon: Icon, label, value, isLoading, to }: StatCardProps) {
  const body = (
    <CardContent className="flex items-center gap-4 pt-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLoading ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">{(value ?? 0).toLocaleString()}</p>
        )}
      </div>
    </CardContent>
  );

  if (!to) return <Card>{body}</Card>;

  return (
    <Card className="transition-colors hover:border-primary/40">
      <Link to={to} className="block focus-visible:outline-none">
        {body}
      </Link>
    </Card>
  );
}
