import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { useGuardianOptions } from '@/features/guardians/api';
import { useRoleOptions } from '@/features/roles/api';
import { useStudentOptions } from '@/features/students/api';
import { teachers, useTeacherOptions } from '@/features/teachers/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { LOCALE_LABELS } from '@/i18n';
import { vmsg } from '@/lib/form-message';
import { stripEmpty } from '@/lib/payload';
import { formatRelative, localizedName, refId, refObject } from '@/lib/utils';
import {
  optionalEmail,
  optionalId,
  optionalText,
  requiredId,
  requiredText,
} from '@/lib/zod-helpers';
import { LOCALES, PERSON_TYPES, USER_STATUSES, type PersonType } from '@/types/enums';
import type { Role, User } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, SelectField, SwitchField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { users, useResetUserPassword, useUnlockUser, type UserInput } from '../api';

/** Mirrors the API's rule, so a rejected password is caught before the request. */
const password = () =>
  z
    .string({ required_error: vmsg('validation.required') })
    .min(8, vmsg('validation.minLength', { min: 8 }))
    .max(128, vmsg('validation.maxLength', { max: 128 }))
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, vmsg('user.passwordRule'));

const schema = z
  .object({
    /**
     * Which half of the form is on screen.
     *
     * The create and edit dialogs share one schema because they share one
     * `useForm`, but they do not share their rules: the password field only
     * exists while creating, and an existing account would fail a "password
     * required" check it never gets the chance to satisfy.
     */
    isNew: z.boolean(),
    username: requiredText(50).regex(/^[a-z0-9._-]+$/, vmsg('user.usernameRule')),
    email: optionalEmail(),
    password: optionalText(128),
    roleId: requiredId(),
    personType: z.enum(PERSON_TYPES),
    personId: optionalId(),
    status: z.enum(USER_STATUSES),
    locale: z.enum(LOCALES),
    mustChangePassword: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.personType !== 'staff' && !values.personId) {
      ctx.addIssue({ code: 'custom', path: ['personId'], message: vmsg('validation.required') });
    }
    if (!values.isNew) return;

    const result = password().safeParse(values.password);
    if (!result.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['password'],
        message: result.error.issues[0].message,
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  isNew: true,
  username: '',
  email: '',
  password: '',
  roleId: '',
  personType: 'teacher',
  personId: '',
  status: 'active',
  locale: 'lo',
  mustChangePassword: true,
};

/**
 * Which picker fills `personId`, by person type.
 *
 * `staff` has no entry on purpose — an office account belongs to no row in any
 * person collection, which is exactly what the API's "personId required unless
 * staff" rule encodes.
 */
const PERSON_PICKERS = {
  teacher: useTeacherOptions,
  student: useStudentOptions,
  guardian: useGuardianOptions,
} as const;

/**
 * Where logins are issued and authority is handed out.
 *
 * The permission matrix itself lives on the role (six are seeded), so this page
 * grants access by picking one — it does not edit the matrix. That is the Roles
 * page's job.
 */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const me = useCurrentUser();
  const table = useTableQueryState({
    defaultSortBy: 'username',
    defaultSortOrder: 'asc',
    filterKeys: ['roleId', 'status', 'personType'],
  });
  const dialogs = useCrudDialogs<User>();

  /** Reset-password is its own form, not a field on the edit dialog. */
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [unlockTarget, setUnlockTarget] = useState<User | null>(null);

  const list = users.useList(table.queryParams);
  const create = users.useCreate();
  const update = users.useUpdate();
  const remove = users.useDelete();
  const resetPassword = useResetUserPassword();
  const unlock = useUnlockUser();
  const roleOptions = useRoleOptions();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const resetForm = useForm<{ temporaryPassword: string }>({
    resolver: zodResolver(z.object({ temporaryPassword: password() })),
    defaultValues: { temporaryPassword: '' },
  });

  const personType = form.watch('personType');
  const personId = form.watch('personId');

  /** Values the create form opens with, when it was opened for someone specific. */
  const [prefill, setPrefill] = useState<Partial<FormValues> | null>(null);

  // Arriving from a teacher row: `/users?create=<teacherId>`. Consumed once and
  // dropped from the URL, so a reload does not reopen the dialog.
  const [searchParams, setSearchParams] = useSearchParams();
  const createFor = searchParams.get('create');

  useEffect(() => {
    if (!createFor) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('create');
        return next;
      },
      { replace: true },
    );
    setPrefill({ personType: 'teacher', personId: createFor });
    dialogs.openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFor]);

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            isNew: false,
            username: dialogs.record.username,
            email: dialogs.record.email ?? '',
            password: '',
            roleId: refId<Role>(dialogs.record.roleId) ?? '',
            personType: dialogs.record.personType,
            personId: dialogs.record.personId ?? '',
            status: dialogs.record.status,
            locale: (dialogs.record.locale === 'en' ? 'en' : 'lo') as FormValues['locale'],
            mustChangePassword: dialogs.record.mustChangePassword,
          }
        : { ...EMPTY, ...prefill },
    );
    // Spent — the next plain "create" opens an empty form.
    setPrefill(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs.formOpen, dialogs.record, form]);

  // The username is the teacher's code: it is already unique, already what staff
  // call each other by on paper, and it survives a person changing their name.
  const pickedTeacher = teachers.useDetail(
    !dialogs.isEditing && personType === 'teacher' && personId ? personId : undefined,
  );

  useEffect(() => {
    const code = pickedTeacher.data?.teacherCode;
    if (!code || dialogs.isEditing) return;
    // A username typed by hand wins — this only fills a field nobody touched.
    if (!form.getFieldState('username').isDirty) {
      form.setValue('username', code.toLowerCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTeacher.data?.teacherCode, dialogs.isEditing]);

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        accessorKey: 'username',
        header: t('user.username'),
        cell: ({ row }) => {
          const locked = isLocked(row.original);
          return (
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-medium">
                {row.original.username}
                {row.original.id === me?.id && (
                  <Badge variant="info">{t('user.you')}</Badge>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {row.original.email ?? '—'}
                {/* Both flags are the reason an account cannot get in, so they
                    belong next to the name rather than behind the row menu. */}
                {locked && <Badge variant="danger">{t('user.locked')}</Badge>}
                {row.original.mustChangePassword && (
                  <Badge variant="warning">{t('user.mustChangePassword')}</Badge>
                )}
              </p>
            </div>
          );
        },
        meta: { sortKey: 'username' } satisfies DataTableColumnMeta,
      },
      {
        id: 'role',
        header: t('user.role'),
        cell: ({ row }) => localizedName(refObject<Role>(row.original.roleId), i18n.language),
      },
      {
        accessorKey: 'personType',
        header: t('user.personType'),
        cell: ({ row }) => t(`personType.${row.original.personType}`),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} namespace="userStatus" />,
      },
      {
        accessorKey: 'lastLoginAt',
        header: t('user.lastLoginAt'),
        cell: ({ row }) =>
          row.original.lastLoginAt ? (
            formatRelative(row.original.lastLoginAt)
          ) : (
            // An account that has never been used is the one worth chasing after
            // handing out a password.
            <span className="text-warning">{t('user.neverLoggedIn')}</span>
          ),
        meta: { sortKey: 'lastLoginAt', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          // Suspending or deleting your own account would lock you out of the
          // page that undoes it, and the API does not stop you.
          const isSelf = row.original.id === me?.id;
          return (
            <RowActions
              actions={[
                {
                  label: t('common.edit'),
                  icon: Pencil,
                  hidden: !can('users', 'update'),
                  onSelect: () => dialogs.openEdit(row.original),
                },
                {
                  label: t('user.resetPassword'),
                  icon: KeyRound,
                  hidden: !can('users', 'manage'),
                  onSelect: () => setResetTarget(row.original),
                },
                {
                  label: t('user.unlock'),
                  icon: LockOpen,
                  hidden: !can('users', 'manage') || !isLocked(row.original),
                  onSelect: () => setUnlockTarget(row.original),
                },
                {
                  label: t('common.delete'),
                  icon: Trash2,
                  destructive: true,
                  hidden: !can('users', 'delete') || isSelf,
                  onSelect: () => dialogs.askDelete(row.original),
                },
              ]}
            />
          );
        },
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs, me?.id],
  );

  function submit(values: FormValues) {
    if (dialogs.record) {
      // PATCH takes only these four: username, person and password are fixed
      // once the account exists, and the API rejects unknown properties.
      const mutation = update.mutateAsync({
        id: dialogs.record.id,
        body: stripEmpty({
          email: values.email,
          roleId: values.roleId,
          status: values.status,
          locale: values.locale,
        }),
      });
      void mutation.then(dialogs.closeForm).catch(() => {});
      return;
    }

    // Unreachable — the schema requires a password while `isNew` — but it is
    // what narrows the optional field the edit half of the form leaves blank.
    if (!values.password) return;

    const body: UserInput = {
      username: values.username,
      email: values.email || undefined,
      password: values.password,
      roleId: values.roleId,
      personType: values.personType,
      personId: values.personType === 'staff' ? undefined : values.personId,
      mustChangePassword: values.mustChangePassword,
    };
    void create
      .mutateAsync(stripEmpty(body))
      .then(dialogs.closeForm)
      .catch(() => {
        /* the global handler toasts; the form keeps the typed password */
      });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('user.title')}
        description={t('user.subtitle')}
        actions={
          can('users', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('user.create')}
            </Button>
          )
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
        getRowId={(row) => row.id}
        emptyTitle={table.hasActiveFilters ? t('common.noResults') : t('common.noData')}
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
            <FilterSelect
              value={table.filters.roleId}
              onChange={(value) => table.setFilter('roleId', value)}
              options={roleOptions.data ?? []}
              placeholder={t('user.role')}
            />
            <FilterSelect
              value={table.filters.personType}
              onChange={(value) => table.setFilter('personType', value)}
              options={PERSON_TYPES.map((type) => ({
                value: type,
                label: t(`personType.${type}`),
              }))}
              placeholder={t('user.personType')}
            />
            <FilterSelect
              value={table.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={USER_STATUSES.map((status) => ({
                value: status,
                label: t(`userStatus.${status}`),
              }))}
              placeholder={t('common.status')}
            />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('user.edit') : t('user.create')}
        description={dialogs.isEditing ? t('user.editHint') : t('user.createHint')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
        size="lg"
      >
        <Form {...form}>
          <FieldSection>
            <SelectField
              control={form.control}
              name="personType"
              label={t('user.personType')}
              required
              disabled={dialogs.isEditing}
              options={PERSON_TYPES.map((type) => ({
                value: type,
                label: t(`personType.${type}`),
              }))}
            />

            {personType === 'staff' ? (
              <div className="hidden sm:block" />
            ) : (
              <EntitySelectField
                // `EntitySelect` calls whichever hook it is handed, so swapping
                // the person type must remount it rather than change that call
                // between renders.
                key={personType}
                control={form.control}
                name="personId"
                label={t(`personType.${personType}`)}
                useOptions={PERSON_PICKERS[personType as Exclude<PersonType, 'staff'>]}
                disabled={dialogs.isEditing}
                required
              />
            )}

            <TextField
              control={form.control}
              name="username"
              label={t('user.username')}
              required
              // Fixed after creation: audit rows and lesson-plan history name the
              // account by it.
              disabled={dialogs.isEditing}
              description={dialogs.isEditing ? undefined : t('user.usernameHint')}
              autoComplete="off"
              placeholder="t-2627-001"
            />
            <TextField
              control={form.control}
              name="email"
              label={t('person.email')}
              type="email"
              autoComplete="off"
            />

            {!dialogs.isEditing && (
              <TextField
                control={form.control}
                name="password"
                label={t('user.password')}
                type="password"
                required
                description={t('user.passwordRule')}
                autoComplete="new-password"
                className="sm:col-span-2"
              />
            )}

            <SelectField
              control={form.control}
              name="roleId"
              label={t('user.role')}
              description={t('user.roleHint')}
              required
              options={roleOptions.data ?? []}
            />

            {dialogs.isEditing ? (
              <SelectField
                control={form.control}
                name="status"
                label={t('common.status')}
                description={t('user.statusHint')}
                options={USER_STATUSES.map((status) => ({
                  value: status,
                  label: t(`userStatus.${status}`),
                }))}
              />
            ) : (
              <div className="hidden sm:block" />
            )}

            <SelectField
              control={form.control}
              name="locale"
              label={t('common.language')}
              options={LOCALES.map((locale) => ({ value: locale, label: LOCALE_LABELS[locale] }))}
            />

            {!dialogs.isEditing && (
              <SwitchField
                control={form.control}
                name="mustChangePassword"
                label={t('user.mustChangePassword')}
                description={t('user.mustChangePasswordHint')}
                className="sm:col-span-2"
              />
            )}
          </FieldSection>
        </Form>
      </FormDialog>

      <FormDialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (open) return;
          setResetTarget(null);
          resetForm.reset({ temporaryPassword: '' });
        }}
        title={t('user.resetPassword')}
        description={t('user.resetPasswordHint', { username: resetTarget?.username ?? '' })}
        submitLabel={t('user.resetPassword')}
        isSubmitting={resetPassword.isPending}
        onSubmit={resetForm.handleSubmit((values) => {
          if (!resetTarget) return;
          void resetPassword
            .mutateAsync({ id: resetTarget.id, temporaryPassword: values.temporaryPassword })
            .then(() => {
              setResetTarget(null);
              resetForm.reset({ temporaryPassword: '' });
            })
            .catch(() => {});
        })}
      >
        <Form {...resetForm}>
          <TextField
            control={resetForm.control}
            name="temporaryPassword"
            label={t('user.temporaryPassword')}
            type="password"
            required
            description={t('user.passwordRule')}
            autoComplete="new-password"
          />
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={unlockTarget !== null}
        onOpenChange={(open) => !open && setUnlockTarget(null)}
        title={t('user.unlock')}
        description={t('user.unlockConfirm', { username: unlockTarget?.username ?? '' })}
        tone="default"
        isPending={unlock.isPending}
        onConfirm={() => {
          if (!unlockTarget) return;
          void unlock.mutateAsync(unlockTarget.id).finally(() => setUnlockTarget(null));
        }}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('user.deleteConfirm', { username: dialogs.deleteTarget.username })
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

/** A lockout that has not expired yet — the API clears the field on its own later. */
function isLocked(user: User): boolean {
  return Boolean(user.lockedUntil && new Date(user.lockedUntil) > new Date());
}
