/**
 * The showcase as it is BUILT, never as it is served in dev.
 *
 * Testing the dev server here would test the thing that already works. Everything this package
 * exists to measure — the bundle's size, what the production compiler did to the code, whether the
 * app runs at all once Rollup has been through it — is a property of `vite build` output.
 *
 * `reuseExistingServer: false`: a stale preview would serve a stale dist, and the suite would
 * certify a build that no longer exists. The same reason the builder's static config gives.
 */
import { cpus } from 'node:os';
import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sessionFile } from './session';

const PORT = 5311;
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Capped, and for the reason `packages/builder/tests/playwright.static.config.ts` sets out at
// length: `pnpm test` runs the browser suites one at a time but each still spawns its own workers,
// and a headless Chromium is worth more than one core. cores / 8.
const WORKERS = process.env.CI ? 1 : Math.max(1, Math.floor(cpus().length / 8));

export default defineConfig({
    testDir: '.',
    testMatch: ['*.spec.ts'],
    // …except the one that opens the DEV server, which has its own config and its own
    // `webServer`. Left in, this suite would run it against the preview and its two
    // assertions about which page modules are FETCHED would measure a bundle: no
    // `/src/pages/*.pdx` request exists there, so both fail on an empty list.
    // And the one that edits the mock server's roles, for the other reason: on this
    // shared server, a grant it revokes would race every spec that reads it.
    testIgnore: ['dev-server.spec.ts', 'permissions-edit.spec.ts'],
    fullyParallel: true,
    workers: WORKERS,
    reporter: [['list']],
    timeout: 30_000,
    // Every route is behind the login: the suite signs in once, and every context starts
    // signed in. A guest's spec says so with `test.use({ storageState: GUEST })`.
    globalSetup: './session.ts',
    use: {
        baseURL: `http://localhost:${PORT}`,
        storageState: sessionFile(PORT),
        // Kept for a FAILED test only. A failure in the gate that does not reproduce leaves nothing
        // to read but its last assertion. It costs nothing measurable: on the whole suite, 1.2 min
        // with it and without it, and the first-paint FCP it also measures unmoved (748 against
        // 752 ms).
        trace: 'retain-on-failure',
        // The app detects the visitor's language, so without this the suite asserts
        // against whatever language the machine running it happens to be set to — and every
        // assertion on a rendered string becomes a measurement of the developer's laptop. Pinned
        // here, and the i18n spec switches the language explicitly, which is the only place the
        // language is a subject rather than a background condition.
        locale: 'en-US',
    },
    webServer: {
        // `--sourcemap hidden` writes the `.map` files WITHOUT adding a `sourceMappingURL` comment
        // to the JS, so `entry-attribution.spec.ts` can name the modules in a chunk while
        // `bundle-budget.spec.ts` still weighs the bytes an app actually ships. Measured both ways,
        // JS total is 151.7 KB with and without. A plain `--sourcemap` costs 0.2 KB in
        // comments, which is small but is not the app.
        command: `npx vite build --sourcemap hidden --logLevel warn && npx vite preview --port ${PORT} --strictPort`,
        cwd: packageDir,
        url: `http://localhost:${PORT}/`,
        reuseExistingServer: false,
        timeout: 180_000,
    },
});
