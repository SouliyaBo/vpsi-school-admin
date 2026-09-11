import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION, BUILD_COMMIT, BUILD_TIME, buildDate, buildLabel, versionLabel } from './build-info';

/**
 * The version stamp.
 *
 * Two things are worth testing here and nothing else is. The bump script is
 * arithmetic on a released number — get it wrong and a deploy claims to be a
 * version that already shipped — so it is exercised against a real file. The
 * reader is tested only for the property the footer depends on: that it renders
 * something rather than throwing, whatever the build did or did not stamp.
 */

const SCRIPT = join(process.cwd(), 'scripts', 'bump-version.mjs');

/** A throwaway package.json plus a copy of the script beside it. */
function sandbox(version: string): { dir: string; version: () => string; run: (...args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'bump-'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(SCRIPT, join(dir, 'scripts', 'bump-version.mjs'));
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: 'sandbox', version, scripts: { build: 'vite build' } }, null, 2)}\n`,
  );

  return {
    dir,
    version: () => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version as string,
    run: (...args: string[]) =>
      execFileSync('node', [join(dir, 'scripts', 'bump-version.mjs'), ...args], {
        encoding: 'utf8',
      }),
  };
}

describe('bump-version', () => {
  it('moves the patch on by default — every build gets a new number', () => {
    const box = sandbox('0.1.0');
    box.run();
    expect(box.version()).toBe('0.1.1');
  });

  it('bumps the same file repeatedly without drifting', () => {
    const box = sandbox('1.2.3');
    box.run();
    box.run();
    box.run();
    expect(box.version()).toBe('1.2.6');
  });

  it('zeroes the lower parts on a minor and a major', () => {
    const minor = sandbox('1.4.9');
    minor.run('--minor');
    expect(minor.version()).toBe('1.5.0');

    const major = sandbox('1.4.9');
    major.run('--major');
    expect(major.version()).toBe('2.0.0');
  });

  it('graduates a prerelease rather than patching it', () => {
    // 1.0.0-rc.2 → 1.0.0. Patching to 1.0.1-rc.2 would claim to fix a release
    // that never shipped.
    const box = sandbox('1.0.0-rc.2');
    box.run();
    expect(box.version()).toBe('1.0.0');
  });

  it('takes an explicit version', () => {
    const box = sandbox('0.1.0');
    box.run('--set', '2.0.0-rc.1');
    expect(box.version()).toBe('2.0.0-rc.1');
  });

  it('leaves the number alone with --none', () => {
    const box = sandbox('0.4.2');
    box.run('--none');
    expect(box.version()).toBe('0.4.2');
  });

  it('keeps every other field, and npm’s formatting', () => {
    const box = sandbox('0.1.0');
    box.run();

    const raw = readFileSync(join(box.dir, 'package.json'), 'utf8');
    expect(JSON.parse(raw).scripts.build).toBe('vite build');
    expect(raw.endsWith('}\n')).toBe(true);
    expect(raw).toContain('\n  "name"');
  });

  it('refuses a version it cannot reason about, rather than guessing', () => {
    const box = sandbox('not-a-version');
    expect(() => box.run()).toThrow();
    // And leaves the file as it found it.
    expect(box.version()).toBe('not-a-version');
  });

  it('refuses a --set value that is not semver', () => {
    const box = sandbox('0.1.0');
    expect(() => box.run('--set', 'latest')).toThrow();
    expect(box.version()).toBe('0.1.0');
  });
});

describe('build-info', () => {
  it('reports the very version package.json holds', () => {
    // The assertion that matters, and the one a shape check missed: an earlier
    // build stamped through a bare `define` global passed `/^\d+\.\d+\.\d+/`
    // while actually serving the '0.0.0' fallback, because the dev server never
    // substituted it. Comparing against the file is what catches that.
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      version: string;
    };

    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).not.toBe('0.0.0');
  });

  it('names the commit the build came from', () => {
    // A repo with no history would legitimately have none — but this one has.
    expect(BUILD_COMMIT).toMatch(/^[0-9a-f]{7,}(-dirty)?$/);
  });

  it('renders a label the footer can show', () => {
    expect(versionLabel()).toBe(`v${APP_VERSION}`);
    expect(buildLabel('en')).toContain(`v${APP_VERSION}`);
  });

  it('parses the build stamp into a date', () => {
    const date = buildDate();
    expect(BUILD_TIME).not.toBe('');
    expect(date).toBeInstanceOf(Date);
    expect(Number.isNaN(date!.getTime())).toBe(false);
  });
});
