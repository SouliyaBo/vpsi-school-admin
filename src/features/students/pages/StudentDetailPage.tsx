import {
  ArrowLeft,
  ArrowRightLeft,
  BarChart3,
  CalendarRange,
  CheckSquare,
  ClipboardList,
  FileSignature,
  FileText,
  Languages,
  Pencil,
  School,
  Syringe,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStudentAttendanceSummary } from '@/features/attendances/api';
import { StudyCertificateDialog } from '@/features/certificates/components/StudyCertificateDialog';
import { StudySuspensionDialog } from '@/features/certificates/components/StudySuspensionDialog';
import { StudentMonthlyMarks } from '@/features/monthly-marks/components/StudentMonthlyMarks';
import { StudentVaccinations } from '@/features/vaccinations/components/StudentVaccinations';
import { useCan } from '@/features/auth/hooks';
import { EnglishClassDialog } from '@/features/enrollments/components/EnglishClassDialog';
import { EnrollDialog } from '@/features/enrollments/components/EnrollDialog';
import {
  EnrollmentMoveDialog,
  STATUS_ICONS,
  STATUS_LABEL_KEYS,
  type EnrollmentMove,
} from '@/features/enrollments/components/EnrollmentMoveDialog';
import { ALLOWED_TRANSITIONS, useEnrollmentHistory } from '@/features/enrollments/api';
import { useActiveSemester } from '@/features/semesters/api';
import { useMediaQuery } from '@/hooks/use-media-query';
import { locationPath, useLocationIndex } from '@/features/locations/lib/location-index';
import {
  calculateAge,
  formatDate,
  fullName,
  initials,
  localizedName,
  nickname,
  percentage,
  refId,
  refObject,
} from '@/lib/utils';
import type {
  Classroom,
  Enrollment,
  GradeLevel,
  Location,
  SchoolYear,
  Sibling,
  Student,
} from '@/types/entities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FileUpload } from '@/components/common/FileUpload';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { toTenPoint } from '@/features/term-results/api';
import { GuardianLinksDialog } from '../components/GuardianLinksDialog';
import { StudentFormDialog } from '../components/StudentFormDialog';
import { students, useStudentSiblings, useStudentTermResult, useUploadStudentPhoto } from '../api';

/**
 * The tab strip's two shapes: a 4-wide grid of icon-over-label tiles on a
 * phone, so all seven are on screen; the ordinary one-line strip from `sm` up.
 */
const tabListClass =
  'grid h-auto w-full grid-cols-4 gap-1 sm:inline-flex sm:h-9 sm:w-auto sm:grid-cols-none';
