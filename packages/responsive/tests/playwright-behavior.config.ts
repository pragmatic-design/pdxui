import { defineConfig } from '@playwright/test';

// Component coherence behavior suite (reactivity / invariants / enum / cross-prop). Isolated config
// and dir so it never touches the component-contract config owned elsewhere; shares the scenarios
// web server on :5220.
export default defineConfig({
    testDir: './integration/behavior',
    // By test, not by file, as the certify config does: by file, five files would mean five workers,
    // and `pnpm certify` runs this suite too. Every test mounts its own page.
    fullyParallel: true,
    timeout: 30_000,
    retries: process.env.CI ? 2 : 1,
    // A retry absorbs a cold start; it may not HIDE a flake.
    //
    // A run that reports `1 flaky` and exits 0 hides the failure from anyone who does not read the
    // log — a scenario server refusing a module request mid-run, say. A gate that goes green on a
    // failure it saw is not reporting. Measured on Playwright 1.58.2 with a test that fails on the
    // first attempt and passes on the second: exit 0 without this, exit 1 with it.
    failOnFlakyTests: true,
    reporter: 'line',
    use: {
        baseURL: 'http://localhost:5220',
        viewport: { width: 1280, height: 800 },
    },
    webServer: {
        command: 'npx vite --port 5220 --force',
        cwd: '../../ui/tests/scenarios',
        port: 5220,
        // Never a server this run did not start (see playwright-ui.config.ts). `test:certify`
        // runs this after the ui-components suite, whose server has stopped by then.
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
