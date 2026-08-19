import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaginatedResponse } from '@/types/common';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PAGE_SIZES = [10, 20, 50, 100] as const;

interface PaginationProps {
  meta: PaginatedResponse<unknown>['meta'];
  onPageChange?: (page: number) => void;
  onLimitChange?: (limit: number) => void;
}

export function Pagination({ meta, onPageChange, onLimitChange }: PaginationProps) {
  const { t } = useTranslation();
  const { page, limit, total, totalPages, hasNextPage, hasPreviousPage } = meta;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
      <p>{t('common.showing', { from, to, total })}</p>

      <div className="flex items-center gap-4">
        {onLimitChange && (
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(value) => onLimitChange(Number(value))}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">{t('common.rowsPerPage')}</span>
          </div>
        )}

        {onPageChange && (
          <div className="flex items-center gap-1">
            <span className="me-2 whitespace-nowrap">
              {t('common.page')} {page} {t('common.of')} {Math.max(totalPages, 1)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(1)}
              disabled={!hasPreviousPage}
              aria-label="First page"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page - 1)}
              disabled={!hasPreviousPage}
              aria-label={t('common.previous')}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(page + 1)}
              disabled={!hasNextPage}
              aria-label={t('common.next')}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => onPageChange(totalPages)}
              disabled={!hasNextPage}
              aria-label="Last page"
            >
              <ChevronsRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
