import { useEffect, useState } from 'react';

/**
 * Delays a value by `delay` ms.
 *
 * Used for search boxes: filtering happens server-side, so every keystroke would
 * otherwise be a query against the students collection.
 */
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
