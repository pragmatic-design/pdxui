// pdx-tooltip on the beta contract (#288): no model — the parent never writes its open state — so
// `open` is a custom state, `:state(open)` on the host, announced by `open-change` `{ value }`, a
// read-only output; the side it was placed on after flipping is a state too, `placed-<side>`, which
// draws the arrow; the floating element is the `root` part and the arrow the `arrow` part; it closes
// with `close()`, the overlay verb, and `hide()` is gone. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.padding = '48px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const HOST = '#f pdx-tooltip';
const BASIC = '<button type="button" data-test="trigger">Save</button><pdx-tooltip placement="bottom" text="Saves the draft" delay="0" hide-delay="0"></pdx-tooltip>';
const STATES = ['open', 'placed-top', 'placed-bottom', 'placed-left', 'placed-right'];

const states = (page: Page, sel = HOST) =>
    page.locator(sel).first().evaluate((host, names) => names.filter((n) => host.matches(`:state(${n})`)), STATES);

/** Record every `open-change` the tooltip `sel` dispatches, from now on. */
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

// By its class, so each behaviour is measured on its own; the parts have a test of their own below.
const float = (page: Page, sel = HOST) => page.locator(`${sel} .pdx-tooltip-float`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=tooltip-beta-contract'); });

test.describe('states', () => {
    test('control — a closed tooltip is in none of its states', async ({ page }) => {
        await mount(page, BASIC);
        expect(await states(page)).toEqual([]);
    });

    test('open and the side it was placed on are states while it shows, and neither after it hides', async ({ page }) => {
        await mount(page, BASIC);
        await page.locator('#f [data-test="trigger"]').hover();
        await expect(float(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open', 'placed-bottom']);
        await page.mouse.move(600, 500);
        await expect(float(page)).toBeHidden();
        expect(await states(page)).toEqual([]);
    });

    test('a tooltip that flips is in the state of the side it went to, and its arrow follows', async ({ page }) => {
        // A trigger at the top edge: `placement="top"` has no room and flips below.
        await mount(page, '<div style="position:fixed;top:0;left:200px"><button type="button" data-test="trigger">Top</button>'
            + '<pdx-tooltip placement="top" text="Flipped" delay="0" arrow></pdx-tooltip></div>');
        await call(page, 'show');
        await expect(float(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open', 'placed-bottom']);
        const r = await page.locator(HOST).evaluate((h) => {
            const f = h.querySelector('.pdx-tooltip-float')!.getBoundingClientRect();
            const a = h.querySelector('.pdx-tooltip-arrow')!.getBoundingClientRect();
            return { floatTop: f.top, arrowTop: a.top };
        });
        expect(r.arrowTop, 'the arrow points up, at the trigger above').toBeLessThan(r.floatTop);
    });

    test('the floating element carries no open attribute of its own: the state is the host\'s', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(float(page)).toBeVisible();
        await expect(float(page)).not.toHaveAttribute('data-visible', /.*/);
    });
});

test.describe('open, a read-only state', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; hide() is gone', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        await call(page, 'show');
        await expect(float(page)).toBeVisible();
        await call(page, 'show');
        await call(page, 'close');
        await expect(float(page)).toBeHidden();
        await call(page, 'close');
        await call(page, 'toggle');
        await expect(float(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(float(page)).toBeHidden();
        expect(await log(), 'once each, a repeated show() or close() announces nothing').toEqual([true, false, true, false]);
        expect(await page.locator(HOST).evaluate((h) => typeof (h as unknown as { hide?: unknown }).hide)).toBe('undefined');
    });

    test('hovering its trigger and leaving it fire open-change true then false', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        await page.locator('#f [data-test="trigger"]').hover();
        await expect(float(page)).toBeVisible();
        await page.mouse.move(600, 500);
        await expect(float(page)).toBeHidden();
        expect(await log()).toEqual([true, false]);
    });

    test('a button with command="--show" opens it, Escape closes it, and focus stays on that button', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-tooltip';
        const log = await record(page, bound);
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(float(page, bound)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(float(page, bound)).toBeHidden();
        await expect(opener).toBeFocused();
        expect(await log()).toEqual([true, false]);
    });
});

test.describe('parts', () => {
    test('the floating element is the root part, a tooltip, and the arrow is the arrow part', async ({ page }) => {
        await mount(page, BASIC.replace('delay="0"', 'delay="0" arrow'));
        await call(page, 'show');
        await expect(float(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-part')));
        expect(parts).toEqual(['root', 'arrow']);
        await expect(page.locator(`${HOST} [data-part="root"]`)).toHaveAttribute('role', 'tooltip');
    });
});
