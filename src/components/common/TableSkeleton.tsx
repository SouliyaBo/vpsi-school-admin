import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableRow } from '@/components/ui/table';

/**
 * Placeholder rows sized to the real table, so the layout does not jump when
 * data arrives.
 */
export function TableSkeleton({ columns, rows = 8 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow key={rowIndex} className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <TableCell key={columnIndex}>
              <Skeleton
                className="h-4"
                // Varying widths read as text rather than as a progress bar.
                style={{ width: `${[70, 55, 85, 45, 65][(rowIndex + columnIndex) % 5]}%` }}
              />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-20" />
    </div>
  );
}
