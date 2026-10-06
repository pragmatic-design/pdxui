/**
 * The screenshots for a design review.
 *
 * Not a test: nothing here passes or fails on how the app looks. It captures the screens a reviewer
 * judges against the reference, at the widths and schemes the review uses, so a review can be run
 * again after every round of changes and compared with the last one. Run with
 * `pnpm --filter @pdxui/showcase run review`.
 *
 * `*.capture.ts`, not `*.spec.ts`: the showcase suite collects every spec, and this is not one.
 * Its own port, so it can run while the suite does.
 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PORT = 5318;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
    testDir: '.',
    testMatch: ['*.capture.ts'],
    fullyParallel: false,
    workers: 1,
    reporter: [['line']],
    timeout: 600_000,
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'off',
        locale: 'en-US',
    },
    webServer: {
        command: `npx vite build --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
