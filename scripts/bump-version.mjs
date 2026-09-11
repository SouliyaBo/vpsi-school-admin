#!/usr/bin/env node
/**
 * Moves `package.json`'s version on, so that every build ships a number nobody
 * has seen before.
 *
 * Wired to the `prebuild` lifecycle, which npm runs on its own before `build` —
 * so the answer to "is the thing I just deployed actually the new one?" is on
 * the login screen, and nobody has to remember a step to keep it true.
 *
 * The version alone does not say *which* build: two people can bump to the same
 * number from different work. The commit and the build time are what settle
 * that, and those are stamped in by `vite.config.ts` at compile time rather than
 * written here — they describe the build, not the release.
 *
 *   node scripts/bump-version.mjs            # 0.1.0 → 0.1.1   (the default)
 *   node scripts/bump-version.mjs --minor    # 0.1.4 → 0.2.0
 *   node scripts/bump-version.mjs --major    # 0.2.7 → 1.0.0
 *   node scripts/bump-version.mjs --set 2.0.0-rc.1
 *   node scripts/bump-version.mjs --none     # leave it; stamp the build only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packagePath = join(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json');

/** `major.minor.patch`, with an optional `-prerelease` / `+build` tail. */
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;

function bump(version, release) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(
      `package.json version "${version}" is not semver — fix it, or pass --set <version>`,
    );
  }

  const [, major, minor, patch, prerelease] = match;
  const [x, y, z] = [Number(major), Number(minor), Number(patch)];

  switch (release) {
    case 'major':
      return `${x + 1}.0.0`;
    case 'minor':
      return `${x}.${y + 1}.0`;
    default:
      // Leaving a prerelease behind is the point: 1.0.0-rc.2 → 1.0.0, not
      // 1.0.1-rc.2, which would claim to be a patch on a release that never
      // shipped.
      return prerelease ? `${x}.${y}.${z}` : `${x}.${y}.${z + 1}`;
  }
}

function parseArgs(argv) {
  if (argv.includes('--none')) return { mode: 'none' };

  const setIndex = argv.indexOf('--set');
  if (setIndex !== -1) {
    const value = argv[setIndex + 1];
    if (!value) throw new Error('--set needs a version, e.g. --set 1.2.0');
    if (!SEMVER.test(value)) throw new Error(`--set ${value} is not a semver version`);
    return { mode: 'set', value };
  }

  if (argv.includes('--major')) return { mode: 'release', release: 'major' };
  if (argv.includes('--minor')) return { mode: 'release', release: 'minor' };
  return { mode: 'release', release: 'patch' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = readFileSync(packagePath, 'utf8');
  const manifest = JSON.parse(raw);
  const current = manifest.version;

  if (args.mode === 'none') {
    console.log(`version unchanged at ${current}`);
    return;
  }

  const next = args.mode === 'set' ? args.value : bump(current, args.release);
  manifest.version = next;

  // Rewritten rather than string-patched so a hand-edited manifest cannot end up
  // with two `version` keys. npm's own two-space indent and trailing newline are
  // preserved, which keeps the diff to the one line that changed.
  writeFileSync(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`version ${current} → ${next}`);
}

try {
  main();
} catch (error) {
  console.error(`bump-version: ${error.message}`);
  process.exit(1);
}
