import { FileQuestion } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <EmptyState
      icon={FileQuestion}
      title={t('errors.notFoundTitle')}
      description={t('errors.notFoundHint')}
      action={
        <Button asChild>
          <Link to="/">{t('errors.goHome')}</Link>
        </Button>
      }
    />
  );
}
