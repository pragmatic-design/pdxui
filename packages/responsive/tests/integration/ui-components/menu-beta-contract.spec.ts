// pdx-menu on the beta contract (#288): `open` is a model, so its own closes — Escape, a chosen entry —
// write it and announce `open-change` `{ value }`, which `::open` follows, in place of `pdx-close`; its
// open state is a custom state, `:state(open)` on the host; its panel and entries are parts; it is driven
// with `show()`, `close()` and `toggle()`, `closeAll()` gone; and a close gives the focus back to the
// element that had it when the menu opened. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const ITEMS = '[{"key":"cut","label":"Cut"},{"type":"separator","key":"s"},{"type":"label","key":"l","label":"More"},{"key":"copy","label":"Copy"}]';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const HOST = '#f pdx-menu';
const BASIC = `<pdx-menu items='${ITEMS}'></pdx-menu>`;

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the menu `sel` dispatches, from now on, and every alpha pdx-close. */
async function record(page: Page, sel = HOST): Promise<() => Promise<{ open: unknown[]; alpha: number }>> {
    await page.locator(sel).first().evaluate((host) => {
        const log = { open: [] as unknown[], alpha: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        host.addEventListener('open-change', (e) => log.open.push((e as CustomEvent).detail?.value));
        host.addEventListener('pdx-close', () => { log.alpha++; });
    });
    return () => page.evaluate(() => (window as unknown as { __log: { open: unknown[]; alpha: number } }).__log);
}

const call = (page: Page, method: string, sel = HOST) =>
    page.locator(sel).first().evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

const panel = (page: Page, sel = HOST) => page.locator(`${sel} [role="menu"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=menu-beta-contract'); });

test.describe('states', () => {
    test('control — a closed menu is in none of its states', async ({ page }) => {
        await mount(page, BASIC);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the menu shows, and not after it closes', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await call(page, 'close');
        await expect(panel(page)).toBeHidden();
        expect(await states(page)).toEqual([]);
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; closeAll() is gone', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await call(page, 'close');
        await expect(panel(page)).toBeHidden();
        await call(page, 'toggle');
        await expect(panel(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [true, false, true, false], alpha: 0 });
        expect(await page.locator(HOST).evaluate((h) => 'closeAll' in h)).toBe(false);
    });

    test('Escape and a chosen entry close it: open-change false each time, no pdx-close, and the open prop follows', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await expect(page.locator(`${HOST} [data-menu-key="cut"]`)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await page.locator(HOST).evaluate((h) => (h as unknown as { open: boolean }).open)).toBe(false);

        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await page.locator(`${HOST} [data-menu-key="copy"]`).click();
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [true, false, true, false], alpha: 0 });
    });

    test('::open bound to a signal follows Escape and a chosen entry; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-menu';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await expect(page.locator(`${bound} [data-menu-key="cut"]`)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.locator(`${bound} [data-menu-key="copy"]`).click();
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'a chosen entry wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(panel(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, and focus returns to that button when it closes', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, '#bound pdx-menu')).toBeVisible();
        await expect(page.locator('#bound [data-menu-key="cut"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, '#bound pdx-menu')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('parts', () => {
    test('the panel, its entries, separators and labels are reached by data-part', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['item', 'label', 'root', 'separator']);
        await expect(page.locator(`${HOST} [data-part="root"]`)).toHaveAttribute('role', 'menu');
        await expect(page.locator(`${HOST} [data-part="item"]`)).toHaveCount(2);
    });
});
