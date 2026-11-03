import { expect, it } from 'vitest';
import { en } from './locales/en';
import { lo } from './locales/lo';

/**
 * Every literal key the code passes to `t()` exists in both catalogues.
 *
 * A missing key renders as the key itself — `common.from` on the homeroom review
 * page went out that way, because that component has no test of its own and the
 * per-render check in `src/test/setup.ts` only covers what a test renders. This
 * reads the source instead, so an untested screen is held to the same rule.
 *
 * Only literal keys are checked: a key built at run time, like
 * `` t(`gender.${gender}`) ``, cannot be resolved from the text.
 */

const sources = import.meta.glob<string>(['/src/**/*.{ts,tsx}', '!/src/types/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

function resolves(catalogue: unknown, key: string): boolean {
  const lookup = (path: string) =>
    path
      .split('.')
      .reduce<unknown>(
        (node, part) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
        catalogue,
      );
  // i18next plurals live under `key_one` / `key_other`, never the bare key.
  return typeof lookup(key) === 'string' || typeof lookup(`${key}_one`) === 'string';
}

it('finds every literal t() key in both the Lao and the English catalogue', () => {
  const missing: string[] = [];
  let checked = 0;

  for (const [file, text] of Object.entries(sources)) {
    for (const match of text.matchAll(/\bt\(\s*'([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)'/g)) {
      const key = match[1]!;
      checked += 1;
      if (!resolves(lo, key)) missing.push(`${file}: ${key} (lo)`);
      if (!resolves(en, key)) missing.push(`${file}: ${key} (en)`);
    }
  }

  // Guards the glob: a pattern that matched nothing would pass with no keys read.
  expect(checked).toBeGreaterThan(1000);
  expect([...new Set(missing)]).toEqual([]);
});
