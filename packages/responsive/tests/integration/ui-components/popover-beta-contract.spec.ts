// pdx-popover on the beta contract (#288): `open` is a model, so its own opens and closes — its
// trigger, Escape, a click outside — announce `open-change` `{ value }` and `::open` follows them, and
// setting it opens and closes the popover whatever its trigger mode; its open state is a custom state,
// `:state(open)` on the host; its panel is the `root` part; it closes with `close()`, the overlay verb,
// and `hide()` is gone. Measured in Chromium.
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
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const HOST = '#f pdx-popover';
const BASIC = '<button type="button" data-test="trigger">Open</button><pdx-popover><p>x</p><button type="button">In</button></pdx-popover>';

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the popover `sel` dispatches, from now on. */
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

// By its class, so each behaviour is measured on its own; the part has a test of its own below.
const panel = (page: Page, sel = HOST) => page.locator(`${sel} .pdx-popover-float`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=popover-beta-contract'); });

test.describe('states', () => {
    test('control — a closed popover is in none of its states', async ({ page }) => {
        await mount(page, BASIC);
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open) while the panel shows, and not after it closes', async ({ page }) => {
        await mount(page, BASIC);
        await page.locator('#f [data-test="trigger"]').click();
        await expect(panel(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await states(page)).toEqual([]);
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; hide() is gone', async ({ page }) => {
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
        expect(await log()).toEqual([true, false, true, false]);
        expect(await page.locator(HOST).evaluate((h) => typeof (h as unknown as { hide?: unknown }).hide)).toBe('undefined');
    });

    test('its trigger opens it and a click outside closes it: open-change each time, and the open prop follows', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        await page.locator('#f [data-test="trigger"]').click();
        await expect(panel(page)).toBeVisible();
        expect(await page.locator(HOST).evaluate((h) => (h as unknown as { open: boolean }).open)).toBe(true);
        await page.mouse.click(5, 5);
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual([true, false]);
        expect(await page.locator(HOST).evaluate((h) => (h as unknown as { open: boolean }).open)).toBe(false);
    });

    test('the open attribute opens a click popover: the model is not the manual mode\'s alone', async ({ page }) => {
        await mount(page, '<button type="button">Open</button><pdx-popover open><p>x</p></pdx-popover>');
        await expect(panel(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
    });

    test('::open bound to a signal follows its trigger, Escape and a click outside; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-popover';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await page.locator('#bound [data-test="trigger"]').click();
        await expect(panel(page, bound)).toBeVisible();
        expect(await readOpen(), 'the trigger wrote the bound signal').toBe(true);
        await page.keyboard.press('Escape');
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.mouse.click(5, 400);
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'a click outside wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(panel(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, and Escape gives focus back to that button, not to the trigger', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, '#bound pdx-popover')).toBeVisible();
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#bound pdx-popover'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(panel(page, '#bound pdx-popover')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('parts', () => {
    test('the panel is the root part, a dialog', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));
        expect(parts).toEqual(['root']);
        await expect(page.locator(`${HOST} [data-part="root"]`)).toHaveAttribute('role', 'dialog');
    });
});
