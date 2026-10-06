/**
 * The design score of the built showcase — a REPORT, never a gate.
 *
 * The score is a reading that sits next to the screenshots in a
 * design review, not a red light. A threshold on a number nobody agreed on is how a suite starts
 * getting skipped. So this config is run by one script, `pnpm design-score`, and by nothing else:
 * not `pnpm test`, not `certify`, not the pre-push hook.
 *
 * Its own directory, not `integration/`: the default config there collects every spec under it,
 * and this one needs the showcase's preview server to mean anything.
 *
 * The showcase is BUILT, as in its own suite, because what a visitor sees is the production output.
 * `reuseExistingServer: false` for the same reason the showcase gives: a stale preview serves a
 * stale dist.
 */
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const PORT = 5319;
const showcaseDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'showcase');

export default defineConfig({
    testDir: './design-score',
    fullyParallel: false,
    workers: 1,
    reporter: [['line']],
    timeout: 180_000,
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'off',
        // The same reason as the showcase suite: the app detects the visitor's language, and a score
        // taken in whatever language the machine is set to measures the machine.
        locale: 'en-US',
    },
    webServer: {
        command: `npx vite build --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        cwd: showcaseDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
