import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileSpreadsheet, Loader2, Pencil, Plus, School, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { classroomHeading, classroomsApi, useClassroomOptions } from '@/features/classrooms/api';
import { useEnglishClassOptions } from '@/features/enrollments/api';
import { EnrollDialog } from '@/features/enrollments/components/EnrollDialog';
import { useGradeLevelOptions } from '@/features/grade-levels/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { teachersApi } from '@/features/teachers/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { fetchEveryPage, type ListParams } from '@/lib/crud';
import { saveBlob } from '@/lib/save-blob';
import { notify } from '@/lib/toast';
import { calculateAge, formatDate, fullName, initials, nickname, refId } from '@/lib/utils';
import { GENDERS, STUDENT_STATUSES } from '@/types/enums';
import type { Student, Teacher } from '@/types/entities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { DistrictReportDialog } from '../components/DistrictReportDialog';
import { StudentFormDialog } from '../components/StudentFormDialog';
import { StudentStats } from '../components/StudentStats';
import {
  buildStudentListWorkbook,
  studentListFileName,
  type StudentListRow,
} from '../lib/student-list-workbook';
import { students, studentsApi } from '../api';

/**
 * The "not yet set" choice in the English-room filter.
 *
 * Only ever a value inside the dropdown — it is translated into
 * `englishClassSet=false` before it reaches the URL or the API, so it can never
 * collide with a room the office happens to name.
 */
const UNASSIGNED_ENGLISH_CLASS = '__unassigned__';

/** The ages offered in the filter — ມ.1 to the oldest ມ.7 student, with room to spare. */
const AGE_OPTIONS = Array.from({ length: 10 }, (_, index) => 11 + index);

/** The "younger than" choice at the top of the age filter, below the youngest age offered. */
const YOUNGEST_AGE = AGE_OPTIONS[0];
const UNDER_YOUNGEST_AGE = '__under__';

