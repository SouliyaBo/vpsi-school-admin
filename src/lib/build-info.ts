/**
 * Which build of the admin panel is running.
 *
 * `scripts/bump-version.mjs` moves the version on before every build, so a
 * number that has not changed on screen means the deploy did not land — which is
 * the whole reason this is shown rather than kept in `package.json`.
 *
 * The three values reach the app as ordinary `VITE_*` env vars, set on
 * `process.env` by `vite.config.ts` before Vite loads its environment.
 *
 * Not a bare `define` global, which was the first attempt and was wrong: esbuild
 * substitutes one during a production build, but the dev server leaves it alone,
 * so the identifier arrived undefined and the badge fell back to v0.0.0 while
 * `package.json` said 0.1.1 — the exact failure this feature exists to make
 * impossible. `loadEnv` is the one channel dev, build and vitest all read.
 *
 * Still read defensively. A context that never loaded the Vite config at all
 * should get a dash on a footer, not a crash.
 */

function stamp(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** `0.1.2` — from `package.json`, bumped by the prebuild script. */
export const APP_VERSION = stamp(import.meta.env.VITE_APP_VERSION, '0.0.0');

/** Short commit, with `-dirty` when the build carried uncommitted work. */
export const BUILD_COMMIT = stamp(import.meta.env.VITE_BUILD_COMMIT, '');

/** ISO 8601 instant the bundle was compiled. */
export const BUILD_TIME = stamp(import.meta.env.VITE_BUILD_TIME, '');

/** `v0.1.2` — what the footer shows. */
export function versionLabel(): string {
  return `v${APP_VERSION}`;
}

/**
 * The long form, for a tooltip and for a support conversation.
 *
 * Deliberately one line and copy-pasteable: the useful thing to be told when a
 * screen misbehaves is `v0.1.2 · 4f895ed · 2026-09-07 11:20`, not "the latest".
 */
export function buildLabel(locale = 'lo'): string {
  const parts = [versionLabel()];
  if (BUILD_COMMIT) parts.push(BUILD_COMMIT);

  const built = buildDate();
  if (built) {
    parts.push(
      new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'lo-LA', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(built),
    );
  }

  return parts.join(' · ');
}

/** The build instant, or `null` when the stamp is missing or unparseable. */
export function buildDate(): Date | null {
  if (!BUILD_TIME) return null;
  const date = new Date(BUILD_TIME);
  return Number.isNaN(date.getTime()) ? null : date;
}
