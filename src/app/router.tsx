import { lazy } from 'react';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { NAV_ITEMS } from '@/components/layout/nav-config';
import { ChangePasswordPage } from '@/features/auth/pages/ChangePasswordPage';
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import type { PermissionAction, PermissionResource } from '@/types/enums';
import { NotFoundPage } from './NotFoundPage';
import { PlaceholderPage } from './PlaceholderPage';
import { RequireAnonymous, RequireAuth, RequirePermission } from './guards';

/**
 * Feature pages are code-split: the bundle for the score-entry grid or the
 * locations tree should not be in the critical path of the login screen.
 */
const lazyPage = <T extends Record<string, React.ComponentType>>(
  loader: () => Promise<T>,
  name: keyof T,
) => lazy(() => loader().then((module) => ({ default: module[name] })));

const DashboardPage = lazyPage(
  () => import('@/features/dashboard/pages/DashboardPage'),
  'DashboardPage',
);
const TeachersPage = lazyPage(
  () => import('@/features/teachers/pages/TeachersPage'),
  'TeachersPage',
);
const StudentsPage = lazyPage(
  () => import('@/features/students/pages/StudentsPage'),
  'StudentsPage',
);
const StudentDetailPage = lazyPage(
  () => import('@/features/students/pages/StudentDetailPage'),
  'StudentDetailPage',
);
const GuardiansPage = lazyPage(
  () => import('@/features/guardians/pages/GuardiansPage'),
  'GuardiansPage',
);
const AttendancesPage = lazyPage(
  () => import('@/features/attendances/pages/AttendancesPage'),
  'AttendancesPage',
);
const BehaviorLogsPage = lazyPage(
  () => import('@/features/behavior-logs/pages/BehaviorLogsPage'),
  'BehaviorLogsPage',
);
const ConductDeductionsPage = lazyPage(
  () => import('@/features/conduct-deductions/pages/ConductDeductionsPage'),
  'ConductDeductionsPage',
);
const MonthlyMarksPage = lazyPage(
  () => import('@/features/monthly-marks/pages/MonthlyMarksPage'),
  'MonthlyMarksPage',
);
const EnrollmentsPage = lazyPage(
  () => import('@/features/enrollments/pages/EnrollmentsPage'),
  'EnrollmentsPage',
);
const LocationsPage = lazyPage(
  () => import('@/features/locations/pages/LocationsPage'),
  'LocationsPage',
);
const SchoolYearsPage = lazyPage(
  () => import('@/features/school-years/pages/SchoolYearsPage'),
  'SchoolYearsPage',
);
const SemestersPage = lazyPage(
  () => import('@/features/semesters/pages/SemestersPage'),
  'SemestersPage',
);
const GradeLevelsPage = lazyPage(
  () => import('@/features/grade-levels/pages/GradeLevelsPage'),
  'GradeLevelsPage',
);
const ClassroomsPage = lazyPage(
  () => import('@/features/classrooms/pages/ClassroomsPage'),
  'ClassroomsPage',
);
const SubjectGroupsPage = lazyPage(
  () => import('@/features/subject-groups/pages/SubjectGroupsPage'),
  'SubjectGroupsPage',
);
const SubjectsPage = lazyPage(
  () => import('@/features/subjects/pages/SubjectsPage'),
  'SubjectsPage',
);
const LessonPlansPage = lazyPage(
  () => import('@/features/lesson-plans/pages/LessonPlansPage'),
  'LessonPlansPage',
);
const TeachingAssignmentsPage = lazyPage(
  () => import('@/features/teaching-assignments/pages/TeachingAssignmentsPage'),
  'TeachingAssignmentsPage',
);
const VaccinationsPage = lazyPage(
  () => import('@/features/vaccinations/pages/VaccinationsPage'),
  'VaccinationsPage',
);
const UsersPage = lazyPage(() => import('@/features/users/pages/UsersPage'), 'UsersPage');
const ProfilePage = lazyPage(() => import('@/features/profile/pages/ProfilePage'), 'ProfilePage');

/** Wraps an element in the permission gate for its resource. */
function guarded(
  element: React.ReactNode,
  resource: PermissionResource,
  action: PermissionAction = 'read',
) {
  return <RequirePermission check={{ resource, action }}>{element}</RequirePermission>;
}

/**
 * Routes for nav entries whose page belongs to a later phase.
 *
 * They resolve to an explicit "planned" screen rather than a 404, so the menu
 * stays honest about what exists — and so the permission wiring for each of
 * those resources is already in place when the page lands.
 */
const placeholderRoutes: RouteObject[] = NAV_ITEMS.filter((item) => item.comingSoon).map(
  (item) => ({
    path: item.to.replace(/^\//, ''),
    element: guarded(<PlaceholderPage labelKey={item.labelKey} />, item.resource, item.action),
  }),
);

export const router = createBrowserRouter([
  {
    element: <RequireAnonymous />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      // Outside AppLayout: it uses the auth shell, and is the only page reachable
      // while `mustChangePassword` is set.
      { path: '/change-password', element: <ChangePasswordPage /> },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },

          { path: 'teachers', element: guarded(<TeachersPage />, 'teachers') },

          { path: 'students', element: guarded(<StudentsPage />, 'students') },
          { path: 'students/:id', element: guarded(<StudentDetailPage />, 'students') },

          { path: 'guardians', element: guarded(<GuardiansPage />, 'guardians') },
          { path: 'enrollments', element: guarded(<EnrollmentsPage />, 'enrollments') },
          { path: 'attendances', element: guarded(<AttendancesPage />, 'attendances') },
          { path: 'behavior-logs', element: guarded(<BehaviorLogsPage />, 'behavior-logs') },
          {
            path: 'conduct-deductions',
            element: guarded(<ConductDeductionsPage />, 'conduct-scores'),
          },
          { path: 'scores', element: guarded(<MonthlyMarksPage />, 'scores') },
          { path: 'locations', element: guarded(<LocationsPage />, 'locations') },

          { path: 'school-years', element: guarded(<SchoolYearsPage />, 'school-years') },
          { path: 'semesters', element: guarded(<SemestersPage />, 'semesters') },
          { path: 'grade-levels', element: guarded(<GradeLevelsPage />, 'grade-levels') },
          { path: 'classrooms', element: guarded(<ClassroomsPage />, 'classrooms') },
          { path: 'subject-groups', element: guarded(<SubjectGroupsPage />, 'subject-groups') },
          { path: 'subjects', element: guarded(<SubjectsPage />, 'subjects') },
          { path: 'lesson-plans', element: guarded(<LessonPlansPage />, 'lesson-plans') },
          {
            path: 'teaching-assignments',
            element: guarded(<TeachingAssignmentsPage />, 'teaching-assignments'),
          },

          { path: 'vaccinations', element: guarded(<VaccinationsPage />, 'vaccinations') },

          { path: 'users', element: guarded(<UsersPage />, 'users') },

          { path: 'profile', element: <ProfilePage /> },

          ...placeholderRoutes,

          { path: '404', element: <NotFoundPage /> },
          { path: '*', element: <Navigate to="/404" replace /> },
        ],
      },
    ],
  },
]);
