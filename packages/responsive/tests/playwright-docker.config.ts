/**
 * The DETERMINISTIC Playwright config for Docker (local == CI).
 *
 * It runs the 5 manifest-driven runners inside the pinned official Playwright image
 * (fixed fonts + Chromium). The screenshot baselines carry the -docker-linux suffix and are to be
 * updated ONLY here (never from a Windows/macOS host), so that they are shareable and reproducible.
 *
 * Usage: `pnpm test:docker` (see tests/docker/run.mjs) — do NOT run it directly on the host
 * for the screenshots (it would generate platform-specific baselines nobody can share).
 *
 * NOTE: this `testMatch` is what CAN run in the container, not what normally does.
 * `run.mjs` defaults to `visual-runner fonts` — 1591 of these 5962 tests — because the other four
 * runners are what `pnpm certify` already runs in parallel on the host, and repeating them here at
 * `workers: 1` costs 96 minutes against 27. `run.mjs --all` restores the full list, which is the
 * point of keeping the match broad: the pinned image is how you check that Dim 1-4 agree inside it
 * too, when you actually want that.
 */
import { defineConfig } from '@playwright/test';
import { PIXEL_THRESHOLD, pixelTolerance } from './integration/visual-regression/pixel-threshold';

export default defineConfig({
    testDir: './integration',
    // Only the manifest-driven runners (theme-regression checks the showcase pages' structure, with
    // no screenshots, and runs with playwright-visual.config.ts)
    testMatch: [
        '**/manifest-contract.spec.ts',
        '**/axe-runner.spec.ts',
        '**/isolation-runner.spec.ts',
        '**/keyboard-runner.spec.ts',
        '**/visual-runner.spec.ts',
        // Not a runner: it checks the IMAGE the runners take their screenshots in. A screenshot
        // suite cannot catch a wrong typeface, because every baseline was taken in it and they all
        // agree with each other.
        '**/fonts.spec.ts',
    ],
    timeout: 30_000,
    retries: 0,
    // Parallelism here, and why.
    //
    // `fullyParallel` must be set: unset, it defaults to false, and Playwright's unit of parallelism
    // is the FILE. visual-runner.spec.ts holds all 1586 visual tests, so it would run in ONE worker
    // whatever `workers:` said, and 1, 4 and 8 workers would make no difference.
    //
    // With fullyParallel: true, measured with every run comparing against the committed
    // baselines — never --update-snapshots:
    //
    //   workers 1, fullyParallel off   15.3 min   1591 passed
    //   workers 4, fullyParallel on     3.4 min   1591 passed
    //   workers 4, fullyParallel on     3.3 min   1591 passed
    //
    // 3182 screenshot comparisons under genuine concurrency, zero diffs. Determinism comes from the
    // pinned image, animations: 'disabled', caret: 'hide' and scale: 'css' — not from running one at
    // a time.
    //
    // An explicit 4 rather than Playwright's default (half the cores): the default would behave
    // differently on CI and on each developer's machine, and screenshot baselines are exactly where
    // that should not vary.
    fullyParallel: true,
    workers: 4,
    reporter: [['line'], ['html', { open: 'never' }]],
    // One shared set of baselines: ALWAYS -docker-linux, never -darwin/-win32.
    // An explicit path under testDir (.../tests/integration) → predictable for the commit/cp.
    snapshotPathTemplate: '{testDir}/visual-regression/__screenshots__/{testFileName}/{arg}-docker-linux{ext}',
    use: {
        baseURL: 'http://localhost:5220',
        viewport: { width: 1280, height: 800 },
    },
    expect: {
        toHaveScreenshot: {
            // The visual runner passes this per test and so decides it in practice; this is the
            // floor for anything else that screenshots through this config.
            ...pixelTolerance(),
            // And how far a pixel's colour may move: measured, see pixel-threshold.ts.
            threshold: PIXEL_THRESHOLD,
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
        },
    },
    webServer: {
        command: 'npx vite --port 5220 --strictPort',
        cwd: '../../ui/tests/scenarios',
        port: 5220,
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
