/**
 * Edit to screen in development (#246): a spec that saves a `.pdx` while the dev server runs and
 * measures what reaches the open page.
 *
 * Its own server, and one spec run serially: the spec rewrites `src/pages/sites.pdx`, a page no
 * spec of the other dev config opens, and a test running beside it or a shared server would see the
 * edit in the middle of its own test. `hmr.spec.ts` is `serial`, which Playwright runs in one
 * worker whatever the cap below. `reuseExistingServer: false` for the reason the dev config gives: a
 * server left from before would answer with a plugin that has changed since.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sessionFile } from './session';

const PORT = 5313;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
    testDir: '.',
    testMatch: ['hmr.spec.ts'],
    fullyParallel: false,
    // Derived, as `playwright-worker-budget.test.ts` asks; the serial spec uses one of them.
    workers: process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8)),
    reporter: [['list']],
    timeout: 60_000,
    globalSetup: './session.ts',
    use: { baseURL: `http://localhost:${PORT}`, trace: 'off', locale: 'en-US', storageState: sessionFile(PORT) },
    webServer: {
        command: `npx vite --port ${PORT} --strictPort --force --logLevel warn`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
