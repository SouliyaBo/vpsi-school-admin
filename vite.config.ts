import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import type { Plugin } from 'vite';
// From vitest/config rather than vite, so the `test` block below is typed.
import { defineConfig } from 'vitest/config';

/**
 * What the running app is allowed to say about itself.
 *
 * Read here, at config time, and inlined by `define` below — the browser has no
 * `package.json` and no git, so anything the footer wants to show has to be
 * baked in during the build.
 *
 * `version` is moved on by `scripts/bump-version.mjs`, which npm runs before
 * every build. The commit and the timestamp are not a release number and are
 * not bumped: they identify which build a given version came from, which is the
 * question that actually gets asked when two people report different behaviour
 * on "the same version".
 */
function buildInfo() {
  const { version } = JSON.parse(
    readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
  ) as { version: string };

  // A build from a tarball, a CI checkout without history, or a machine with no
  // git is still a valid build — it just cannot name a commit.
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    // The suffix matters more than it looks: a build made from uncommitted work
    // cannot be reproduced from its commit, and saying so here is cheaper than
    // discovering it during an incident.
    if (dirty) commit += '-dirty';
  } catch {
    commit = '';
  }

  return { version, commit, builtAt: new Date().toISOString() };
}

const build = buildInfo();

/*
 * Published to the app as ordinary `VITE_*` env vars.
 *
 * Set on `process.env` before Vite loads its environment, because that is the
 * one channel both modes actually read: a production build substitutes a
 * `define` key, but the dev server assembles `import.meta.env` from `loadEnv`
 * and never sees it — which is how the badge came to show v0.0.0 in dev while
 * `package.json` said 0.1.1. `loadEnv` picks up prefixed keys already on
 * `process.env`, so one assignment covers dev, build and vitest alike.
 *
 * A `.env` file cannot override these: this runs after dotenv would have, and
 * the build's own identity is not something a deployment gets to claim.
 */
process.env.VITE_APP_VERSION = build.version;
process.env.VITE_BUILD_COMMIT = build.commit;
process.env.VITE_BUILD_TIME = build.builtAt;

const PACKAGE_JSON = fileURLToPath(new URL('./package.json', import.meta.url));

/**
 * Restarts the dev server when `package.json` changes, so the version on screen
 * is the version in the file.
 *
 * `define` is evaluated once, when the config is loaded — the values above are
 * literals baked into every module Vite transforms after that. Vite reloads the
 * config by itself when `vite.config.ts` changes, but it has no reason to think
 * `package.json` feeds it, so without this a bumped version sits in the file
 * while the running page keeps showing the old one. Which is exactly the
 * confusion the badge exists to prevent.
 */
function restampVersionOnChange(): Plugin {
  return {
    name: 'restamp-version-on-change',
    // Dev only. A production build reads the file once and exits, so there is
    // nothing to watch.
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(PACKAGE_JSON);
      server.watcher.on('change', (file) => {
        // chokidar reports absolute paths, but compare on the basename too: a
        // symlinked or case-differing checkout would otherwise never match, and
        // the failure would be silent.
        if (file !== PACKAGE_JSON && !file.endsWith('package.json')) return;
        server.config.logger.info('package.json changed — restarting to restamp the version');
        void server.restart();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), restampVersionOnChange()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // The API whitelists http://localhost:5173 in CORS_ORIGINS, so the browser
    // talks to it directly — no dev proxy to keep in sync with production.
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
