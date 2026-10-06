/**
 * Open the builder once, on its readiness condition, before any test runs.
 *
 * Playwright's webServer is "ready" as soon as index.html answers, which is before Vite has
 * transformed the app's module graph — the builder, the engine, the whole @pdxui/ui barrel the
 * preview loads. The first navigation pays for all of it, and four workers ask at once. Alone that
 * is about a second. Inside `pnpm test`, with the other suites holding the CPU, the first four tests
 * take 19.7s (passing) and 30.1s (timing out) while the fifth test of the same file takes 1.0s:
 * the cost is the first navigation, not the builder.
 *
 * So it is paid here, once, with a generous budget of its own, and reported. The tests then
 * measure the builder. Not a longer test timeout and not retries: those would hide a slow page as
 * readily as a cold server.
 */
import { chromium, type FullConfig } from '@playwright/test';

const APP = '/packages/builder/index.html';
const BUDGET_MS = 180_000;

export default async function warmUp(config: FullConfig): Promise<void> {
    const baseURL = config.projects[0]?.use?.baseURL;
    if (!baseURL) throw new Error('warm-up: the Playwright config has no baseURL to open');
    const started = Date.now();
    const browser = await chromium.launch();
    try {
        const page = await browser.newPage();
        // Theme mode: the builder app and the theme engine.
        await page.goto(`${baseURL}${APP}?mode=theme&component=button&scenario=button-variants`, { timeout: BUDGET_MS });
        await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder, null, { timeout: BUDGET_MS });
        // Component mode: the preview frame, which loads the scenario page and the component library.
        await page.goto(`${baseURL}${APP}?component=button&scenario=button-variants`, { timeout: BUDGET_MS });
        await page.frameLocator('[data-test="preview"]').locator('html[data-pdx-ready]').waitFor({ state: 'attached', timeout: BUDGET_MS });
    } finally {
        await browser.close();
    }
    console.log(`[builder] warm-up: the app and its preview were ready in ${Date.now() - started} ms`);
}
