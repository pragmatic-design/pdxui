// pdx-context-menu on the beta contract (#288): no model — the parent never writes whether it is open
// — so `open` is a custom state, `:state(open)` on the host, announced by `open-change` `{ value }`, a
// read-only output; it opens with `show(x, y)`, the overlay verb (`open(x, y)` is gone), at the area when
// no point is given, and `toggle()` is new; its panel, entries, separators and labels are parts; and a
// close from inside the menu gives the focus back to the element that had it when it opened — an invoker
// outside the area too. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const HOST = '#bound pdx-context-menu';
const AREA = '#bound [data-test="area"]';

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const states = (page: Page) => page.locator(HOST).evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the context menu dispatches, from now on. */
async function record(page: Page): Promise<() => Promise<unknown[]>> {
    await page.locator(HOST).evaluate((host) => {
        const log: unknown[] = [];
        (window as unknown as { __log: unknown[] }).__log = log;
        host.addEventListener('open-change', (e) => log.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __log: unknown[] }).__log);
}

const call = (page: Page, method: string, ...args: number[]) =>
    page.locator(HOST).evaluate((h, [m, a]) => (h as unknown as Record<string, (...x: number[]) => void>)[m as string](...(a as number[])), [method, args] as const);

// The panel is on <body>, one per context menu; this page has one.
const panel = (page: Page) => page.locator('body > .pdx-context-menu-panel');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=context-menu-beta-contract'); });

test.describe('states', () => {
    test('control — a closed context menu is in none of its states', async ({ page }) => {
        await mount(page);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the menu shows, and not after Escape', async ({ page }) => {
        await mount(page);
        await page.locator(AREA).click({ button: 'right' });
        await expect(panel(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await states(page)).toEqual([]);
    });
});

test.describe('open, a read-only state', () => {
    test('show(x, y), close() and toggle() drive it: open-change true, false, true, false; open() is gone', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        await call(page, 'show', 60, 60);
        await expect(panel(page)).toBeVisible();
        await call(page, 'show', 80, 80);
        await call(page, 'close');
        await expect(panel(page)).toBeHidden();
        await call(page, 'close');
        await call(page, 'toggle');
        await expect(panel(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(panel(page)).toBeHidden();
        expect(await log(), 'once each: a show() while open moves it and announces nothing').toEqual([true, false, true, false]);
        expect(await page.locator(HOST).evaluate((h) => typeof (h as unknown as { open?: unknown }).open)).toBe('undefined');
    });

    test('show(x, y) puts the menu at the point', async ({ page }) => {
        await mount(page);
        await call(page, 'show', 120, 90);
        await expect(panel(page)).toBeVisible();
        await expect.poll(() => panel(page).evaluate((p) => { const r = p.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; })).toEqual([120, 90]);
    });

    test('a right-click elsewhere closes it and opens it at the new point; a chosen entry closes it; isOpen follows', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        const isOpen = () => page.locator(HOST).evaluate((h) => (h as unknown as { isOpen: boolean }).isOpen);
        await page.locator(AREA).click({ button: 'right', position: { x: 10, y: 10 } });
        await expect(panel(page)).toBeVisible();
        const first = await panel(page).boundingBox();
        // A corner of the area the open menu (180 px wide, from x 10) does not cover. Its press is
        // outside the menu, which closes it; its `contextmenu` opens it again, there.
        await page.locator(AREA).click({ button: 'right', position: { x: 228, y: 100 } });
        expect(await isOpen()).toBe(true);
        await expect.poll(async () => (await panel(page).boundingBox())!.y).toBeGreaterThan(first!.y);
        await panel(page).getByRole('menuitem', { name: 'Copy' }).click();
        await expect(panel(page)).toBeHidden();
        expect(await isOpen()).toBe(false);
        expect(await log()).toEqual([true, false, true, false]);
    });

    test('a button with command="--show" opens it at the area, and Escape gives focus back to that button', async ({ page }) => {
        await mount(page);
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page)).toBeVisible();
        const [area, menu] = await Promise.all([page.locator(AREA).boundingBox(), panel(page).boundingBox()]);
        expect(menu!.x, 'opened over the area, not at 0,0').toBeGreaterThanOrEqual(area!.x);
        expect(menu!.y).toBeGreaterThanOrEqual(area!.y);
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.pdx-context-menu-panel'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('parts', () => {
    test('the panel is the root part; an entry, a separator and a label are parts', async ({ page }) => {
        await mount(page);
        await call(page, 'show', 60, 60);
        await expect(panel(page)).toBeVisible();
        expect(await panel(page).getAttribute('data-part')).toBe('root');
        const inside = await panel(page).evaluate((p) => [...p.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));
        expect(inside).toEqual(['item', 'separator', 'label', 'item']);
    });
});
