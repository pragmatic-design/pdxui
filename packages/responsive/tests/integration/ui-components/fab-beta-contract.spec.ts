// pdx-fab on the beta contract (#288): no model — the parent never writes whether its speed dial is
// open — so `open` is a custom state, `:state(open)` on the host, announced by `open-change` `{ value }`,
// a read-only output; it opens with `show()`, the overlay verb, and `open()` is gone; the open look is
// drawn from the state, not from classes the component sets (`pdx-fab-open`, `pdx-fab-dial-open`,
// `pdx-fab-mask-visible`); and its pieces are parts. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const HOST = '#bound pdx-fab';

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const states = (page: Page) => page.locator(HOST).evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the FAB dispatches, from now on. */
async function record(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator(HOST).evaluate((host) => {
        const log: unknown[] = [];
        (window as unknown as { __log: unknown[] }).__log = log;
        host.addEventListener('open-change', (e) => log.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __log: unknown[] }).__log);
}

const call = (page: Page, method: string) =>
    page.locator(HOST).evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

const fab = (page: Page) => page.locator(`${HOST} .pdx-fab`);
/** Whether the dial shows: its first action is opaque. */
const dialShown = (page: Page) => page.locator(`${HOST} .pdx-fab-action-wrap`).first().evaluate((w) => getComputedStyle(w).opacity === '1');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=fab-beta-contract'); });

test.describe('states', () => {
    test('control — a closed FAB is in none of its states', async ({ page }) => {
        await mount(page);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the dial shows, and not after Escape', async ({ page }) => {
        await mount(page);
        await fab(page).click();
        await expect.poll(() => dialShown(page)).toBe(true);
        expect(await states(page)).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect.poll(() => dialShown(page)).toBe(false);
        expect(await states(page)).toEqual([]);
    });

    test('the open look is drawn from the state: the dial, the rotated icon and the mask, with none of the old classes set', async ({ page }) => {
        await mount(page);
        await call(page, 'show');
        await expect.poll(() => dialShown(page)).toBe(true);
        const look = await page.locator(HOST).evaluate((h) => ({
            classes: ['pdx-fab-open', 'pdx-fab-dial-open', 'pdx-fab-mask-visible'].filter((c) => h.querySelector(`.${c}`)),
            icon: getComputedStyle(h.querySelector('.pdx-fab-icon')!).transform,
            mask: getComputedStyle(h.querySelector('.pdx-fab-mask')!).opacity,
        }));
        expect(look.classes, 'the component sets no open class').toEqual([]);
        expect(look.icon, 'the icon turns 45°').not.toBe('none');
        await expect.poll(() => page.locator(`${HOST} .pdx-fab-mask`).evaluate((m) => getComputedStyle(m).opacity)).toBe('1');
    });
});

test.describe('open, a read-only state', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; open() is gone', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        await call(page, 'show');
        await call(page, 'show');
        await call(page, 'close');
        await call(page, 'close');
        await call(page, 'toggle');
        await call(page, 'toggle');
        expect(await log(), 'once each, a repeated show() or close() announces nothing').toEqual([true, false, true, false]);
        expect(await page.locator(HOST).evaluate((h) => typeof (h as unknown as { open?: unknown }).open)).toBe('undefined');
    });

    test('its button, Escape and a chosen action fire open-change; isOpen follows', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        const isOpen = () => page.locator(HOST).evaluate((h) => (h as unknown as { isOpen: boolean }).isOpen);
        await fab(page).click();
        expect(await isOpen()).toBe(true);
        await page.keyboard.press('Escape');
        await expect.poll(isOpen).toBe(false);
        await fab(page).click();
        await expect.poll(() => dialShown(page)).toBe(true);
        await page.locator(`${HOST} .pdx-fab-action[aria-label="Call"]`).click();
        expect(await isOpen()).toBe(false);
        expect(await log()).toEqual([true, false, true, false]);
    });

    test('a button with command="--show" opens it, and after Escape the focus is on that button', async ({ page }) => {
        await mount(page);
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect.poll(() => dialShown(page)).toBe(true);
        await page.keyboard.press('Escape');
        await expect.poll(() => dialShown(page)).toBe(false);
        await expect(opener).toBeFocused();
    });
});

test.describe('parts', () => {
    test('the button is the root part; the dial, an action, its label and the mask are parts', async ({ page }) => {
        await mount(page);
        const parts = await page.locator(HOST).evaluate((h) => [...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));
        expect(parts).toEqual(['mask', 'menu', 'item', 'label', 'item', 'label', 'root']);
    });
});