export function StudentsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const can = useCan();

  // `classroomId` and `gradeLevelId` are resolved by the API through the
  // enrollment collection, so filtering by class does not need a second request.
  const table = useTableQueryState({
    defaultSortBy: 'studentCode',
    defaultSortOrder: 'asc',
    filterKeys: [
      'status',
      'gender',
      'age',
      'ageUnder',
      'gradeLevelId',
      'classroomId',
      'villageId',
      'enrolled',
      'englishClass',
      // Its own key rather than a reserved value on `englishClass`: the labels
      // are free text, so any sentinel could one day be a real room name.
      'englishClassSet',
    ],
  });
  const dialogs = useCrudDialogs<Student>();

  /** Student waiting to be placed in a class, either just created or picked from a row. */
  const [enrollTarget, setEnrollTarget] = useState<Student | null>(null);
  /** Newly created student, held while the "place them now?" prompt is open. */
  const [justCreated, setJustCreated] = useState<Student | null>(null);

  const list = students.useList(table.queryParams);
  /** The list's filters for the headcount — no paging, sorting or age. */
  const statsParams = useMemo(() => {
    const {
      page: _page,
      limit: _limit,
      sortBy: _sortBy,
      sortOrder: _sortOrder,
      ...rest
    } = table.queryParams as Record<string, unknown>;
    const { age: _age, ageUnder: _ageUnder, ...filters } = rest;
    return filters;
  }, [table.queryParams]);
  const remove = students.useDelete();
  const gradeOptions = useGradeLevelOptions();
  const classroomOptions = useClassroomOptions();
  const englishClassOptions = useEnglishClassOptions();
  /** The class the list is narrowed to, if any — it heads the exported file. */
  const classLabel = classroomOptions.data?.find(
    (option) => option.value === table.filters.classroomId,
  )?.label;
  /**
   * The English room the list is narrowed to, for the exported file's subtitle.
   *
   * Taken from the filter rather than the rows: "nobody assigned yet" is a
   * filter with no label on any row, and a file that said `ນັກຮຽນທັງໝົດ` while
   * showing a narrowed list is the kind of sheet that gets acted on wrongly.
   */
  const englishClassLabel = table.filters.englishClass
    ? `${t('enrollment.englishClass')} ${table.filters.englishClass}`
    : table.filters.englishClassSet === 'false'
      ? `${t('enrollment.englishClass')}: ${t('enrollment.englishClassNone')}`
      : undefined;

  /** The age the list is narrowed to, for the exported file's subtitle. */
  const ageLabel = table.filters.ageUnder
    ? `${t('person.age')} ${t('person.ageUnder', { age: table.filters.ageUnder })}`
    : table.filters.age
      ? `${t('person.age')} ${t('person.ageYears', { age: table.filters.age })}`
      : undefined;

  const columns = useMemo<ColumnDef<Student, unknown>[]>(
    () => [
      {
        accessorKey: 'studentCode',
        header: t('student.studentCode'),
        cell: ({ row }) => <span className="font-medium">{row.original.studentCode}</span>,
        meta: { sortKey: 'studentCode' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              {/* Staff recognise a child by their face before their name, so the
                  roster shows the photo where there is one. `photoUrl` is a
                  short-lived signed URL minted per request — the object key
                  never leaves the API — and initials stay as the fallback for
                  the students who have no photo on file yet. */}
              {row.original.photoUrl && (
                <AvatarImage src={row.original.photoUrl} alt="" loading="lazy" />
              )}
              <AvatarFallback>{initials(row.original)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">
                {fullName(row.original, i18n.language)}
                {/* The name staff actually use, kept on the same line so the
                    row height does not grow for it. */}
                {nickname(row.original, i18n.language) && (
                  <span className="ms-1.5 font-normal text-muted-foreground">
                    ({nickname(row.original, i18n.language)})
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t(`gender.${row.original.gender}`)}
                {calculateAge(row.original.dateOfBirth) !== null &&
                  ` · ${calculateAge(row.original.dateOfBirth)} ${t('person.age')}`}
              </p>
            </div>
          </div>
        ),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        id: 'primaryGuardian',
        header: t('student.guardians'),
        // The link is denormalized on the student, so the roster needs no join.
        cell: ({ row }) => {
          const primary =
            row.original.guardians?.find((link) => link.isPrimary) ?? row.original.guardians?.[0];
          if (!primary) return '—';
          return (
            <div className="min-w-0">
              <p className="truncate">{primary.fullNameLo}</p>
              <p className="text-xs text-muted-foreground">
                {t(`relationship.${primary.relationship}`)} · {primary.phone}
              </p>
            </div>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'classroom',
        header: t('enrollment.classroom'),
        // Resolved by the API from the active enrollment for the current school
        // year, so no per-row request is needed.
        cell: ({ row }) => {
          const placement = row.original.currentEnrollment;
          if (!placement) {
            return <Badge variant="warning">{t('enrollment.noClassroom')}</Badge>;
          }
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">
                {placement.gradeLevelCode
                  ? `${placement.gradeLevelCode} ${placement.classroomName}`
                  : placement.classroomName}
              </p>
              {placement.rollNumber != null && (
                <p className="text-xs text-muted-foreground">
                  {t('enrollment.rollNumber')} {placement.rollNumber}
                </p>
              )}
              {/* Under the homeroom rather than in a column of its own: the two
                  are read together, and a separate column would be blank down
                  its whole length until the office has filled the rooms in. */}
              {placement.englishClass && (
                <p className="truncate text-xs text-muted-foreground">
                  {t('enrollment.englishClass')}: {placement.englishClass}
                </p>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: t('person.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} namespace="studentStatus" />,
      },
      {
        accessorKey: 'admissionDate',
        header: t('student.admissionDate'),
        cell: ({ row }) => formatDate(row.original.admissionDate),
        meta: { sortKey: 'admissionDate', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('common.details'),
                icon: Eye,
                onSelect: () => navigate(`/students/${row.original.id}`),
              },
              {
                label: t('enrollment.enroll'),
                icon: School,
                // Moving an already-placed student is a transfer, which belongs on
                // the enrollment screen where the origin class is visible.
                hidden: !can('enrollments', 'create') || Boolean(row.original.currentEnrollment),
                onSelect: () => setEnrollTarget(row.original),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('students', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('students', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs, navigate],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('student.title')}
        description={
          list.data ? `${t('common.total')}: ${list.data.meta.total.toLocaleString()}` : undefined
        }
        actions={
          <>
            {/* Exports what the filters are showing, not the page — the office
                asks for "the list", and a list of twenty is never it. */}
            <ExportButton
              params={table.queryParams}
              classLabel={classLabel}
              englishClassLabel={englishClassLabel}
              ageLabel={ageLabel}
            />
            <DistrictReportDialog />
            {can('students', 'create') && (
              <Button onClick={dialogs.openCreate}>
                <Plus />
                {t('student.create')}
              </Button>
            )}
          </>
        }
      />

      <StudentStats
        params={statsParams}
        selectedAge={table.filters.age ? Number(table.filters.age) : undefined}
        selectedUnder={table.filters.ageUnder ? Number(table.filters.ageUnder) : undefined}
        onPickAge={(pick) =>
          table.patch({
            filters: {
              age: pick && 'age' in pick ? String(pick.age) : '',
              ageUnder: pick && 'under' in pick ? String(pick.under) : '',
            },
          })
        }
      />

      <DataTable
        columns={columns}
        result={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        error={list.error}
        onRetry={list.refetch}
        sortBy={table.sortBy}
        sortOrder={table.sortOrder}
        onSortChange={table.setSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        onRowClick={(row) => navigate(`/students/${row.id}`)}
        getRowId={(row) => row.id}
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <SearchInput
              value={table.search ?? ''}
              onChange={table.setSearch}
              className="w-full sm:w-64"
            />
            {/* The API narrows to the current roll — `active` plus
                `no_certificate`, since declining the certificate does not take a
                child out of a classroom — when no status is given, so the trigger
                shows that rather than "all", and seeing leavers and graduates
                means asking for `all` by name. */}
            <FilterSelect
              value={table.filters.status ?? 'current'}
              onChange={(value) => table.setFilter('status', value)}
              allValue="all"
              allLabel={t('student.everyStatus')}
              options={[
                { value: 'current', label: t('student.currentRoll') },
                ...STUDENT_STATUSES.map((status) => ({
                  value: status,
                  label: t(`studentStatus.${status}`),
                })),
              ]}
              placeholder={t('person.status')}
            />
            <FilterSelect
              value={table.filters.gradeLevelId}
              onChange={(value) => table.setFilter('gradeLevelId', value)}
              options={gradeOptions.data ?? []}
              placeholder={t('gradeLevel.title')}
            />
            <FilterSelect
              value={table.filters.classroomId}
              onChange={(value) => table.setFilter('classroomId', value)}
              options={classroomOptions.data ?? []}
              placeholder={t('classroom.title')}
            />
            {/* Two filter keys behind one control: picking a room sets
                `englishClass`, while "not yet set" sets `englishClassSet=false`.
                Written in one patch so neither can be left over from the other. */}
            <FilterSelect
              value={
                table.filters.englishClassSet === 'false'
                  ? UNASSIGNED_ENGLISH_CLASS
                  : table.filters.englishClass
              }
              onChange={(value) =>
                table.patch({
                  filters: {
                    englishClass: value === UNASSIGNED_ENGLISH_CLASS ? '' : (value ?? ''),
                    englishClassSet: value === UNASSIGNED_ENGLISH_CLASS ? 'false' : '',
                  },
                })
              }
              options={[
                ...(englishClassOptions.data ?? []),
                // Last, and offered even before any room exists: with the column
                // newly added this is the whole school, and "who still needs
                // one" is the question the office actually has.
                { value: UNASSIGNED_ENGLISH_CLASS, label: t('enrollment.englishClassNone') },
              ]}
              placeholder={t('enrollment.englishClass')}
            />
            <FilterSelect
              value={table.filters.gender}
              onChange={(value) => table.setFilter('gender', value)}
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
              placeholder={t('person.gender')}
            />
            {/* Two filter keys behind one control, like the English room: an
                exact age sets `age`, "under 11" sets `ageUnder`. One patch, so
                neither is left over from the other. */}
            <FilterSelect
              value={table.filters.ageUnder ? UNDER_YOUNGEST_AGE : table.filters.age}
              onChange={(value) =>
                table.patch({
                  filters: {
                    age: value === UNDER_YOUNGEST_AGE ? '' : (value ?? ''),
                    ageUnder: value === UNDER_YOUNGEST_AGE ? String(YOUNGEST_AGE) : '',
                  },
                })
              }
              options={[
                {
                  value: UNDER_YOUNGEST_AGE,
                  label: t('person.ageUnder', { age: YOUNGEST_AGE }),
                },
                ...AGE_OPTIONS.map((age) => ({
                  value: String(age),
                  label: t('person.ageYears', { age }),
                })),
              ]}
              placeholder={t('person.age')}
            />
            <FilterSelect
              value={table.filters.enrolled}
              onChange={(value) => table.setFilter('enrolled', value)}
              options={[
                { value: 'false', label: t('enrollment.unassigned') },
                { value: 'true', label: t('enrollment.assigned') },
              ]}
              placeholder={t('enrollment.placement')}
            />
          </TableToolbar>
        }
      />

      <StudentFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        student={dialogs.record}
        // The list rows carry the placement already, so editing from here can
        // write the English room without a second read.
        placement={
          dialogs.record?.currentEnrollment
            ? {
                enrollmentId: dialogs.record.currentEnrollment.enrollmentId,
                englishClass: dialogs.record.currentEnrollment.englishClass ?? null,
              }
            : null
        }
        // A new student has no class yet, and a class is what makes them appear in
        // rosters, score sheets and attendance — so the offer to place them comes
        // straight after saving rather than being left to be discovered.
        // The prompt is the fallback for a student who ended up unplaced —
        // either no classroom was picked, or the placement was rejected.
        onCreated={(created, placed) => {
          if (!placed) setJustCreated(created);
        }}
      />

      <ConfirmDialog
        open={justCreated !== null}
        onOpenChange={(open) => !open && setJustCreated(null)}
        title={t('enrollment.askEnrollTitle')}
        description={
          justCreated
            ? t('enrollment.askEnrollBody', { name: fullName(justCreated, i18n.language) })
            : undefined
        }
        tone="default"
        confirmLabel={t('enrollment.askEnrollNow')}
        cancelLabel={t('enrollment.askEnrollLater')}
        onConfirm={() => {
          setEnrollTarget(justCreated);
          setJustCreated(null);
        }}
      />

      <EnrollDialog
        open={enrollTarget !== null}
        onOpenChange={(open) => !open && setEnrollTarget(null)}
        student={enrollTarget}
        onEnrolled={() => setEnrollTarget(null)}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('student.deleteConfirm', { name: fullName(dialogs.deleteTarget, i18n.language) })
            : undefined
        }
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}

/**
 * ບັນຊີລາຍຊື່ນັກຮຽນ as a workbook the office can print and hand round.
 *
 * Exports what the filters are showing rather than what the page is showing:
 * the office asks for "the ມ.1/ຂ list" or "the whole school", and either of
 * those is more rows than a page holds, so every page of the current query is
 * fetched on the click.
 *
 * The homeroom teacher is not on a student — it belongs to the classroom — so
 * the rooms and the staff are fetched alongside and joined here. Both are read
 * through `refId`, because a classroom's `homeroomTeacherId` is a raw string on
 * the rows the office created through the admin and a populated document on the
 * rest; the id is the one thing both shapes agree on.
 *
 * `exceljs` and these three lists are all fetched at the moment of the click and
 * never with the page — most people who open this screen are looking somebody up.
 */
function ExportButton({
  params,
  classLabel,
  englishClassLabel,
  ageLabel,
}: {
  params: ListParams;
  classLabel?: string;
  englishClassLabel?: string;
  ageLabel?: string;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const activeYear = useActiveSchoolYear();

  async function exportRoster() {
    setBusy(true);
    try {
      const [roster, rooms, staff] = await Promise.all([
        // Paged with the filters, sort and search in force — but not the page
        // the reader happens to be on.
        fetchEveryPage(studentsApi.list, { ...params, page: undefined, limit: undefined }),
        fetchEveryPage(classroomsApi.list),
        fetchEveryPage(teachersApi.list),
      ]);

      const teacherById = new Map(staff.map((teacher) => [teacher.id, teacher]));
      const homeroomByClassroom = new Map(
        rooms.map((room) => [
          room.id,
          fullName(teacherById.get(refId<Teacher>(room.homeroomTeacherId) ?? ''), i18n.language),
        ]),
      );

      const rows = roster.map<StudentListRow>((student) => {
        const placement = student.currentEnrollment;
        return {
          studentCode: student.studentCode,
          status: t(`studentStatus.${student.status}`),
          title: student.title ?? '',
          firstNameLo: student.firstNameLo,
          lastNameLo: student.lastNameLo,
          nickname: student.nickname ?? '',
          nameEn: [student.firstNameEn, student.lastNameEn].filter(Boolean).join(' '),
          nicknameEn: student.nicknameEn ?? '',
          classroom: placement
            ? classroomHeading({
                name: placement.classroomName,
                gradeLevelCode: placement.gradeLevelCode,
              })
            : t('enrollment.noClassroom'),
          // A class with nobody assigned, and a child with no class at all, both
          // print blank rather than a dash the office would have to explain.
          homeroomTeacher: placement ? (homeroomByClassroom.get(placement.classroomId) ?? '') : '',
          englishClass: placement?.englishClass ?? '',
        };
      });

      // `ບັນຊີລາຍຊື່ນັກຮຽນ ມ.1/ຂ 2025-2026` — what the list is, of whom, and when.
      const heading = [
        t('student.exportTitle'),
        classLabel,
        englishClassLabel,
        activeYear.data?.code,
      ]
        .filter(Boolean)
        .join(' ');

      const blob = await buildStudentListWorkbook(rows, {
        schoolName:
          (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
          (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
          '',
        title: heading,
        filters:
          [classLabel, englishClassLabel, ageLabel].filter(Boolean).join(' · ') ||
          t('student.exportEveryStudent'),
        sheetName: t('student.exportSheet'),
        rowNumber: t('student.exportRowNumber'),
        studentCode: t('student.exportStudentCode'),
        status: t('person.status'),
        honorific: t('student.exportHonorific'),
        firstName: t('student.exportFirstName'),
        lastName: t('student.exportLastName'),
        nickname: t('student.exportNickname'),
        nameEn: t('student.exportNameEn'),
        nicknameEn: t('student.exportNicknameEn'),
        classroom: t('enrollment.classroom'),
        homeroomTeacher: t('classroom.homeroomTeacher'),
        englishClass: t('enrollment.englishClass'),
        total: (count) => t('student.exportTotal', { count }),
        printedOn: t('student.exportPrintedOn', { date: formatDate(new Date()) }),
      });

      saveBlob(blob, studentListFileName(heading));
    } catch (error) {
      notify.error(error, t('student.exportFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={exportRoster} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
      {busy ? t('student.exporting') : t('student.exportExcel')}
    </Button>
  );
}
