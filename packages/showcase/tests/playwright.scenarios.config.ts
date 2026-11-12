/**
 * The scenario apps (#244): small apps beside the showcase, each built by its own Vite config before
 * the suite runs (`scenarios-build.ts`), and weighed by `scenario-budgets.spec.ts`.
 *
 * No web server: what is measured is the build on disk.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { suiteTimeout } from '../../../scripts/lib/suite-timeout.mjs';

// The same cap as the showcase's other configs: `pnpm test` runs the browser suites one at a time,
// and each decides how much of the machine it takes. cores / 8.
const WORKERS = process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8));

export default defineConfig({
    testDir: '.',
    testMatch: ['scenario-*.spec.ts'],
    fullyParallel: true,
    workers: WORKERS,
    reporter: [['list'], ['../../../scripts/lib/keep-failed-runs.mjs']],
    // A run that stops moving fails instead of holding the pre-push (#1040). Slowest run measured:
    // 5.4 min, on CI, 2026-11-12 (2.2 min locally under the gate).
    globalTimeout: suiteTimeout(324),
    timeout: 30_000,
    globalSetup: './scenarios-build.ts',
});
