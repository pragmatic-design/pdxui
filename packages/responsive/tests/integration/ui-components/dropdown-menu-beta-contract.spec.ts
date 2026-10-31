// pdx-dropdown-menu on the beta contract (#288): no model — the parent never writes whether it is open
// — so `open` is a custom state, `:state(open)` on the host, announced by `open-change` `{ value }`, a
// read-only output; it opens with `show()`, the overlay verb, and `open()` and the alpha handle
// `__dropdownMenu` are gone; its built-in button is the `trigger` part; and a close gives the focus
// back to the element that had it when the menu opened — an invoker that is not the trigger. Measured
// in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.padding = '24px';
        f.innerHTML = markup;
        document.body.appendChild(f);
        const dd = f.querySelector('pdx-dropdown-menu') as unknown as { items: unknown[] } | null;
        if (dd) dd.items = [{ key: 'edit', label: 'Edit' }, { key: 'copy', label: 'Copy' }];
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const HOST = '#f pdx-dropdown-menu';
const BASIC = '<pdx-dropdown-menu label="More"></pdx-dropdown-menu>';

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the dropdown `sel` dispatches, from now on. */
async function record(page: Page, sel = HOST): Promise<() => Promise<unknown[]>> {
    await page.locator(sel).first().evaluate((host) => {
        const log: unknown[] = [];
        (window as unknown as { __log: unknown[] }).__log = log;
        host.addEventListener('open-change', (e) => log.push((e as CustomEvent).detail?.value));
    });
    return () => page.evaluate(() => (window as unknown as { __log: unknown[] }).__log);
}

const call = (page: Page, method: string, sel = HOST) =>
    page.locator(sel).first().evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

// The menu is drawn on <body> while open, and is not in the document while closed.
const menu = (page: Page) => page.locator('body > pdx-menu [role="menu"]');
const trigger = (page: Page, sel = HOST) => page.locator(`${sel} > button`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=dropdown-menu-beta-contract'); });

test.describe('states', () => {
    test('control — a closed dropdown is in none of its states', async ({ page }) => {
        await mount(page, BASIC);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the menu shows, and not after Escape', async ({ page }) => {
        await mount(page, BASIC);
        await trigger(page).click();
        await expect(menu(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        expect(await states(page)).toEqual([]);
    });
});

test.describe('open, a read-only state', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; open() and __dropdownMenu are gone', async ({ page }) => {
        await mount(page, BASIC);
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
        expect(await page.locator(HOST).evaluate((h) => [typeof (h as unknown as { open?: unknown }).open, typeof (h as unknown as { __dropdownMenu?: unknown }).__dropdownMenu]))
            .toEqual(['undefined', 'undefined']);
    });

    test('its trigger, Escape and a chosen entry fire open-change; isOpen follows', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        const isOpen = () => page.locator(HOST).evaluate((h) => (h as unknown as { isOpen: boolean }).isOpen);
        await trigger(page).click();
        await expect(menu(page)).toBeVisible();
        expect(await isOpen()).toBe(true);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await trigger(page).click();
        await menu(page).getByRole('menuitem', { name: 'Copy' }).click();
        await expect(menu(page)).toHaveCount(0);
        expect(await isOpen()).toBe(false);
        expect(await log()).toEqual([true, false, true, false]);
    });

    test('a button with command="--show" opens it, and Escape gives focus back to that button, not to the trigger', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(menu(page)).toBeVisible();
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('body > pdx-menu'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(menu(page)).toHaveCount(0);
        await expect(opener).toBeFocused();
    });

    test('opened from its own trigger, Escape still gives focus back to the trigger', async ({ page }) => {
        await mount(page, BASIC);
        await trigger(page).focus();
        await page.keyboard.press('ArrowDown');
        await expect(menu(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(trigger(page)).toBeFocused();
    });
});

test.describe('parts', () => {
    test('its built-in button is the trigger part', async ({ page }) => {
        await mount(page, BASIC);
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}:${e.getAttribute('data-part')}`));
        expect(parts).toEqual(['button:trigger']);
    });
});
