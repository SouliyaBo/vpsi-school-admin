import { Gavel, ScrollText, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/common/PageHeader';
import { ClassStanding } from '../components/ClassStanding';
import { DeductionEntry } from '../components/DeductionEntry';
import { RuleSheet } from '../components/RuleSheet';

/**
 * ຕັດຄະແນນກົດລະບຽບ — the discipline sheet, worked in three tabs.
 *
 * Taking points leads, because it is the only tab that writes and the one a
 * teacher opens with a child in front of them. The standing is what the
 * discipline committee and the homeroom teacher read, and the rule sheet is the
 * published policy the other two are carried out under — last, because it is
 * consulted rarely and edited rarer still.
 *
 * Recording is open to anyone who may record conduct at all; withdrawing a
 * deduction and editing the sheet are the office's, which is the same division
 * the paper form has always had.
 */
export function ConductDeductionsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const mayRecord = can('conduct-scores', 'create');

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('conductDeduction.title')}
        description={t('conductDeduction.subtitle')}
        actions={
          activeYear.data && (
            <Badge variant="outline">{localizedName(activeYear.data, i18n.language)}</Badge>
          )
        }
      />

      <Tabs defaultValue={mayRecord ? 'record' : 'standing'}>
        <TabsList>
          {mayRecord && (
            <TabsTrigger value="record">
              <Gavel />
              {t('conductDeduction.recordTab')}
            </TabsTrigger>
          )}
          <TabsTrigger value="standing">
            <ShieldCheck />
            {t('conductDeduction.standingTab')}
          </TabsTrigger>
          <TabsTrigger value="rules">
            <ScrollText />
            {t('conductDeduction.rulesTab')}
          </TabsTrigger>
        </TabsList>

        {mayRecord && (
          <TabsContent value="record">
            <DeductionEntry />
          </TabsContent>
        )}
        <TabsContent value="standing">
          <ClassStanding />
        </TabsContent>
        <TabsContent value="rules">
          <RuleSheet />
        </TabsContent>
      </Tabs>
    </div>
  );
}
