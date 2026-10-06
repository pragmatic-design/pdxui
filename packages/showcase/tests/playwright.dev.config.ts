/**
 * The showcase as `pdx dev` serves it.
 *
 * Every other spec in this package runs against the BUILD, deliberately and for the reasons
 * `playwright.config.ts` sets out. The cost of that is a blind spot: the reference application
 * could answer **404 on every route** in dev — including `/` — and no suite that never opens the
 * dev server would see it.
 *
 * So this config exists to keep one foot in the other mode, and it is deliberately small: what the
 * dev server has to do is serve the app's routes at all. Everything about the production output is
 * measured next door.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sessionFile } from './session';

const PORT = 5312;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
    testDir: '.',
    // `permissions-edit.spec.ts` edits the mock server's roles: here, on a server of its
    // own, so a revoked grant cannot race the build's specs that read it.
    testMatch: ['dev-server.spec.ts', 'permissions-edit.spec.ts'],
    fullyParallel: true,
    // Derived, not a literal, for the reason `playwright-worker-budget.test.ts` states: a number
    // that is a quarter of a 32-core machine is four times an 8-core laptop's budget. Five tests
    // against one dev server do not need much of it.
    workers: process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8)),
    reporter: [['list']],
    timeout: 30_000,
    // Signed in, as the build's suite is: the dev server's routes are behind the login too.
    globalSetup: './session.ts',
    use: { baseURL: `http://localhost:${PORT}`, trace: 'off', locale: 'en-US', storageState: sessionFile(PORT) },
    webServer: {
        // The dev server, with nothing built: no `vite build`, no preview. `--force` so a stale
        // dependency cache cannot answer for a plugin that has changed.
        command: `npx vite --port ${PORT} --strictPort --force --logLevel warn`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
