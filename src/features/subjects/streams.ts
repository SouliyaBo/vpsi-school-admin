import { refId } from '@/lib/utils';
import type { Subject } from '@/types/entities';

/** A ສາຍວິຊາ and the subjects marked under it, or one subject standing alone. */
export interface SubjectStream {
  /** The taught subject the marked ones split from; `null` for a subject marked as itself. */
  parent: Subject | null;
  subjects: Subject[];
}

const bySheetOrder = (a: Subject, b: Subject) =>
  a.sortOrder - b.sortOrder || a.code.localeCompare(b.code);

/**
 * The grade's marked subjects, gathered under the ສາຍ they split from.
 *
 * The printed sheet orders subjects by `sortOrder` alone, which puts ພູມສາດ and
 * ປະຫວັດສາດ at the far end, after the whole of ທຳມະຊາດ, and away from
 * ສຶກສາພົນລະເມືອງ. A teacher thinks in ສາຍ, so the pickers keep each ສາຍ's subjects
 * together: a stream stands where its first subject would, and its subjects keep
 * the sheet's order inside it. The sheets themselves are not reordered.
 *
 * `taught` is only where the parent's name is read from. A subject whose parent
 * is not in it still keeps its siblings' company, under no heading.
 */
export function groupByStream(marked: Subject[], taught: Subject[] = []): SubjectStream[] {
  const parents = new Map(taught.map((subject) => [subject.id, subject]));
  const streams = new Map<string, SubjectStream>();

  for (const subject of [...marked].sort(bySheetOrder)) {
    const parentId = refId(subject.parentSubjectId);
    const key = parentId ?? subject.id;
    const stream = streams.get(key) ?? { parent: null, subjects: [] };
    if (parentId) stream.parent = parents.get(parentId) ?? null;
    stream.subjects.push(subject);
    streams.set(key, stream);
  }

  // A Map iterates in insertion order, and every stream was inserted at its
  // first subject in sheet order — which is the order the streams stand in.
  return [...streams.values()];
}

/**
 * The heading over a stream: ສາຍສັງຄົມ.
 *
 * The parent is named ສັງຄົມ on some records and ສາຍສັງຄົມ on others, so the
 * prefix is added only where the name lacks it.
 */
export function streamHeading(name: string, locale: string): string {
  if (locale === 'en') return name;
  return name.startsWith('ສາຍ') ? name : `ສາຍ${name}`;
}
