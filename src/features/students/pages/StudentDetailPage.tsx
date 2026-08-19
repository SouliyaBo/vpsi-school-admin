import { ArrowLeft, BarChart3, CheckSquare, Pencil, School, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStudentAttendanceSummary } from '@/features/attendances/api';
import { useCan } from '@/features/auth/hooks';
import { EnrollDialog } from '@/features/enrollments/components/EnrollDialog';
import { useEnrollmentHistory } from '@/features/enrollments/api';
import { useActiveSemester } from '@/features/semesters/api';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FileUpload } from '@/components/common/FileUpload';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusBadge } from '@/components/common/StatusBadge';
import { GuardianLinksDialog } from '../components/GuardianLinksDialog';
import { StudentFormDialog } from '../components/StudentFormDialog';
import {
  students,
  useStudentSiblings,
  useStudentTermResult,
  useUploadStudentPhoto,
} from '../api';

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();

  const [editOpen, setEditOpen] = useState(false);
  const [guardiansOpen, setGuardiansOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const detail = students.useDetail(id);
  const siblings = useStudentSiblings(id);
  const remove = students.useDelete();
  const uploadPhoto = useUploadStudentPhoto(id);
  // Placement lives in `enrollments`, so the class a student sits in — and every
  // class they have sat in — comes from its own endpoint. Skipped entirely for a
  // role without `enrollments:read`, which would only 403.
  const canReadEnrollments = can('enrollments');
  const history = useEnrollmentHistory(canReadEnrollments ? id : undefined);

  // Both summaries are per-semester; without an active semester there is nothing
  // meaningful to show, and the panels say so rather than erroring.
  const activeSemester = useActiveSemester();
  const semesterId = activeSemester.data?.id;
  const termResult = useStudentTermResult(id, semesterId);
  const attendance = useStudentAttendanceSummary(id, semesterId);

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
            {!currentPlacement && !history.isLoading && can('enrollments', 'create') && (
              <Button onClick={() => setEnrollOpen(true)}>
                <School />
                {t('enrollment.enroll')}
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
                <Badge variant="default">
                  {refObject<Classroom>(currentPlacement.classroomId)?.name ??
                    t('enrollment.classroom')}
                  {currentPlacement.rollNumber != null &&
                    ` · ${t('enrollment.rollNumber')} ${currentPlacement.rollNumber}`}
                </Badge>
              ) : (
                !history.isLoading && (
                  <Badge variant="warning">{t('enrollment.noClassroom')}</Badge>
                )
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
            {village && (
              <p className="text-sm text-muted-foreground">
                {t('person.village')}: {localizedName(village, i18n.language)}
              </p>
            )}
          </div>

          {can('students', 'update') && (
            <FileUpload
              className="w-full sm:w-72"
              label={t('person.photo')}
              currentUrl={student.photoUrl}
              onUpload={(file, onProgress) => uploadPhoto.mutateAsync({ file, onProgress })}
              onUploaded={() => void detail.refetch()}
            />
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t('common.details')}</TabsTrigger>
          <TabsTrigger value="guardians">
            <Users />
            {t('student.guardians')}
          </TabsTrigger>
          {canReadEnrollments && (
            <TabsTrigger value="enrollment">
              <School />
              {t('enrollment.history')}
            </TabsTrigger>
          )}
          <TabsTrigger value="academic">
            <BarChart3 />
            {t('student.academicSummary')}
          </TabsTrigger>
          <TabsTrigger value="attendance">
            <CheckSquare />
            {t('student.attendanceSummary')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardContent className="grid gap-6 pt-5 lg:grid-cols-2">
              <DetailSection title={t('person.basicInfo')}>
                <DetailRow label={t('student.studentCode')}>{student.studentCode}</DetailRow>
                <DetailRow label={t('person.title')}>{student.title ?? '—'}</DetailRow>
                <DetailRow label={t('person.fullName')}>{fullName(student, i18n.language)}</DetailRow>
                <DetailRow label={t('person.nickname')}>
                  {nickname(student, i18n.language) ?? '—'}
                </DetailRow>
                <DetailRow label={t('person.gender')}>{t(`gender.${student.gender}`)}</DetailRow>
                <DetailRow label={t('person.dateOfBirth')}>{formatDate(student.dateOfBirth)}</DetailRow>
                <DetailRow label={t('student.placeOfBirth')}>{student.placeOfBirth ?? '—'}</DetailRow>
                <DetailRow label={t('student.nationality')}>{student.nationality ?? '—'}</DetailRow>
                <DetailRow label={t('student.ethnicity')}>{student.ethnicity ?? '—'}</DetailRow>
                <DetailRow label={t('person.nationalId')}>{student.nationalId ?? '—'}</DetailRow>
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
                  <DetailRow label={t('person.addressDetail')}>{student.addressDetail ?? '—'}</DetailRow>
                </DetailSection>

                <DetailSection title={t('student.notes')}>
                  <DetailRow label={t('student.notes')}>{student.notes ?? '—'}</DetailRow>
                  <DetailRow label={t('common.createdAt')}>{formatDate(student.createdAt)}</DetailRow>
                  <DetailRow label={t('common.updatedAt')}>{formatDate(student.updatedAt)}</DetailRow>
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
                          {link.isPrimary && <Badge variant="success">{t('student.isPrimary')}</Badge>}
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
                      <TableHead className="text-end">{t('enrollment.rollNumber')}</TableHead>
                      <TableHead>{t('enrollment.enrolledAt')}</TableHead>
                      <TableHead>{t('person.status')}</TableHead>
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
                        <TableCell className="text-end">{enrollment.rollNumber ?? '—'}</TableCell>
                        <TableCell>{formatDate(enrollment.enrolledAt)}</TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <StatusBadge
                              status={enrollment.status}
                              namespace="enrollmentStatus"
                            />
                            {enrollment.statusReason && (
                              <p className="text-xs text-muted-foreground">
                                {enrollment.statusReason}
                              </p>
                            )}
                          </div>
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
                  <div className="grid gap-3 sm:grid-cols-4">
                    <StatTile label="GPA" value={termResult.data.gpa?.toFixed(2) ?? '—'} />
                    <StatTile
                      label={t('common.total')}
                      value={termResult.data.average?.toFixed(1) ?? '—'}
                    />
                    <StatTile label={t('person.status')} value={termResult.data.grade ?? '—'} />
                    <StatTile
                      label="Rank"
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
                        <TableHead className="text-end">%</TableHead>
                        <TableHead>{t('person.status')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {termResult.data.subjects?.map((subject) => (
                        <TableRow key={subject.subjectId}>
                          <TableCell className="font-medium">{subject.subjectNameLo}</TableCell>
                          <TableCell className="text-end">{subject.credits}</TableCell>
                          <TableCell className="text-end">{subject.percentage?.toFixed(1)}</TableCell>
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
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <StatTile
                    label={t('dashboard.presentRate')}
                    value={percentage(attendance.data.present, attendance.data.totalRecorded || 1, 0)}
                    tone="success"
                  />
                  <StatTile label={t('attendanceStatus.present')} value={attendance.data.present} />
                  <StatTile
                    label={t('attendanceStatus.absent')}
                    value={attendance.data.absent}
                    tone="danger"
                  />
                  <StatTile
                    label={t('attendanceStatus.late')}
                    value={attendance.data.late}
                    tone="warning"
                  />
                  <StatTile label={t('attendanceStatus.excused')} value={attendance.data.excused} />
                  <StatTile label={t('attendanceStatus.sick')} value={attendance.data.sick} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentFormDialog open={editOpen} onOpenChange={setEditOpen} student={student} />

      <EnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        student={student}
        onEnrolled={() => void history.refetch()}
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
