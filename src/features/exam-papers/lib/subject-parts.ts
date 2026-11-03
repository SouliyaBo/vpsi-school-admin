import type { ExamSubjectPart } from '@/types/entities';

/**
 * ແຍກຄະແນນຕາມວິຊາ on the review side: which ພາກ the paper has, and a first
 * guess at whose each is. The scoring is the API's (`exam-papers/subject-parts.ts`);
 * the two agree that a question with no ພາກ heading is in the part named `''`.
 */

export const NO_SECTION = '';

/** Each ພາກ once, in the order it first appears, with how many questions it holds. */
export function sectionsOf(
  questions: { section?: string | null }[],
): { section: string; questions: number }[] {
  const counts = new Map<string, number>();
  for (const question of questions) {
    const key = question.section ?? NO_SECTION;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([section, count]) => ({ section, questions: count }));
}

/**
 * The subject a ພາກ heading names, if it names exactly one: "ພາກ I ຟີຊິກ" is
 * ຟີຊິກສາດ. Read by the subject's name with and without its ສາດ / ສຶກສາ, the
 * way a heading shortens it. A guess for the teacher to check, never applied
 * unseen.
 */
export function guessSubject(
  section: string,
  subjects: { id: string; nameLo: string }[],
): string | null {
  if (!section.trim()) return null;
  const named = subjects.filter((subject) => {
    const stems = [
      subject.nameLo,
      subject.nameLo.replace(/ສາດ$/, ''),
      subject.nameLo.replace(/^ສຶກສາ/, ''),
    ].filter((stem) => stem.length >= 2);
    return stems.some((stem) => section.includes(stem));
  });
  return named.length === 1 ? named[0].id : null;
}

/** ພາກ → subject, as the form holds it, from the parts the paper keeps. */
export function sectionMap(parts: ExamSubjectPart[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of parts) for (const section of part.sections) map[section] = part.subjectId;
  return map;
}

/** The form back into parts, one per subject given a ພາກ, in the subjects' order. */
export function toParts(
  map: Record<string, string>,
  points: Record<string, number | null>,
  subjectOrder: string[],
): ExamSubjectPart[] {
  return subjectOrder
    .map((subjectId) => ({
      subjectId,
      sections: Object.keys(map).filter((section) => map[section] === subjectId),
      points: points[subjectId] ?? null,
    }))
    .filter((part) => part.sections.length > 0);
}
