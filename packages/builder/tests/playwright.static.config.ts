/**
 * The DEPLOYED builder, not the dev one.
 *
 * Separate config because the target is genuinely a different artifact: `vite build` output
 * served flat at `/`, with no repo behind it and no dev endpoints. The main config's server
 * is Vite in dev with the repo root mounted — it cannot answer these questions.
 *
 * `reuseExistingServer: false`: a stale preview would serve a stale dist and the suite would
 * certify a build that no longer exists.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PORT = 5241;
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
    testMatch: ['static-build.spec.ts'],
    fullyParallel: true,
    workers: WORKERS,
    reporter: [['list']],
    timeout: 30_000,
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'off',
    },
    webServer: {
        command: `npm run build -- --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
