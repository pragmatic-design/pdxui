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
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sessionFile } from './session';

const PORT = 5314;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
    testDir: '.',
    testMatch: ['first-paint.spec.ts', 'first-paint-http2.spec.ts', 'first-paint-waves.spec.ts'],
    fullyParallel: true,
    workers: process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8)),
    reporter: [['list']],
    timeout: 30_000,
    globalSetup: './session.ts',
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
