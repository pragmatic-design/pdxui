import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './integration',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // A retry absorbs a cold start; it may not HIDE a flake.
    //
    // A run that reports `1 flaky` and exits 0 hides the failure from anyone who does not read the
    // log — a scenario server refusing a module request mid-run, say. A gate that goes green on a
    // failure it saw is not reporting. Measured on Playwright 1.58.2 with a test that fails on the
    // first attempt and passes on the second: exit 0 without this, exit 1 with it.
    failOnFlakyTests: true,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        trace: 'on-first-retry',
    },
});
