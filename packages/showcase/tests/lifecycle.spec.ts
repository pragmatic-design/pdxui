/**
 * The lifecycle suite (docs/language/beta/lifecycle.md → «Acceptance cases»), in Chromium.
 *
 * Case 3, the composite: an `@if` removes a block holding `<input :ref="field" attach:probe>` and a
 * child component whose `@fetch` has not been answered. Removing it must reset the ref (#262), run
 * the attachment's cleanup once (#143) and dispose the child's fetch (#254): its request aborted, its
 * cache subscription released. Its three pieces each have their own tests; this checks them together.
 *
 * The fixture is a page of its own, `tests/fixtures/lifecycle/`, served by the dev server beside the
 * showcase — not one of its routes.
 */
import { test, expect } from './fixture';

type Lc = {
    signals: AbortSignal[];
    probe: string[];
    field: Element | null | undefined;
    core: { getDefaultCache(): { get(key: string): { subscribers: number } | undefined } };
};
declare global { interface Window { __lc: Lc } }

const FIXTURE = '/tests/fixtures/lifecycle/index.html';
const KEY = 'GET:/api/lc-never';

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => window.__lc?.probe.length === 1 && window.__lc.signals.length === 1);
});

test('attach:autofocus focuses its input once the page is up', async ({ page }) => {
    await expect(page.locator('input.auto')).toBeFocused();
});

test('case 3 — removing the block resets the ref, cleans the attachment up once, and disposes the child\'s @fetch', async ({ page }) => {
    const before = await page.evaluate((key) => ({
        field: window.__lc.field instanceof HTMLInputElement,
        subscribers: window.__lc.core.getDefaultCache().get(key)?.subscribers,
        aborted: window.__lc.signals[0].aborted,
    }), KEY);
    expect(before, 'control: the block is up — the ref holds the input, the fetch waits and is subscribed')
        .toEqual({ field: true, subscribers: 1, aborted: false });

    await page.locator('button.hide').click();
    await expect(page.locator('.block')).toHaveCount(0);

    await expect.poll(() => page.evaluate(() => window.__lc.field), { message: 'the ref still holds the removed input' }).toBeNull();
    expect(await page.evaluate(() => window.__lc.probe), 'the attachment did not clean up, or not once').toEqual(['run', 'clean']);
    expect(await page.evaluate(() => window.__lc.signals[0].aborted), 'the child\'s request outlived it').toBe(true);
    expect(await page.evaluate((key) => window.__lc.core.getDefaultCache().get(key)?.subscribers, KEY), 'the child still holds its cache key').toBe(0);
});
