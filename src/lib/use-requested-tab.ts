import { useSearchParams } from 'react-router-dom';

/**
 * The tab a link asked for with `?tab=`, when it is one this page shows.
 *
 * What lets ລາຍງານ send the office straight to "ສະຫຼຸບປະຈຳເດືອນ" rather than
 * to the marks page's first tab, where the reader would have to know which tab
 * the sheet is on. Read once, as the tab's starting value: the page's own tabs
 * still switch freely after that. A tab the reader may not see — or a name that
 * was never a tab — falls back, so a stale link opens the page rather than a
 * blank panel.
 */
export function useRequestedTab<T extends string>(allowed: readonly T[], fallback: T): T {
  const [params] = useSearchParams();
  const requested = params.get('tab');
  return allowed.find((tab) => tab === requested) ?? fallback;
}
