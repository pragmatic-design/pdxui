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
// `pnpm test` runs the packages in PARALLEL, and four of them are Playwright suites (design, site,
// builder e2e, builder static). Playwright's default is half the logical cores — 16 on a 32-core
// machine — so the shared run could ask for ~64 browsers plus six vitest pools. What follows is not a
// slow suite: it is assertions timing out while their browser waits for a core.
//
// Uncapped, running only the three Playwright suites together produces
// `expect(locator).toHaveCount() failed / Timeout: 5000ms` in builder while design passes, or design
// losing 8 of 263 while builder passes. Which suite falls is the CPU lottery; the failure is always
// a TIMEOUT, never a wrong measurement.
//
// The cap is derived, not picked: cores / 8 — four concurrent suites, and a headless Chromium is
// worth more than one core. 4 on a 32-core machine, 1 on an 8-core one. It costs nothing in the
// shared run (design alone: 25s at the default, 45s at 4 — and 47-50s inside `pnpm test` either
// way), and it makes the number the same every time.
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
