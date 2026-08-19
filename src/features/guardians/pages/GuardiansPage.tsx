import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useVillageOptions } from '@/features/locations/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { formatDate, fullName, localizedName, refId, refObject, toDateInput } from '@/lib/utils';
import {
  optionalDate,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalText,
  requiredPhone,
  requiredText,
} from '@/lib/zod-helpers';
import { GENDERS } from '@/types/enums';
import type { Guardian, Location } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { DetailDrawer, DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { DateField, FieldSection, SelectField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { guardians, useGuardianChildren, type GuardianInput } from '../api';

const schema = z.object({
  firstNameLo: requiredText(80),
  lastNameLo: requiredText(80),
  gender: z.enum(GENDERS).optional(),
  dateOfBirth: optionalDate(),
  nationalId: optionalText(30),
  // The API requires a phone: a guardian with no reachable number is useless as
  // an emergency contact.
  phone: requiredPhone(),
  alternatePhone: optionalPhone(),
  email: optionalEmail(),
  occupation: optionalText(120),
  workplace: optionalText(150),
  villageId: optionalId(),
  addressDetail: optionalText(300),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  firstNameLo: '',
  lastNameLo: '',
  gender: undefined,
  dateOfBirth: '',
  nationalId: '',
  phone: '',
  alternatePhone: '',
  email: '',
  occupation: '',
  workplace: '',
  villageId: '',
  addressDetail: '',
};

export function GuardiansPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'lastNameLo', defaultSortOrder: 'asc' });
  const dialogs = useCrudDialogs<Guardian>();
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = guardians.useList(table.queryParams);
  const create = guardians.useCreate();
  const update = guardians.useUpdate();
  const remove = guardians.useDelete();
  const detail = guardians.useDetail(detailId ?? undefined);
  const children = useGuardianChildren(detailId ?? undefined);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            firstNameLo: dialogs.record.firstNameLo,
            lastNameLo: dialogs.record.lastNameLo,
            gender: dialogs.record.gender ?? undefined,
            dateOfBirth: toDateInput(dialogs.record.dateOfBirth),
            nationalId: dialogs.record.nationalId ?? '',
            phone: dialogs.record.phone,
            alternatePhone: dialogs.record.alternatePhone ?? '',
            email: dialogs.record.email ?? '',
            occupation: dialogs.record.occupation ?? '',
            workplace: dialogs.record.workplace ?? '',
            villageId: refId(dialogs.record.villageId) ?? '',
            addressDetail: dialogs.record.addressDetail ?? '',
          }
        : EMPTY,
    );
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<Guardian, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => (
          <span className="font-medium">{fullName(row.original, i18n.language)}</span>
        ),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'phone',
        header: t('person.phone'),
        cell: ({ row }) => (
          <div>
            <p>{row.original.phone}</p>
            {row.original.alternatePhone && (
              <p className="text-xs text-muted-foreground">{row.original.alternatePhone}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'occupation',
        header: t('guardian.occupation'),
        cell: ({ row }) => row.original.occupation ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'email',
        header: t('person.email'),
        cell: ({ row }) => row.original.email ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'createdAt',
        header: t('common.createdAt'),
        cell: ({ row }) => formatDate(row.original.createdAt),
        meta: { sortKey: 'createdAt', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              { label: t('common.details'), icon: Eye, onSelect: () => setDetailId(row.original.id) },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('guardians', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('guardians', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs],
  );

  function submit(values: FormValues) {
    const body = stripEmpty(values) as GuardianInput;
    const mutation = dialogs.record
      ? update.mutateAsync({ id: dialogs.record.id, body })
      : create.mutateAsync(body);
    void mutation.then(dialogs.closeForm).catch(() => {});
  }

  const current = detail.data;
  const village = refObject<Location>(current?.villageId);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('guardian.title')}
        actions={
          can('guardians', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('guardian.create')}
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
        onRowClick={(row) => setDetailId(row.id)}
        getRowId={(row) => row.id}
        toolbar={
          <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} className="w-full sm:w-72" />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('guardian.edit') : t('guardian.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
        size="lg"
      >
        <Form {...form}>
          <div className="space-y-5">
            <FieldSection title={t('person.basicInfo')}>
              <TextField control={form.control} name="firstNameLo" label={t('person.firstNameLo')} required />
              <TextField control={form.control} name="lastNameLo" label={t('person.lastNameLo')} required />
              <SelectField
                control={form.control}
                name="gender"
                label={t('person.gender')}
                clearable
                options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
              />
              <DateField control={form.control} name="dateOfBirth" label={t('person.dateOfBirth')} />
              <TextField control={form.control} name="nationalId" label={t('person.nationalId')} />
            </FieldSection>

            <FieldSection title={t('person.contactInfo')}>
              <TextField control={form.control} name="phone" label={t('person.phone')} type="tel" required />
              <TextField
                control={form.control}
                name="alternatePhone"
                label={t('guardian.alternatePhone')}
                type="tel"
              />
              <TextField control={form.control} name="email" label={t('person.email')} type="email" />
            </FieldSection>

            <FieldSection title={t('person.workInfo')}>
              <TextField control={form.control} name="occupation" label={t('guardian.occupation')} />
              <TextField control={form.control} name="workplace" label={t('guardian.workplace')} />
            </FieldSection>

            <FieldSection title={t('person.addressInfo')}>
              <EntitySelectField
                control={form.control}
                name="villageId"
                label={t('person.village')}
                useOptions={useVillageOptions}
                searchPlaceholder={t('location.searchVillage')}
              />
              <TextField control={form.control} name="addressDetail" label={t('person.addressDetail')} />
            </FieldSection>
          </div>
        </Form>
      </FormDialog>

      <DetailDrawer
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        title={current ? fullName(current, i18n.language) : t('common.details')}
        description={current?.phone}
        isLoading={detail.isLoading}
        error={detail.error}
        onRetry={detail.refetch}
        footer={
          current &&
          can('guardians', 'update') && (
            <Button
              onClick={() => {
                dialogs.openEdit(current);
                setDetailId(null);
              }}
            >
              <Pencil />
              {t('common.edit')}
            </Button>
          )
        }
      >
        {current && (
          <div className="space-y-6">
            <DetailSection title={t('person.basicInfo')}>
              <DetailRow label={t('person.gender')}>
                {current.gender ? t(`gender.${current.gender}`) : '—'}
              </DetailRow>
              <DetailRow label={t('person.dateOfBirth')}>{formatDate(current.dateOfBirth)}</DetailRow>
              <DetailRow label={t('person.nationalId')}>{current.nationalId ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.contactInfo')}>
              <DetailRow label={t('person.phone')}>{current.phone}</DetailRow>
              <DetailRow label={t('guardian.alternatePhone')}>{current.alternatePhone ?? '—'}</DetailRow>
              <DetailRow label={t('person.email')}>{current.email ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.workInfo')}>
              <DetailRow label={t('guardian.occupation')}>{current.occupation ?? '—'}</DetailRow>
              <DetailRow label={t('guardian.workplace')}>{current.workplace ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.addressInfo')}>
              <DetailRow label={t('person.village')}>
                {village ? localizedName(village, i18n.language) : '—'}
              </DetailRow>
              <DetailRow label={t('person.addressDetail')}>{current.addressDetail ?? '—'}</DetailRow>
            </DetailSection>

            {/* Children come from a separate endpoint; the relationship itself is
                edited from the student side, which owns the guardian list. */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('guardian.children')}
              </h3>
              {children.data?.length ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {children.data.map((student) => {
                    const link = student.guardians?.find(
                      (entry) => refId(entry.guardianId) === current.id,
                    );
                    return (
                      <li key={student.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <Link
                            to={`/students/${student.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {fullName(student, i18n.language)}
                          </Link>
                          <p className="text-xs text-muted-foreground">{student.studentCode}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {link && (
                            <span className="text-xs text-muted-foreground">
                              {t(`relationship.${link.relationship}`)}
                            </span>
                          )}
                          <StatusBadge status={student.status} namespace="studentStatus" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={Users}
                  title={t('guardian.noChildren')}
                  className="rounded-md border border-dashed border-border py-8"
                />
              )}
            </section>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('guardian.deleteConfirm', { name: fullName(dialogs.deleteTarget, i18n.language) })
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
