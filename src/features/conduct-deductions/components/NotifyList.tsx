import { useTranslation } from 'react-i18next';
import type { ConductNotifyParty } from '@/types/enums';

/**
 * "ຄູປະຈຳຫ້ອງ, ຄະນະລະບຽບວິໄນ, ຜູ້ປົກຄອງ ແລະ ຜູ້ກ່ຽວ" — who a rung is convened for.
 *
 * The parties come from the API rather than being derived here, because which of
 * them a rung names is school policy: ຂັ້ນ 3 hands the case to the school and
 * stops naming the homeroom teacher, and a client that "helpfully" kept them on
 * the list would be quietly rewriting the sheet.
 */
export function NotifyList({ parties }: { parties: ConductNotifyParty[] }) {
  const { t } = useTranslation();
  const names = parties.map((party) => t(`conductNotify.${party}`));
  if (names.length === 0) return null;

  const last = names[names.length - 1];
  const rest = names.slice(0, -1);
  return (
    <span className="font-medium text-foreground">
      {rest.length > 0 ? `${rest.join(', ')} ${t('common.and')} ${last}` : last}
    </span>
  );
}
