/**
 * The showcase's timed specs, on the build, with nothing else running (#606).
 *
 * `first-paint.spec.ts` and `first-paint-http2.spec.ts` hold budgets in milliseconds, and
 * `first-paint-waves.spec.ts` groups requests into round-trips by when they start. In the build suite
 * they ran beside its heavier specs, and measured the machine's load with the page: a median LCP of
 * 1928 ms against 1100 (runs 1048, 3068, 1928) in the pre-push, three waves where the page builds two,
 * on a tree that measured 1044 ms and two waves on its own — the same as `main`. Run here, after the
 * build suite, they share the machine with each other only, as they did when their budgets were set.
 *
 * The build is the same: `vite build` and `vite preview`, on a port of its own. The cap is the build
 * suite's, as `playwright-worker-budget.test.ts` asks.
 *
 * `ssg-pages.spec.ts` measures the generated showcase (#160) against that client build: what paints
 * first, how much shifts, when it answers. Here for the same reason the first-paint specs are, and its
 * site is generated and served by `ssg-site.ts`, a second global setup.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { suiteTimeout } from '../../../scripts/lib/suite-timeout.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sessionFile } from './session';

const PORT = 5314;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
    testDir: '.',
    testMatch: ['first-paint.spec.ts', 'first-paint-http2.spec.ts', 'first-paint-waves.spec.ts', 'ssg-pages.spec.ts'],
    fullyParallel: true,
    workers: process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8)),
    // The preview's sockets around a failed test, in sockets.jsonl, before the keeper copies it (#617).
    reporter: [['list'], ['../../../scripts/lib/socket-sampler.mjs'], ['../../../scripts/lib/keep-failed-runs.mjs']],
    // A run that stops moving fails instead of holding the pre-push (#1040). Slowest run measured:
    // 2.9 min, on CI, 2026-11-12 (1.5 min locally under the gate).
    globalTimeout: suiteTimeout(174),
    timeout: 30_000,
    globalSetup: ['./session.ts', './ssg-site.ts'],
    use: {
        baseURL: `http://localhost:${PORT}`,
        storageState: sessionFile(PORT),
        trace: 'retain-on-failure',
        locale: 'en-US',
    },
    webServer: {
        // As the build suite's: `--sourcemap hidden` keeps the JS the app ships byte for byte.
        command: `npx vite build --sourcemap hidden --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
