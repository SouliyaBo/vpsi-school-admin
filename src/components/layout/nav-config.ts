import {
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  Boxes,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  FileBadge,
  FileStack,
  FileText,
  GraduationCap,
  Home,
  Layers,
  MapPin,
  MessageSquare,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  Syringe,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import type { PermissionAction, PermissionResource } from '@/types/enums';

/**
 * The sidebar, and the source of truth for which route needs which permission.
 *
 * `resource`/`action` are read twice: to filter the menu, and by the router to
 * wrap each route in `RequirePermission`. Keeping both from one table is what
 * stops a nav entry and its route guard from drifting apart.
 */

export interface NavItem {
  /** i18n key under `nav.`. */
  labelKey: string;
  to: string;
  icon: LucideIcon;
  resource: PermissionResource;
  action?: PermissionAction;
  /** Marks a page that is planned but not built yet. */
  comingSoon?: boolean;
}

export interface NavGroup {
  /** i18n key under `nav.`; omitted for the standalone dashboard entry. */
  labelKey?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      // The dashboard is reachable by anyone signed in; `notifications` is
      // granted to every role, so it is the cheapest always-true check.
      { labelKey: 'dashboard', to: '/', icon: Home, resource: 'notifications' },
    ],
  },
  {
    labelKey: 'people',
    items: [
      { labelKey: 'teachers', to: '/teachers', icon: UsersRound, resource: 'teachers' },
      { labelKey: 'students', to: '/students', icon: GraduationCap, resource: 'students' },
      { labelKey: 'guardians', to: '/guardians', icon: Users, resource: 'guardians' },
      { labelKey: 'locations', to: '/locations', icon: MapPin, resource: 'locations' },
    ],
  },
  {
    labelKey: 'academic',
    items: [
      { labelKey: 'schoolYears', to: '/school-years', icon: CalendarRange, resource: 'school-years' },
      { labelKey: 'semesters', to: '/semesters', icon: CalendarDays, resource: 'semesters' },
      { labelKey: 'gradeLevels', to: '/grade-levels', icon: Layers, resource: 'grade-levels' },
      { labelKey: 'classrooms', to: '/classrooms', icon: School, resource: 'classrooms' },
      {
        labelKey: 'subjectGroups',
        to: '/subject-groups',
        icon: Boxes,
        resource: 'subject-groups',
      },
      { labelKey: 'subjects', to: '/subjects', icon: BookOpen, resource: 'subjects' },
      {
        labelKey: 'teachingAssignments',
        to: '/teaching-assignments',
        icon: ClipboardList,
        resource: 'teaching-assignments',
      },
    ],
  },
  {
    labelKey: 'operations',
    items: [
      { labelKey: 'enrollments', to: '/enrollments', icon: Building2, resource: 'enrollments' },
      { labelKey: 'scores', to: '/scores', icon: BarChart3, resource: 'scores', comingSoon: true },
      { labelKey: 'attendances', to: '/attendances', icon: CheckSquare, resource: 'attendances' },
      {
        labelKey: 'behaviorLogs',
        to: '/behavior-logs',
        icon: ClipboardCheck,
        resource: 'behavior-logs',
      },
      { labelKey: 'termResults', to: '/term-results', icon: FileBadge, resource: 'term-results', comingSoon: true },
      { labelKey: 'reports', to: '/reports', icon: FileText, resource: 'reports', comingSoon: true },
      { labelKey: 'lessonPlans', to: '/lesson-plans', icon: BookMarked, resource: 'lesson-plans' },
      { labelKey: 'exams', to: '/exams', icon: ScrollText, resource: 'exams', comingSoon: true },
      { labelKey: 'certificates', to: '/certificates', icon: Award, resource: 'certificates', comingSoon: true },
      { labelKey: 'vaccinations', to: '/vaccinations', icon: Syringe, resource: 'vaccinations' },
    ],
  },
  {
    labelKey: 'communication',
    items: [
      { labelKey: 'announcements', to: '/announcements', icon: MessageSquare, resource: 'announcements', comingSoon: true },
      { labelKey: 'calendar', to: '/calendar', icon: CalendarDays, resource: 'calendar', comingSoon: true },
      { labelKey: 'documents', to: '/documents', icon: FileStack, resource: 'documents', comingSoon: true },
      { labelKey: 'feedback', to: '/feedback', icon: MessageSquare, resource: 'feedback', comingSoon: true },
    ],
  },
  {
    labelKey: 'system',
    items: [
      { labelKey: 'users', to: '/users', icon: UserCog, resource: 'users' },
      { labelKey: 'roles', to: '/roles', icon: ShieldCheck, resource: 'roles', comingSoon: true },
      { labelKey: 'auditLogs', to: '/audit-logs', icon: ScrollText, resource: 'audit-logs', comingSoon: true },
      { labelKey: 'settings', to: '/settings', icon: Settings, resource: 'settings', comingSoon: true },
    ],
  },
];

/** Flat lookup used for breadcrumbs and the document title. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavItem | undefined {
  // Longest match first, so /students/:id resolves to the /students entry
  // rather than to /.
  return [...NAV_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)));
}
