/**
 * The DEPLOYED site, not the dev one.
 *
 * This matters more here than anywhere else in the repository. The site runs the GENERATED router —
 * the switch-based module the plugin substitutes for `@pdxui/router` in a production build (the
 * dev/prod seam). `vite dev` never runs it. A suite pointed at the dev server is blind to a bug that
 * breaks every page transition on pdxui.com, which is the definition of a check that cannot fail.
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
// `pnpm test` runs the packages in PARALLEL, and four of them are Playwright suites (design, site,
// builder e2e, builder static). Playwright's default is half the logical cores — 16 on a 32-core
// machine — so the shared run could ask for ~64 browsers plus six vitest pools. What follows is not a
// slow suite: it is assertions timing out while their browser waits for a core.
//
// Uncapped, the three Playwright suites run together fail with
// `expect(locator).toHaveCount() failed / Timeout: 5000ms` in one suite while another passes, and
// which suite falls changes from run to run. It is the CPU lottery; the failure is always a TIMEOUT,
// never a wrong measurement.
//
// The cap is derived, not picked: cores / 8 — four concurrent suites, and a headless Chromium is
// worth more than one core. 4 on a 32-core machine, 1 on an 8-core one. It costs nothing in the
// shared run (design alone: 25s at the default, 45s at 4 — and 47-50s inside `pnpm test` without
// the cap), and it makes the number the same every time.
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
    reporter: [['list']],
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
