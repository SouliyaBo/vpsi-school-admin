/**
 * Mirror of `src/common/constants/enums.ts` in the API.
 *
 * Declared as `const` tuples so each one can be used three ways from a single
 * definition: as a TypeScript union, as the option list for a `<Select>`, and as
 * the source for a Zod `z.enum(...)`. If the backend adds a value, `npm run
 * gen:api` will show it in `api-schema.d.ts` and this file is the one place to
 * update.
 */

export const PERSON_TYPES = ['teacher', 'student', 'guardian', 'staff'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Mass organisations a student is enrolled into — `ເຍົາວະຊົນ`,
 * `ເຂົ້າຊາວໜຸ່ມ`, `ເຂົ້າແມ່ຍິງ`.
 *
 * A student holds several at once, and never one derived from their gender: the
 * women's union member count and the female student count are separate figures.
 */
export const STUDENT_ORGANIZATIONS = ['children', 'youth', 'women'] as const;
export type StudentOrganization = (typeof STUDENT_ORGANIZATIONS)[number];

/**
 * School vaccination programme values.
 *
 * `VACCINES` names what is given; which students a round covers is a property of
 * the campaign's eligibility rule, never of the vaccine — so nothing here
 * implies a gender.
 */
export const VACCINES = ['hpv', 'td', 'mr', 'je', 'covid', 'other'] as const;
export type Vaccine = (typeof VACCINES)[number];

/**
 * What happened to one student for one dose.
 *
 * `refused`, `absent` and `contraindicated` are outcomes rather than missing
 * rows: the follow-up list is built from the difference between "not vaccinated"
 * and "never asked".
 */
export const VACCINATION_STATUSES = [
  'scheduled',
  'administered',
  'refused',
  'absent',
  'contraindicated',
] as const;
export type VaccinationStatus = (typeof VACCINATION_STATUSES)[number];

export const CONSENT_STATUSES = ['pending', 'given', 'refused'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const VACCINATION_CAMPAIGN_STATUSES = [
  'planned',
  'active',
  'completed',
  'cancelled',
] as const;
export type VaccinationCampaignStatus = (typeof VACCINATION_CAMPAIGN_STATUSES)[number];

export const STUDENT_STATUSES = [
  'new',
  'active',
  'graduated',
  'no_certificate',
  'transferred',
  'dropped',
  'suspended',
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const TEACHER_STATUSES = ['active', 'on_leave', 'resigned', 'retired'] as const;
export type TeacherStatus = (typeof TEACHER_STATUSES)[number];

export const MARITAL_STATUSES = ['single', 'engaged', 'married', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const HOUSING_TYPES = ['own', 'rented', 'parents', 'relatives', 'other'] as const;
export type HousingType = (typeof HOUSING_TYPES)[number];

export const GUARDIAN_RELATIONSHIPS = [
  'father',
  'mother',
  'grandfather',
  'grandmother',
  'uncle',
  'aunt',
  'sibling',
  'legal_guardian',
  'other',
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const LOCATION_TYPES = ['province', 'district', 'village'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const SEMESTER_STATUSES = ['upcoming', 'active', 'grading', 'closed'] as const;
export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];

export const ENROLLMENT_STATUSES = [
  'active',
  'transferred',
  'promoted',
  'dropped',
  'repeated',
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const SUBJECT_TYPES = ['core', 'elective', 'extracurricular'] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const SCORE_COMPONENT_TYPES = [
  'attendance',
  'homework',
  'quiz',
  'participation',
  'project',
  'midterm',
  'final',
  'other',
] as const;
export type ScoreComponentType = (typeof SCORE_COMPONENT_TYPES)[number];

export const GRADES = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'] as const;
export type Grade = (typeof GRADES)[number];

export const CONDUCT_GRADES = ['excellent', 'very_good', 'good', 'fair', 'poor'] as const;
export type ConductGrade = (typeof CONDUCT_GRADES)[number];

export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused', 'sick'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * What a roll call is allowed to assign.
 *
 * `sick` is retired: a sick day is a leave of absence like any other, and the
 * reason field now carries the detail that the separate status used to. It stays
 * in `ATTENDANCE_STATUSES` because records filed before the change still hold it
 * and must keep reading back correctly.
 */
export const RECORDABLE_ATTENDANCE_STATUSES = [
  'present',
  'absent',
  'late',
  'excused',
] as const satisfies readonly AttendanceStatus[];

export const REPORT_TYPES = [
  'report_card',
  'transcript',
  'guardian_summary',
  'authority_summary',
  'certificate',
  'attendance_summary',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const DOCUMENT_VISIBILITIES = ['staff', 'all', 'teachers', 'guardians'] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITIES)[number];

export const LESSON_PLAN_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'returned',
] as const;
export type LessonPlanStatus = (typeof LESSON_PLAN_STATUSES)[number];

export const EXAM_LEVELS = ['m4', 'm7'] as const;
export type ExamLevel = (typeof EXAM_LEVELS)[number];

export const EXAM_REGISTRATION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'completed',
] as const;
export type ExamRegistrationStatus = (typeof EXAM_REGISTRATION_STATUSES)[number];

export const CERTIFICATE_TYPES = [
  'graduation',
  'completion',
  'achievement',
  'participation',
] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const ANNOUNCEMENT_TARGET_TYPES = [
  'all',
  'role',
  'grade_level',
  'classroom',
  'guardians',
  'teachers',
] as const;
export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

export const ANNOUNCEMENT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];

export const CALENDAR_EVENT_TYPES = [
  'holiday',
  'exam',
  'meeting',
  'activity',
  'deadline',
  'other',
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const FEEDBACK_STATUSES = ['new', 'read', 'resolved', 'archived'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

// ── Authorization ───────────────────────────────────────────────────────────

export const PERMISSION_ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'export',
  'manage',
] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_RESOURCES = [
  'users',
  'roles',
  'teachers',
  'students',
  'guardians',
  'locations',
  'school-years',
  'semesters',
  'grade-levels',
  'classrooms',
  'subject-groups',
  'subjects',
  'teaching-assignments',
  'enrollments',
  'score-components',
  'scores',
  'conduct-scores',
  'behavior-logs',
  'attendances',
  'term-results',
  'reports',
  'lesson-plans',
  'exams',
  'certificates',
  'announcements',
  'notifications',
  'calendar',
  'documents',
  'feedback',
  'audit-logs',
  'settings',
  'vaccinations',
] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];

export const AUDIT_ACTIONS = [
  'create',
  // Health data only: reading one child's vaccination history is itself audited.
  'read',
  'update',
  'delete',
  'login',
  'logout',
  'login_failed',
  'password_change',
  'password_reset',
  'lock',
  'unlock',
  'approve',
  'reject',
  'export',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const LOCALES = ['lo', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
