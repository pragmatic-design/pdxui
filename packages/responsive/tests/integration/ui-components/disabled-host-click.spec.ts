// A disabled or loading pdx-button delivers no click to the handler an app binds on it.
//
// The component disables its inner <button>, and the app's `@click` sits on the host. Without a
// guard, a click on a disabled «Next» on the last photo gives «Photo 4 of 3»; with `loading`, a double
// tap on «Save» saves twice. Measured here with real mouse clicks in Chromium, where a click on a
// disabled control still reaches its ancestors — the environment happy-dom cannot reproduce.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const BASE = '/gotchas.html?case=disabled-host-click';
type Counts = { disabled: number; loading: number; enabled: number; 'toggle-disabled': number; 'toggle-enabled': number };

async function open(page: Page): Promise<void> {
    await openPage(page, BASE);
    await page.waitForSelector('[data-test="enabled"] button');
    await page.waitForSelector('[data-test="toggle-enabled"] button');
}

const counts = (page: Page): Promise<Counts> =>
    page.evaluate(() => (window as unknown as { __gotcha: { read(): Counts } }).__gotcha.read());

/** A real click on the inner button: at its centre, and 2px inside its top-left corner. */
async function clickAt(page: Page, which: keyof Counts, where: 'centre' | 'edge'): Promise<void> {
    const box = await page.locator(`[data-test="${which}"] button`).boundingBox();
    if (!box) throw new Error(`${which}: no box`);
    const x = where === 'centre' ? box.x + box.width / 2 : box.x + 2;
    const y = where === 'centre' ? box.y + box.height / 2 : box.y + 2;
    await page.mouse.click(x, y);
}

test.describe('pdx-button disabled / loading: no click reaches the host listener', () => {
    for (const which of ['disabled', 'loading'] as const) {
        for (const where of ['centre', 'edge'] as const) {
            test(`${which}, a real click at its ${where}`, async ({ page }) => {
                await open(page);
                await clickAt(page, which, where);
                // Settle one frame so a late dispatch would be counted.
                await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
                expect((await counts(page))[which], `${which}: the click reached the host`).toBe(0);
            });
        }
    }

    test('control — the enabled button delivers exactly one click', async ({ page }) => {
        await open(page);
        await clickAt(page, 'enabled', 'centre');
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
        expect((await counts(page)).enabled).toBe(1);
    });
});

// pdx-toggle is covered by the browser for the common paths: the design CSS gives the
// disabled inner button `pointer-events: none`, and the host is form-associated, so with `disabled`
// Chromium treats it as a disabled control and `host.click()` does nothing. Both pass with or
// without the guard. What the guard adds is a click event dispatched on the host
// (`dispatchEvent`, as a test harness or a script does), which neither rule stops.
const hostClick = (page: Page, which: keyof Counts): Promise<void> =>
    // The braces matter: `dispatchEvent` returns a boolean (was the event cancelled), and
    // returning it would make this a `Promise<boolean>` behind a `Promise<void>` annotation. Nobody reads
    // it — what the click did is measured by the counters.
    page.locator(`[data-test="${which}"]`).evaluate((el) => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

test.describe('pdx-toggle disabled: no click reaches the host listener', () => {
    for (const where of ['centre', 'edge'] as const) {
        test(`disabled, a real click at its ${where}`, async ({ page }) => {
            await open(page);
            await clickAt(page, 'toggle-disabled', where);
            await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
            expect((await counts(page))['toggle-disabled'], 'the click reached the host').toBe(0);
        });
    }

    test('disabled, a click dispatched on the host', async ({ page }) => {
        await open(page);
        await hostClick(page, 'toggle-disabled');
        expect((await counts(page))['toggle-disabled'], 'the click reached the host listener').toBe(0);
    });

    test('control — the enabled toggle delivers exactly one click, real or dispatched', async ({ page }) => {
        await open(page);
        await clickAt(page, 'toggle-enabled', 'centre');
        await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
        expect((await counts(page))['toggle-enabled']).toBe(1);
        await hostClick(page, 'toggle-enabled');
        expect((await counts(page))['toggle-enabled']).toBe(2);
    });
});