const tabClass =
  'h-full flex-col gap-1 whitespace-normal px-1 py-2 text-xs leading-tight sm:h-auto sm:flex-row sm:gap-1.5 sm:whitespace-nowrap sm:px-3 sm:py-1 sm:text-sm';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();

  /**
   * The open tab.
   *
   * Tracked rather than left to `defaultValue` because every read of a child's
   * vaccination record is audited server-side: fetching it eagerly would leave a
   * trail of lookups nobody performed.
   */
  const [tab, setTab] = useState('overview');
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [suspensionOpen, setSuspensionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [guardiansOpen, setGuardiansOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [move, setMove] = useState<EnrollmentMove | null>(null);
  const [englishClassTarget, setEnglishClassTarget] = useState<Enrollment | null>(null);

  const detail = students.useDetail(id);
  const siblings = useStudentSiblings(id);
  // Cached tree, shared with the address pickers — the birthplace is shown as a
  // full path and the populated node carries only ancestor ids.
  const locationIndex = useLocationIndex();
  const remove = students.useDelete();
  const uploadPhoto = useUploadStudentPhoto(id);
  // Placement lives in `enrollments`, so the class a student sits in — and every
  // class they have sat in — comes from its own endpoint. Skipped entirely for a
  // role without `enrollments:read`, which would only 403.
  const canReadEnrollments = can('enrollments');
  const canReadVaccinations = can('vaccinations');
  // ຄະແນນປະຈຳເດືອນ is filed under `scores`, like the mark sheets themselves.
  const canReadScores = can('scores');
  const history = useEnrollmentHistory(canReadEnrollments ? id : undefined);

  // Both summaries are per-semester; without an active semester there is nothing
  // meaningful to show, and the panels say so rather than erroring.
  const activeSemester = useActiveSemester();
  const semesterId = activeSemester.data?.id;
  const termResult = useStudentTermResult(id, semesterId);
  const attendance = useStudentAttendanceSummary(id, semesterId);
  const phone = useMediaQuery('(max-width: 639px)');

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.error || !detail.data) {
    return <ErrorState error={detail.error} onRetry={detail.refetch} />;
  }

  const student = detail.data;
  const village = refObject<Location>(student.villageId);
  // The birthplace may be a province, a district or a village, so it is shown as
  // the full path — the node's own name would not say which.
  const birthPlace = locationPath(locationIndex, refId(student.birthLocationId), i18n.language);
  const currentPlacement = history.data?.find((enrollment) => enrollment.status === 'active');

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ms-2">
        <Link to="/students">
          <ArrowLeft />
          {t('student.title')}
        </Link>
      </Button>

      <PageHeader
        title={displayName(student, i18n.language)}
        description={student.studentCode}
        actions={
          <>
            {can('certificates', 'create') && (
              <>
                <Button variant="outline" onClick={() => setCertificateOpen(true)}>
                  <FileText />
                  {t('certificate.studyVerification')}
                </Button>
                <Button variant="outline" onClick={() => setSuspensionOpen(true)}>
                  <FileSignature />
                  {t('certificate.studySuspension')}
                </Button>
              </>
            )}
            {!currentPlacement && !history.isLoading && can('enrollments', 'create') && (
              <Button onClick={() => setEnrollOpen(true)}>
                <School />
                {t('enrollment.enroll')}
              </Button>
            )}
            {/* A placed student is moved, not re-enrolled: the transfer frees the
                seat in the old room and takes one in the new, which a second
                placement would not. Offered here as well as on the class roster
                because the office usually has one child in front of them, not a
                class. */}
            {currentPlacement && can('enrollments', 'update') && (
              <Button
                variant="outline"
                onClick={() => setMove({ enrollment: currentPlacement, status: 'transferred' })}
              >
                <ArrowRightLeft />
                {t('enrollment.transfer')}
              </Button>
            )}
            {can('students', 'update') && (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil />
                {t('common.edit')}
              </Button>
            )}
            {can('students', 'delete') && (
              <Button variant="outline" className="text-danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 />
                {t('common.delete')}
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-start gap-5 pt-5">
          <Avatar className="size-24 rounded-lg">
            {student.photoUrl && <AvatarImage src={student.photoUrl} alt="" />}
            <AvatarFallback className="rounded-lg text-xl">{initials(student)}</AvatarFallback>
          </Avatar>

          <div className="min-w-56 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={student.status} namespace="studentStatus" />
              {currentPlacement ? (
                <>
                  <Badge variant="default">
                    {refObject<Classroom>(currentPlacement.classroomId)?.name ??
                      t('enrollment.classroom')}
                    {currentPlacement.rollNumber != null &&
                      ` · ${t('enrollment.rollNumber')} ${currentPlacement.rollNumber}`}
                  </Badge>
                  {/* Shown next to the homeroom because the two are read
                      together — "which room, and which English room" — but kept
                      a separate badge so nobody reads it as a sub-class of the
                      homeroom. Absent when unset rather than shown empty. */}
                  {currentPlacement.englishClass && (
                    <Badge variant="secondary">
                      {t('enrollment.englishClass')}: {currentPlacement.englishClass}
                    </Badge>
                  )}
                </>
              ) : (
                !history.isLoading && <Badge variant="warning">{t('enrollment.noClassroom')}</Badge>
              )}
              <Badge variant="outline">{t(`gender.${student.gender}`)}</Badge>
              {calculateAge(student.dateOfBirth) !== null && (
                <Badge variant="secondary">
                  {calculateAge(student.dateOfBirth)} {t('person.age')}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {t('student.admissionDate')}: {formatDate(student.admissionDate)}
            </p>
            {student.status === 'suspended' && (
              <p className="text-sm text-muted-foreground">
                {t('student.suspendedAt')}: {formatDate(student.suspendedAt)}
                {' · '}
                {t('student.statusBeforeSuspension')}:{' '}
                {t(
                  `student.suspendedFrom.${student.statusBeforeSuspension === 'no_certificate' ? 'no_certificate' : 'active'}`,
                )}
              </p>
            )}
            {village && (
              <p className="text-sm text-muted-foreground">
                {t('person.village')}: {localizedName(village, i18n.language)}
              </p>
            )}
          </div>

          {/* The drop zone repeats the avatar beside it and, on a phone, took
              more of the screen than the student's own details — there it is a
              single ປ່ຽນຮູບ button instead. */}
          {can('students', 'update') && (
            <FileUpload
              className={phone ? 'w-full' : 'w-72'}
              compact={phone}
              label={phone ? t('person.changePhoto') : t('person.photo')}
              currentUrl={student.photoUrl}
              onUpload={(file, onProgress) => uploadPhoto.mutateAsync({ file, onProgress })}
              onUploaded={() => void detail.refetch()}
            />
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Seven tabs are wider than a phone. A strip that scrolled sideways hid
            the last four, and nothing told a parent they were there — so on a
            phone the tabs wrap into a grid, icon over label, every one in view
            at once. From `sm` up it is the usual one-line strip, scrolling on
            a tablet where it still does not quite fit. */}
        <div className="scrollbar-thin sm:overflow-x-auto">
          <TabsList className={tabListClass}>
            <TabsTrigger value="overview" className={tabClass}>
              <ClipboardList />
              {t('common.details')}
            </TabsTrigger>
            <TabsTrigger value="guardians" className={tabClass}>
              <Users />
              {t('student.guardians')}
            </TabsTrigger>
            {canReadEnrollments && (
              <TabsTrigger value="enrollment" className={tabClass}>
                <School />
                {t('enrollment.history')}
              </TabsTrigger>
            )}
            <TabsTrigger value="academic" className={tabClass}>
              <BarChart3 />
              {t('student.academicSummary')}
            </TabsTrigger>
            {canReadScores && (
              <TabsTrigger value="monthlyMarks" className={tabClass}>
                <CalendarRange />
                {t('monthlyMark.studentTab')}
              </TabsTrigger>
            )}
            <TabsTrigger value="attendance" className={tabClass}>
              <CheckSquare />
              {t('student.attendanceSummary')}
            </TabsTrigger>
            {canReadVaccinations && (
              <TabsTrigger value="vaccination" className={tabClass}>
                <Syringe />
                {t('vaccination.tab')}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-6 pt-5 lg:grid-cols-2">
              <DetailSection title={t('person.basicInfo')}>
                <DetailRow label={t('student.studentCode')}>{student.studentCode}</DetailRow>
                <DetailRow label={t('person.title')}>{student.title ?? '—'}</DetailRow>
                <DetailRow label={t('person.fullName')}>
                  {fullName(student, i18n.language)}
                </DetailRow>
                <DetailRow label={t('person.nickname')}>
                  {nickname(student, i18n.language) ?? '—'}
                </DetailRow>
                <DetailRow label={t('person.gender')}>{t(`gender.${student.gender}`)}</DetailRow>
                <DetailRow label={t('studentOrganization.label')}>
                  {student.organizations?.length
                    ? student.organizations
                        .map(
                          (membership) =>
                            `${t(`studentOrganization.${membership.organization}`)} (${formatDate(membership.joinedDate)})`,
                        )
                        .join(', ')
                    : t('studentOrganization.none')}
                </DetailRow>
                <DetailRow label={t('person.dateOfBirth')}>
                  {formatDate(student.dateOfBirth)}
                </DetailRow>
                <DetailRow label={t('student.placeOfBirth')}>
                  {[birthPlace, student.birthAddressDetail].filter(Boolean).join(' — ') || '—'}
                </DetailRow>
                <DetailRow label={t('student.nationality')}>{student.nationality ?? '—'}</DetailRow>
                <DetailRow label={t('student.ethnicity')}>{student.ethnicity ?? '—'}</DetailRow>
                <DetailRow label={t('person.nationalId')}>{student.nationalId ?? '—'}</DetailRow>
                {/* Read off the active placement, not the student: the room is
                    re-made every school year. Hidden for a child with no
                    placement, where the question has no answer yet. */}
                {currentPlacement && (
                  <DetailRow label={t('enrollment.englishClass')}>
                    {currentPlacement.englishClass || '—'}
                  </DetailRow>
                )}
              </DetailSection>

              <div className="space-y-6">
                <DetailSection title={t('person.contactInfo')}>
                  <DetailRow label={t('person.phone')}>{student.phone ?? '—'}</DetailRow>
                  <DetailRow label={t('student.contactPhone')}>
                    {student.contactPhone
                      ? `${student.contactPhone}${student.contactName ? ` (${student.contactName})` : ''}`
                      : '—'}
                  </DetailRow>
                  <DetailRow label={t('person.village')}>
                    {village ? localizedName(village, i18n.language) : '—'}
                  </DetailRow>
                  <DetailRow label={t('person.addressDetail')}>
                    {student.addressDetail ?? '—'}
                  </DetailRow>
                </DetailSection>

                <DetailSection title={t('student.notes')}>
                  <DetailRow label={t('student.notes')}>{student.notes ?? '—'}</DetailRow>
                  <DetailRow label={t('common.createdAt')}>
                    {formatDate(student.createdAt)}
                  </DetailRow>
                  <DetailRow label={t('common.updatedAt')}>
                    {formatDate(student.updatedAt)}
                  </DetailRow>
                </DetailSection>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="guardians">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{t('student.guardians')}</CardTitle>
              {can('students', 'update') && (
                <Button variant="outline" size="sm" onClick={() => setGuardiansOpen(true)}>
                  <Pencil />
                  {t('common.edit')}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {student.guardians.length === 0 ? (
                <EmptyState icon={Users} title={t('student.atLeastOneGuardian')} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('person.fullName')}</TableHead>
                      <TableHead>{t('student.relationship')}</TableHead>
                      <TableHead>{t('person.phone')}</TableHead>
                      <TableHead>{t('student.isPrimary')}</TableHead>
                      <TableHead>{t('student.canViewRecords')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.guardians.map((link) => (
                      <TableRow key={refId(link.guardianId) ?? link.fullNameLo}>
                        <TableCell className="font-medium">
                          {refId(link.guardianId) ? (
                            <Link
                              to={`/guardians?search=${encodeURIComponent(link.fullNameLo)}`}
                              className="hover:underline"
                            >
                              {link.fullNameLo}
                            </Link>
                          ) : (
                            link.fullNameLo
                          )}
                        </TableCell>
                        <TableCell>{t(`relationship.${link.relationship}`)}</TableCell>
                        <TableCell>{link.phone}</TableCell>
                        <TableCell>
                          {link.isPrimary && (
                            <Badge variant="success">{t('student.isPrimary')}</Badge>
                          )}
                          {link.isEmergencyContact && (
                            <Badge variant="info" className="ms-1">
                              {t('student.isEmergencyContact')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={link.canViewRecords ? 'success' : 'secondary'}>
                            {link.canViewRecords ? t('common.yes') : t('common.no')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">{t('student.siblings')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('student.siblingsHint')}</p>
            </CardHeader>
            <CardContent>
              {siblings.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : !siblings.data?.length ? (
                <EmptyState icon={Users} title={t('student.noSiblings')} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('person.fullName')}</TableHead>
                      <TableHead>{t('student.studentCode')}</TableHead>
                      <TableHead>{t('enrollment.classroom')}</TableHead>
                      <TableHead>{t('student.sharedGuardian')}</TableHead>
                      <TableHead>{t('person.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siblings.data.map((sibling) => (
                      <TableRow key={sibling.id}>
                        <TableCell className="font-medium">
                          <Link to={`/students/${sibling.id}`} className="hover:underline">
                            {displayName(sibling, i18n.language)}
                          </Link>
                        </TableCell>
                        <TableCell>{sibling.studentCode}</TableCell>
                        <TableCell>{classOf(sibling)}</TableCell>
                        {/* Why these two are siblings at all — without it the row
                            is an assertion the reader cannot check. */}
                        <TableCell>
                          {sibling.sharedGuardians
                            .map(
                              (shared) =>
                                `${shared.fullNameLo} (${t(`relationship.${shared.relationship}`)})`,
                            )
                            .join(', ')}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={sibling.status} namespace="studentStatus" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollment">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('enrollment.history')}</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !history.data?.length ? (
                <EmptyState icon={School} title={t('enrollment.noHistory')} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('semester.schoolYear')}</TableHead>
                      <TableHead>{t('gradeLevel.title')}</TableHead>
                      <TableHead>{t('enrollment.classroom')}</TableHead>
                      <TableHead>{t('enrollment.englishClass')}</TableHead>
                      <TableHead className="text-end">{t('enrollment.rollNumber')}</TableHead>
                      <TableHead>{t('enrollment.enrolledAt')}</TableHead>
                      <TableHead>{t('person.status')}</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.data.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>
                          {localizedName(
                            refObject<SchoolYear>(enrollment.schoolYearId),
                            i18n.language,
                          )}
                        </TableCell>
                        <TableCell>
                          {refObject<GradeLevel>(enrollment.gradeLevelId)?.code ?? '—'}
                        </TableCell>
                        <TableCell className="font-medium">
                          {refObject<Classroom>(enrollment.classroomId)?.name ?? '—'}
                        </TableCell>
                        <TableCell>{enrollment.englishClass || '—'}</TableCell>
                        <TableCell className="text-end">{enrollment.rollNumber ?? '—'}</TableCell>
                        <TableCell>{formatDate(enrollment.enrolledAt)}</TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <StatusBadge status={enrollment.status} namespace="enrollmentStatus" />
                            {enrollment.statusReason && (
                              <p className="text-xs text-muted-foreground">
                                {enrollment.statusReason}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-end">
                          {/* The same moves the class roster offers. Which ones
                              apply depends on where the row already is —
                              `transferred` and `promoted` are terminal, a
                              `dropped` child can only come back. */}
                          <RowActions
                            actions={[
                              {
                                label: t('enrollment.englishClassEdit'),
                                icon: Languages,
                                hidden: !can('enrollments', 'update'),
                                onSelect: () => setEnglishClassTarget(enrollment),
                              },
                              ...ALLOWED_TRANSITIONS[enrollment.status].map((status) => ({
                                label: t(STATUS_LABEL_KEYS[status]),
                                icon: STATUS_ICONS[status],
                                destructive: status === 'dropped',
                                hidden: !can('enrollments', 'update'),
                                onSelect: () => setMove({ enrollment, status }),
                              })),
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="academic">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t('student.academicSummary')}
                {activeSemester.data && (
                  <span className="ms-2 text-sm font-normal text-muted-foreground">
                    {localizedName(activeSemester.data, i18n.language)}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!semesterId ? (
                <EmptyState icon={BarChart3} title={t('dashboard.noActiveYear')} />
              ) : termResult.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !termResult.data ? (
                <EmptyState icon={BarChart3} title={t('common.noData')} />
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatTile label="GPA" value={termResult.data.gpa?.toFixed(2) ?? '—'} />
                    {/* The API stores marks as percentages so a class can be
                        ranked; this school marks out of 10, and a card that says
                        66.0 beside a sheet that says 6.60 reads as two different
                        terms. Same division as the result sheets — `toTenPoint`. */}
                    <StatTile
                      label={t('termResult.average')}
                      value={toTenPoint(termResult.data.average)?.toFixed(2) ?? '—'}
                    />
                    <StatTile label={t('termResult.grade')} value={termResult.data.grade ?? '—'} />
                    <StatTile
                      label={t('termResult.rank')}
                      value={
                        termResult.data.rank
                          ? `${termResult.data.rank}/${termResult.data.totalStudents ?? '—'}`
                          : '—'
                      }
                    />
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('subject.title')}</TableHead>
                        <TableHead className="text-end">{t('subject.credits')}</TableHead>
                        <TableHead className="text-end">{t('termResult.termMark')}</TableHead>
                        <TableHead>{t('termResult.grade')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {termResult.data.subjects?.map((subject) => (
                        <TableRow key={subject.subjectId}>
                          <TableCell className="font-medium">{subject.subjectNameLo}</TableCell>
                          <TableCell className="text-end">{subject.credits}</TableCell>
                          <TableCell className="text-end tabular-nums">
                            {toTenPoint(subject.percentage)?.toFixed(2) ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={subject.isPassed ? 'success' : 'danger'}>
                              {subject.grade}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canReadScores && (
          <TabsContent value="monthlyMarks">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('monthlyMark.studentTab')}</CardTitle>
              </CardHeader>
              <CardContent>
                {/* Held back until the tab is open: the read costs the whole
                    class's marks, because ລຳດັບ cannot be worked out from one
                    student's row alone. */}
                <StudentMonthlyMarks
                  studentId={id}
                  studentName={fullName(student, i18n.language)}
                  enabled={tab === 'monthlyMarks'}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('student.attendanceSummary')}</CardTitle>
            </CardHeader>
            <CardContent>
              {!semesterId ? (
                <EmptyState icon={CheckSquare} title={t('dashboard.noActiveYear')} />
              ) : attendance.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !attendance.data ? (
                <EmptyState icon={CheckSquare} title={t('common.noData')} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatTile
                    label={t('dashboard.presentRate')}
                    value={percentage(
                      attendance.data.present,
                      attendance.data.totalRecorded || 1,
                      0,
                    )}
                    tone="success"
                  />
                  <StatTile label={t('attendanceStatus.present')} value={attendance.data.present} />
                  <StatTile
                    label={t('attendanceStatus.late')}
                    value={attendance.data.late}
                    tone="warning"
                  />
                  {/* ວັນຂາດ as the office reads them: three lates are a day
                      absent without a reason, and a sick day is a leave. */}
                  <StatTile
                    label={t('attendance.absentUnexcused')}
                    value={attendance.data.absentUnexcused}
                    tone="danger"
                  />
                  <StatTile
                    label={t('attendance.absentExcused')}
                    value={attendance.data.absentExcused}
                  />
                  <StatTile
                    label={t('attendance.absentTotal')}
                    value={attendance.data.absentTotal}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canReadVaccinations && (
          <TabsContent value="vaccination">
            <Card>
              <CardContent className="pt-5">
                <StudentVaccinations studentId={id} enabled={tab === 'vaccination'} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <StudentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
        // `GET /students/:id` does not carry the placement, so the form is given
        // the active enrollment this page already loaded for the history table.
        placement={
          currentPlacement
            ? {
                enrollmentId: currentPlacement.id,
                englishClass: currentPlacement.englishClass ?? null,
              }
            : null
        }
      />

      <StudyCertificateDialog
        student={certificateOpen ? student : null}
        onClose={() => setCertificateOpen(false)}
      />

      <StudySuspensionDialog
        student={suspensionOpen ? student : null}
        onClose={() => setSuspensionOpen(false)}
      />

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        student={student}
        onEnrolled={() => void history.refetch()}
      />

      <EnrollmentMoveDialog
        move={move}
        onClose={() => setMove(null)}
        fromLabel={move ? refObject<Classroom>(move.enrollment.classroomId)?.name : undefined}
      />

      <EnglishClassDialog
        enrollment={englishClassTarget}
        onClose={() => setEnglishClassTarget(null)}
      />

      <GuardianLinksDialog
        open={guardiansOpen}
        onOpenChange={setGuardiansOpen}
        student={student}
        onSaved={() => void detail.refetch()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('common.delete')}
        description={t('student.deleteConfirm', { name: fullName(student, i18n.language) })}
        isPending={remove.isPending}
        onConfirm={() => {
          void remove.mutateAsync(student.id).then(() => navigate('/students', { replace: true }));
        }}
      />
    </div>
  );
}

/**
 * `ຈຸທາລັດ ສີຫາປັນຍາ (ລິຕ້າ)` — the register name with the nickname alongside.
 *
 * Staff know a child by the nickname first, so the heading carries both; the
 * title stays out of it, since a page heading is not the register.
 */
function displayName(student: Student, locale: string): string {
  const called = nickname(student, locale);
  return called ? `${fullName(student, locale)} (${called})` : fullName(student, locale);
}

/** `m4 A`, or an em dash for a sibling not placed in the active year. */
function classOf(sibling: Sibling): string {
  const placement = sibling.currentEnrollment;
  if (!placement) return '—';
  return [placement.gradeLevelCode, placement.classroomName].filter(Boolean).join(' ') || '—';
}

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}
