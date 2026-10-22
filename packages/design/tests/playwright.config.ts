import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';

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
        // A server of the repository's own, not `npx http-server`: nothing depends on that, so every
        // CI run downloaded it, and a slow registry failed the job before a test ran (#615).
        command: 'node static-server.mjs ../. 3333',
        port: 3333,
        reuseExistingServer: !process.env.CI,
    },
});
