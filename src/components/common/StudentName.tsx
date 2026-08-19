import { cn } from '@/lib/utils';

/**
 * A student's register name with what the class actually calls them beside it.
 *
 * Staff know a child by their nickname, so a register-name-only roster is one a
 * teacher has to decode row by row. The nickname is an aside rather than a
 * replacement: the register name is still what a record has to be filed under.
 *
 * Takes the two strings rather than a student object because the registers get
 * them pre-resolved from the API (`studentNameLo` / `studentNickname`), while the
 * history tables resolve them client-side through `fullName()` / `nickname()`.
 * Both shapes end up here.
 *
 * The nickname follows the language of the name it decorates: beside a
 * language-switched `fullName()` it is `nickname(student, language)`, and beside
 * the Lao-only `studentNameLo` of a register it is the Lao one — an English
 * nickname next to a Lao register name reads as two different children.
 */
export function StudentName({
  name,
  nickname,
  className,
  asideClassName,
}: {
  name: string | null | undefined;
  nickname: string | null | undefined;
  className?: string;
  /** Overrides the aside's styling where the surrounding text is already small. */
  asideClassName?: string;
}) {
  return (
    <span className={className}>
      {name || '—'}
      {nickname && (
        <span className={cn('ms-1.5 font-normal text-muted-foreground', asideClassName)}>
          ({nickname})
        </span>
      )}
    </span>
  );
}
