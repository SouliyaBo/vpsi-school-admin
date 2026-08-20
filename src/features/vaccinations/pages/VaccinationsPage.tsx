import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Pencil, Plus, Syringe, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate } from '@/lib/utils';
import type { VaccinationCampaign } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { campaigns } from '../api';
import { CampaignFormDialog } from '../components/CampaignFormDialog';
import { DoseSheet } from '../components/DoseSheet';
import { StudentPicker } from '../components/StudentPicker';

/**
 * The vaccination programme: the rounds, and the sheet each one is filled in on.
 *
 * One page rather than a list route and a detail route, because the roll is only
 * ever reached from its campaign and carries nothing worth linking to on its own
 * — while the sheet is open the list is out of the way, and closing it returns to
 * exactly the filters the nurse left.
 */
export function VaccinationsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'scheduledDate', defaultSortOrder: 'desc' });
  const dialogs = useCrudDialogs<VaccinationCampaign>();

  /** The round whose sheet is open. `null` shows the list. */
  const [openSheet, setOpenSheet] = useState<VaccinationCampaign | null>(null);

  const list = campaigns.useList(table.queryParams);
  const remove = campaigns.useDelete();

  const columns = useMemo<ColumnDef<VaccinationCampaign, unknown>[]>(
    () => [
      {
        accessorKey: 'nameLo',
        header: t('common.nameLo'),
        cell: ({ row }) => <span className="font-medium">{row.original.nameLo}</span>,
      },
      {
        accessorKey: 'vaccine',
        header: t('vaccination.vaccine'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <Badge variant="outline">{t(`vaccine.${row.original.vaccine}`)}</Badge>
            {t('vaccination.doseN', { number: row.original.doseNumber })}
          </span>
        ),
      },
      {
        accessorKey: 'scheduledDate',
        header: t('vaccination.scheduledDate'),
        cell: ({ row }) => formatDate(row.original.scheduledDate),
        meta: { sortKey: 'scheduledDate' } satisfies DataTableColumnMeta,
      },
      {
        id: 'eligibility',
        header: t('vaccination.eligibility'),
        // Says who the round covers in the list, because that is the field most
        // worth checking before the sheet is opened — and the one place the
        // "girls only" of an HPV round is actually stated.
        cell: ({ row }) => {
          const { gender, gradeLevelIds } = row.original.eligibility ?? {};
          return (
            <span className="text-sm text-muted-foreground">
              {gender ? t(`gender.${gender}`) : t('vaccination.everyStudent')}
              {gradeLevelIds?.length ? ` · ${t('vaccination.nGrades', { count: gradeLevelIds.length })}` : ''}
            </span>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'students',
        header: t('vaccination.studentsTab'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {t('vaccination.onRound', { count: row.original.studentIds?.length ?? 0 })}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('person.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} namespace="campaignStatus" />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('vaccination.open'),
                icon: Syringe,
                onSelect: () => setOpenSheet(row.original),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('vaccinations', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('vaccinations', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, can, dialogs],
  );

  if (openSheet) {
    // Fresh from the list, so the roll count on the picker reflects the last save
    // rather than the row as it was clicked.
    const current = list.data?.data.find((row) => row.id === openSheet.id) ?? openSheet;

    return (
      <div className="space-y-4">
        <PageHeader
          title={current.nameLo}
          description={`${t(`vaccine.${current.vaccine}`)} · ${t('vaccination.doseN', {
            number: current.doseNumber,
          })} · ${formatDate(current.scheduledDate)}`}
          actions={
            <Button variant="outline" onClick={() => setOpenSheet(null)}>
              <ArrowLeft />
              {t('common.back')}
            </Button>
          }
        />

        {/* The picker leads: a round has to have students before there is a sheet
            to fill in, and the roll is no longer swept from the rule. */}
        <Tabs defaultValue="students">
          <TabsList>
            <TabsTrigger value="students">
              <Users />
              {t('vaccination.studentsTab')}
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <Syringe />
              {t('vaccination.sheetTab')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students">
            <StudentPicker campaign={current} />
          </TabsContent>
          <TabsContent value="sheet">
            <DoseSheet campaign={current} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('vaccination.title')}
        description={t('vaccination.subtitle')}
        actions={
          can('vaccinations', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('vaccination.createCampaign')}
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
        onRowClick={setOpenSheet}
      />

      <CampaignFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        campaign={dialogs.record}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        // The API refuses a round that already gave a dose — that is a fact about
        // the children who attended it. Said here so the answer is not a 400.
        description={
          dialogs.deleteTarget
            ? `${dialogs.deleteTarget.nameLo} — ${t('vaccination.deleteHint')}`
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
