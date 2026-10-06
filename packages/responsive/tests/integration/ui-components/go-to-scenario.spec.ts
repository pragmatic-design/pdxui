/**
 * A scenario page that never becomes ready says why.
 *
 * `goToScenario` waits for the page's `data-pdx-ready` flag. A timeout that says only that reads
 * "Timeout 10000ms exceeded" for a module that failed to load, a component that threw during setup
 * and a slow server alike, and cannot say whether a request failed or code threw. So it collects the
 * page's console errors, uncaught exceptions, failed requests and HTTP errors while it waits, and a
 * timeout carries them.
 */
import { test, expect } from './contracts/fixture';
import { goToScenario, openPage } from './contracts/measure';

/**
 * A module the page under test actually imports.
 *
 * Not the BARREL, `@pdxui/ui/src/index.ts`: a generated page imports one module per component it
 * renders and no barrel at all, so breaking that file breaks nothing, and both tests below go red on
 * their own first assertion — *"the page became ready: the route did not break it, nothing was
 * measured"* — which is the sentence a probe should say when it has stopped probing. `tier-1a`
 * holds the `icon-sizes` scenario, so this is its icon.
 */
const UI_ENTRY = '**/ui/src/icon/pdx-icon.ts*';
/**
 * What `touch-targets.html?c=input` loads for its case. The hand-written pages import no barrel
 * either.
 */
const TOUCH_INPUT = '**/ui/src/input/pdx-input.ts*';

test('a module that throws is named in the timeout', async ({ page }) => {
    await page.route(UI_ENTRY, (route) => route.fulfill({
        status: 200, contentType: 'text/javascript', body: "throw new Error('boom: the entry module failed to evaluate');",
    }));
    const err = await goToScenario(page, 'icon-sizes', 'neutral', { page: 'tier-1a', readyTimeout: 3000 })
        .then(() => null, (e: Error) => e);
    expect(err, 'the page became ready: the route did not break it, nothing was measured').not.toBeNull();
    expect(err!.message).toContain('boom: the entry module failed to evaluate');
    expect(err!.message).toContain('icon-sizes');
});

test('a module the server answers with an error status is named in the timeout', async ({ page }) => {
    // What a Vite dev server answers while it re-optimises its dependencies: 504 (Outdated Optimize Dep).
    await page.route(UI_ENTRY, (route) => route.fulfill({ status: 504, body: 'Outdated Optimize Dep' }));
    const err = await goToScenario(page, 'icon-sizes', 'neutral', { page: 'tier-1a', readyTimeout: 3000 })
        .then(() => null, (e: Error) => e);
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/HTTP 504 .*pdx-icon\.ts/);
});

// The specs that open their own pages (gotchas, touch targets, behavior) wait through `openPage`, and
// get the same report: a wait written by hand says only "waiting for locator".
test('openPage names a module that throws, under the url it opened', async ({ page }) => {
    await page.route(TOUCH_INPUT, (route) => route.fulfill({
        status: 200, contentType: 'text/javascript', body: "throw new Error('boom: the entry module failed to evaluate');",
    }));
    const err = await openPage(page, '/touch-targets.html?c=input', { timeout: 3000 }).then(() => null, (e: Error) => e);
    expect(err, 'the page became ready: the route did not break it, nothing was measured').not.toBeNull();
    expect(err!.message).toContain('boom: the entry module failed to evaluate');
    expect(err!.message).toContain('/touch-targets.html?c=input');
});

test('openPage names the error status a module was answered with', async ({ page }) => {
    await page.route(TOUCH_INPUT, (route) => route.fulfill({ status: 504, body: 'Outdated Optimize Dep' }));
    const err = await openPage(page, '/touch-targets.html?c=input', { timeout: 3000 }).then(() => null, (e: Error) => e);
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/HTTP 504 .*pdx-input\.ts/);
});

test('the control: openPage on the same page, untouched, resolves ready', async ({ page }) => {
    await openPage(page, '/touch-targets.html?c=input');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pdx-ready'))).toBe(true);
});

test('the control: the same page, untouched, becomes ready', async ({ page }) => {
    await goToScenario(page, 'icon-sizes', 'neutral', { page: 'tier-1a' });
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pdx-ready'))).toBe(true);
});
