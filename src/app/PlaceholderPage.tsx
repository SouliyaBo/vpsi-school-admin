import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState } from '@/components/common/EmptyState';
import { Card } from '@/components/ui/card';

/**
 * Stands in for a module scheduled for a later phase.
 *
 * The route and its permission gate are already wired, so shipping the real page
 * is a one-line swap in the router.
 */
export function PlaceholderPage({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation();
  const title = t(`nav.${labelKey}`);

  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <Card>
        <EmptyState
          icon={Construction}
          title={title}
          description="This module is planned for a later phase. The route and its permission check are already in place."
        />
      </Card>
    </div>
  );
}
