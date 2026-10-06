import { defineConfig } from '@playwright/test';
import { CERTIFY_EXCLUSIONS } from './certify-exclusions';

export default defineConfig({
    testDir: './integration/ui-components',
    // Everything in the folder runs, except what is listed — with a reason and an issue — in
    // certify-exclusions.ts. Naming the runners instead would leave every other spec here in no
    // gate; the exclusion list is the only way to leave one out, and a test in core fails if a spec
    // is neither run nor listed.
    testIgnore: CERTIFY_EXCLUSIONS.map((e) => `**/${e.file}`),
    // Parallelise by TEST, not by file.
    //
    // Unset, this defaults to false, and Playwright's unit of parallelism becomes the spec file.
    // Every runner here is one file holding hundreds or thousands of tests — manifest-contract 2444,
    // axe 1742 — so four runners mean four workers on a 32-core machine, and no `workers:` setting
    // can change that. Measured with --retries=0: 117 axe tests 1.0 min -> 20.2s, and the whole
    // certify suite 4371 tests 19.1 min -> 8.2 min.
    //
    // Stated rather than left to the default even though `true` IS a change from it: a config that
    // says nothing reads the same as a config that was decided, and a cap hides in it unnoticed.
    fullyParallel: true,
    timeout: 30_000,
    // 1 retry absorbs Vite's cold start (the first test after the webServer comes up may
    // render before the dependencies are optimised). The logic itself is deterministic.
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
        // cwd is already the scenarios dir → vite finds vite.config.ts there. (A --config on top
        // would double the path: packages/ui/ui/tests/scenarios → fail.)
        command: 'npx vite --port 5220 --force',
        cwd: '../../ui/tests/scenarios',
        port: 5220,
        // Never a server this run did not start: an orphan Vite left on 5220 by an earlier session
        // stays alive through hundreds of source changes, and certify would measure it.
        // A server already on the port stops the run at start ("already used") instead of
        // being measured. Stop it — `netstat -ano | findstr :5220`, then taskkill — and run again.
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
