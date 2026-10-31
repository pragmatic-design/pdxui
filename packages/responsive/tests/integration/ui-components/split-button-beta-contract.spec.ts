// pdx-split-button on the beta contract (#288): no model — the parent never writes whether its menu is
// open — so `open` is a custom state, `:state(open)` on the host, announced by `open-change` `{ value }`,
// a read-only output; it has the overlay verbs `show()`, `close()`, `toggle()`, which it had none of; A4 —
// while `loading`, the primary button is `aria-busy="true"`, and not otherwise; its pieces are parts; and
// a close gives the focus back to the element that had it when the menu opened. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const HOST = '#bound pdx-split-button';

async function mount(page: Page): Promise<void> {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const states = (page: Page) => page.locator(HOST).evaluate((host) => ['open', 'loading'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `name` event the split button dispatches, from now on. */
async function record(page: Page, name = 'open-change'): Promise<() => Promise<unknown[]>> {
    await page.locator(HOST).evaluate((host, n) => {
        const log: unknown[] = [];
        (window as unknown as { __log: unknown[] }).__log = log;
        host.addEventListener(n, (e) => log.push(n === 'open-change' ? (e as CustomEvent).detail?.value : n));
    }, name);
    return () => page.evaluate(() => (window as unknown as { __log: unknown[] }).__log);
}

const call = (page: Page, method: string) =>
    page.locator(HOST).evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);
const set = (page: Page, prop: string, value: unknown) =>
    page.locator(HOST).evaluate((h, [p, v]) => { (h as unknown as Record<string, unknown>)[p as string] = v; }, [prop, value] as const);
const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// The panel is on <body> while open, and not in the document while closed.
const menu = (page: Page) => page.locator('body > .pdx-split-button-panel');
const primary = (page: Page) => page.locator(`${HOST} .pdx-split-primary`);
const arrow = (page: Page) => page.locator(`${HOST} .pdx-split-arrow`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=split-button-beta-contract'); });

test.describe('states', () => {
    test('control — a closed, idle split button is in none of its states', async ({ page }) => {
        await mount(page);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the menu shows, and not after Escape', async ({ page }) => {
        await mount(page);
        await arrow(page).click();
        await expect(menu(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        expect(await states(page)).toEqual([]);
    });
});

test.describe('open, a read-only state', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        await call(page, 'show');
        await expect(menu(page)).toBeVisible();
        await call(page, 'show');
        await call(page, 'close');
        await expect(menu(page)).toHaveCount(0);
        await call(page, 'close');
        await call(page, 'toggle');
        await expect(menu(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(menu(page)).toHaveCount(0);
        expect(await log(), 'once each, a repeated show() or close() announces nothing').toEqual([true, false, true, false]);
    });

    test('its arrow, Escape and a chosen entry fire open-change; isOpen follows', async ({ page }) => {
        await mount(page);
        const log = await record(page);
        const isOpen = () => page.locator(HOST).evaluate((h) => (h as unknown as { isOpen: boolean }).isOpen);
        await arrow(page).click();
        expect(await isOpen()).toBe(true);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await arrow(page).click();
        await menu(page).getByRole('menuitem', { name: 'Save a copy' }).click();
        await expect(menu(page)).toHaveCount(0);
        expect(await isOpen()).toBe(false);
        expect(await log()).toEqual([true, false, true, false]);
    });

    test('a button with command="--show" opens it, and Escape gives focus back to that button, not to the arrow', async ({ page }) => {
        await mount(page);
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(menu(page)).toBeVisible();
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.pdx-split-button-panel'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await expect(opener).toBeFocused();
    });

    test('opened from its arrow, Escape still gives focus back to the arrow', async ({ page }) => {
        await mount(page);
        await arrow(page).click();
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(arrow(page)).toBeFocused();
    });
});

test.describe('A4 and loading', () => {
    test('while loading the primary button is aria-busy and the host is in :state(loading); not otherwise', async ({ page }) => {
        await mount(page);
        await expect(primary(page)).not.toHaveAttribute('aria-busy', /.*/);
        await set(page, 'loading', true);
        await frames(page);
        await expect(primary(page)).toHaveAttribute('aria-busy', 'true');
        expect(await states(page)).toEqual(['loading']);
        await set(page, 'loading', false);
        await frames(page);
        await expect(primary(page)).not.toHaveAttribute('aria-busy', /.*/);
        expect(await states(page)).toEqual([]);
    });

    test('a split button that started loading clicks once it has loaded, and one enabled later opens its menu', async ({ page }) => {
        await page.evaluate(() => {
            document.getElementById('bound')?.remove();
            const d = document.createElement('div');
            d.id = 'bound';
            d.innerHTML = '<pdx-split-button label="Save" loading disabled></pdx-split-button>';
            document.body.appendChild(d);
            (d.firstElementChild as unknown as { items: unknown[] }).items = [{ key: 'a', label: 'A' }];
        });
        await frames(page);
        await set(page, 'loading', false);
        await set(page, 'disabled', false);
        await frames(page);
        const clicks = await record(page, 'pdx-click');
        await primary(page).click();
        expect(await clicks(), 'the primary click is heard once loading is over').toEqual(['pdx-click']);
        await arrow(page).click();
        await expect(menu(page), 'the arrow opens once it is enabled').toBeVisible();
    });
});

test.describe('parts', () => {
    test('the group, the primary button and the arrow are parts; the menu, an entry and a separator too', async ({ page }) => {
        await mount(page);
        const own = await page.locator(HOST).evaluate((h) => [...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));
        expect(own).toEqual(['root', 'primary', 'trigger']);
        await call(page, 'show');
        await expect(menu(page)).toBeVisible();
        expect(await menu(page).getAttribute('data-part')).toBe('menu');
        const inside = await menu(page).evaluate((m) => [...m.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')));
        expect(inside).toEqual(['item', 'separator', 'item']);
    });
});
