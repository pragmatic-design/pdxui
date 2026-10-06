import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';

// Workers, capped and stated.
//
// `pnpm test` runs the packages in PARALLEL, and four of them are Playwright suites (design, site,
// builder e2e, builder static). Playwright's default is half the logical cores — 16 on a 32-core
// machine — so the shared run could ask for ~64 browsers plus six vitest pools. What follows is not a
// slow suite: it is assertions timing out while their browser waits for a core.
//
// Uncapped, running only the three Playwright suites together produces
// `expect(locator).toHaveCount() failed / Timeout: 5000ms` in one suite or another — builder in one
// run, design (8 of 263) in another. Which suite falls is the CPU lottery; the failure is always a
// TIMEOUT, never a wrong measurement.
//
// The cap is derived, not picked: cores / 8 — four concurrent suites, and a headless Chromium is
// worth more than one core. 4 on a 32-core machine, 1 on an 8-core one. It costs nothing in the
// shared run (design alone: 25s at the default, 45s at 4 — and 47-50s uncapped inside
// `pnpm test`), and it makes the number the same every time.
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
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // A retry absorbs a cold start; it may not HIDE a flake.
    //
    // Without it, a run that reports `1 flaky` exits 0: the failure is invisible unless somebody
    // reads the log, and it can say that the scenario server refused a module request mid-run. A
    // gate that goes green on a failure it saw is not reporting. Measured on Playwright 1.58.2 with
    // a test that fails on the first attempt and passes on the second: exit 0 without this, exit 1
    // with it.
    failOnFlakyTests: true,
    workers: WORKERS,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3333',
        trace: 'on-first-retry',
    },
    webServer: {
        command: 'npx http-server ../. -p 3333 -s -c-1',
        port: 3333,
        reuseExistingServer: !process.env.CI,
    },
});
