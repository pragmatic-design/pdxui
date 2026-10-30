/**
 * The DEPLOYED site, not the dev one.
 *
 * This matters more here than anywhere else in the repository. The deployed site is a production
 * build: its route table goes in through the seam, its pages are split chunks, its templates take
 * the inline render path. `vite dev` runs none of that. A suite pointed at the dev server is blind to
 * a bug that breaks every page transition on pdxui.com, which is the definition of a check that
 * cannot fail.
 *
 * Same shape as `packages/builder/tests/playwright.static.config.ts`, for the same reason:
 * `reuseExistingServer: false`, because a preview left running from a previous build would certify
 * a dist that no longer exists.
 *
 * The build is part of the server command on purpose. `pnpm test` must not depend on someone having
 * run `pnpm build` first — a suite that silently measures yesterday's dist is worse than none.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PORT = 5251;
// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/…", which is not a usable cwd
// and makes the webServer spawn fail with a bare ENOENT.
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Workers, capped and stated.
//
// The reason has changed since the cap was set. It was set when `pnpm test` ran its packages in
// PARALLEL, four of them Playwright suites, and the shared run asked for ~64 browsers: assertions
// timed out while their browser waited for a core (`expect(locator).toHaveCount() failed / Timeout:
// 5000ms`, in one suite or another, run to run). Since then the browser half runs one package at a
// time (`test:browser`, `--workspace-concurrency=1`), so the suites no longer compete with each other.
//
// What keeps the cap is measured on the suite alone (site, 2026-10-12, 32 cores, #322): each test is
// CPU-bound, and more workers do not buy time. 4 workers: 212 s; 8 workers: 202 s, with every test
// taking twice as long; 16: ~156 s. A headless Chromium is worth more than one core, so cores / 8
// keeps each test at the speed it is written for — 4 on a 32-core machine, 1 on an 8-core one — and
// the number the same every time.
//
// NOT retries and NOT a bigger timeout: both hide the class of defect these suites exist to catch,
// and they erase the difference between "the machine was busy" and "the component broke".
//
// Stated rather than left to the default even though it IS a change from it — the same reason
// `fullyParallel` is spelled out: a config that says nothing reads exactly like a config that
// was decided.
const WORKERS = process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8));

export default defineConfig({
    testDir: '.',
    // 112 component pages: the failure of one must not hide the other 111.
    fullyParallel: true,
    workers: WORKERS,
    // A failed test's fixtures over 5 s go to slow-fixtures.txt, kept with its trace (#758).
    reporter: [['list'], ['./slow-fixtures-reporter.ts']],
    // The test's own: page creation has a timeout of its own, in fixture.ts (#758).
    timeout: 30_000,
    // The next run empties test-results/: a failed test's trace is copied out first.
    globalTeardown: './global-teardown.ts',
    use: {
        baseURL: `http://localhost:${PORT}`,
        // Kept for a FAILED test only, as the showcase does: a failure in the gate that does not
        // reproduce leaves nothing else to read but its last assertion. On the whole suite it
        // costs 3.7 min against 3.4-3.6 without.
        trace: 'retain-on-failure',
    },
    webServer: {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        // The build runs gen-api, gen-llms and vite build — measured at ~15s, with headroom for a
        // cold Vite cache.
        timeout: 180_000,
    },
});
