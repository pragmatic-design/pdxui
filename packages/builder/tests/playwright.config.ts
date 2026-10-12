import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CUSTOM_THEMES_DIR, CUSTOM_THEMES_ENV } from './custom-themes-dir';

const PORT = 5230;
// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/…", which is not a
// usable cwd and makes the webServer spawn fail with a bare ENOENT.
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
    // The static-build suite targets `vite build` output on another port, under its own config.
    testIgnore: ['**/static-build.spec.ts'],
    // 102 navigations: the failure of one component must not hide the others.
    fullyParallel: true,
    workers: WORKERS,
    reporter: [['list']],
    timeout: 30_000,
    // The first navigation pays for Vite transforming the app; under the parallel gate that cost
    // exceeds a test's budget. Paid once, on the app's readiness condition — see warm-up.ts.
    globalSetup: resolve(packageDir, 'tests/warm-up.ts'),
    // The saved themes' directory goes away with the run (see custom-themes-dir.ts).
    globalTeardown: resolve(packageDir, 'tests/custom-themes-teardown.ts'),
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'off',
    },
    webServer: {
        command: 'npm run dev -- --port ' + PORT,
        cwd: packageDir,
        // A save writes here, not into packages/design/src/themes/custom/, which the design suite
        // serves in the same `pnpm test`.
        env: { [CUSTOM_THEMES_ENV]: CUSTOM_THEMES_DIR },
        url: `http://localhost:${PORT}/packages/builder/index.html`,
        reuseExistingServer: true,
        timeout: 60_000,
    },
});
