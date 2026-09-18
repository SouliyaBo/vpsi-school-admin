/**
 * The office's own lists for a ບົດບັນທຶກ ຂໍໂຈະການຮຽນ, as given on 17 Sep 2026.
 *
 * Kept as plain Lao text rather than i18n keys: they are printed on the memo
 * verbatim, and the memo is only ever in Lao. `OTHER` opens a free-text box.
 */

export const OTHER = '__other__';

/** The one reason that takes a second choice — which country. */
export const STUDY_ABROAD = 'ໄປຮຽນຕໍ່ຕ່າງປະເທດ';

export const SUSPENSION_REASONS: readonly string[] = [
  'ສຸມໃສ່ການຮຽນພາກພາສາອັງກິດ',
  STUDY_ABROAD,
  'ຍ້າຍໂຮງຮຽນໃໝ່ (ທີ່ບໍ່ມີພາກພາສາລາວ)',
  'ເພື່ອຮຽນ home school ຢູ່ບ້ານ',
];

/** Where pupils go, in the order the office listed them; `OTHER` takes a name. */
export const STUDY_ABROAD_COUNTRIES: readonly string[] = [
  'ໄທ',
  'ຈີນ',
  'ອ໋ອດສະເຕເລຍ',
  'ສິງກະໂປ',
  'ຍີ່ປຸ່ນ',
];

/** `ໄປຮຽນຕໍ່ຕ່າງປະເທດ (ໄທ)` — what the memo prints. */
export function studyAbroadLabel(country: string): string {
  return `${STUDY_ABROAD} (${country})`;
}

/** Documents handed back, in the order the office listed them. */
export const RETURNED_DOCUMENTS: readonly string[] = [
  'ປຶ້ມຕິດຕາມປະຖົມ',
  'ປຶ້ມຕິດຕາມມັດທະຍົມ',
  'ໃບປະກາດ ມ.4',
  'ໃບປະກາດ ມ.7',
];

/** `ໃບຄະແນນ report card ຊັ້ນ ມ.3` — the one entry that takes a level. */
export function reportCardLabel(level: string): string {
  return `ໃບຄະແນນ report card ຊັ້ນ ມ.${level}`;
}

export const REPORT_CARD_LEVELS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7'];
