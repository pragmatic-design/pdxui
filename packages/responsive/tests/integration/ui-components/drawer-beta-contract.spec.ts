// pdx-drawer on the beta contract (#288): `open` is a model, so its own closes — Escape, its close
// button, the backdrop, a swipe — announce `open-change` `{ value }` and `::open` follows them; its
// states are custom states, `:state(name)` on the host; its pieces are parts. The one exception is the
// owner's decision A: when an ancestor traps fixed positioning the drawer moves its panel and backdrop
// under <body>, where a host `:state()` cannot reach them, and there they keep `data-open`. And A4:
// while loading the panel is `aria-busy`. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

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

const STATES = ['open', 'loading'];
const HOST = '#f pdx-drawer';

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), STATES);

/** Record every `open-change` the drawer `sel` dispatches, from now on, and every alpha pdx-close. */
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

// The panel is found by part and by its label, under the host or once moved under <body>: the page's
// other cases keep drawers of their own.
const panel = (page: Page, label = 'T') => page.locator(`[data-part="root"].pdx-drawer[aria-label="${label}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=drawer-beta-contract'); });

test.describe('states', () => {
    test('control — a closed drawer is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T"><p>x</p></pdx-drawer>');
        expect(await states(page)).toEqual([]);
    });

    test('open in place is :state(open), drawn from it: the panel shows, and neither it nor the backdrop carries data-open', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T"><p>x</p></pdx-drawer>');
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open']);
        const marked = await page.locator(HOST).evaluate((h) => [...h.querySelectorAll('[data-open]')].map((e) => e.className));
        expect(marked).toEqual([]);
    });

    test('loading is :state(loading), only while it is set', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T" loading><p>x</p></pdx-drawer>');
        expect(await states(page)).toEqual(['loading']);
        await page.locator(HOST).evaluate((el) => el.removeAttribute('loading'));
        await expect.poll(() => states(page)).toEqual([]);
    });

    test('the exception: moved under <body> by a transformed ancestor, the panel and backdrop keep data-open while open', async ({ page }) => {
        await mount(page, '<div style="transform: translateZ(0)"><pdx-drawer label="T"><p>x</p></pdx-drawer></div>');
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        expect(await panel(page).evaluate((p) => p.parentElement === document.body), 'the panel was not moved under <body>').toBe(true);
        expect(await states(page)).toEqual(['open']);
        await expect(panel(page)).toHaveAttribute('data-open', '');
        await expect(page.locator('body > [data-part="backdrop"].pdx-drawer-backdrop')).toHaveAttribute('data-open', '');
        await call(page, 'close');
        await expect(panel(page)).not.toHaveAttribute('data-open');
        await expect(panel(page)).toBeHidden();
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false, and no pdx-close', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T"><p>x</p></pdx-drawer>');
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
    });

    test('Escape closes it: open-change false once, and the open prop follows', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T" open><button type="button">In</button></pdx-drawer>');
        await expect(panel(page)).toBeVisible();
        const log = await record(page);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [false], alpha: 0 });
        expect(await page.locator(HOST).evaluate((d) => (d as unknown as { open: boolean }).open)).toBe(false);
    });

    test('::open bound to a signal follows Escape and the close button; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(panel(page, 'Bound')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel(page, 'Bound')).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, 'Bound')).toBeVisible();
        await page.locator('#bound pdx-drawer [data-part="close"]').click();
        await expect(panel(page, 'Bound')).toBeHidden();
        expect(await readOpen(), 'the close button wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, 'Bound')).toBeVisible();
        await setOpen(false);
        await expect(panel(page, 'Bound')).toBeHidden();
    });

    test('a button with command="--show" opens it, the panel takes the focus, and it returns to that button on close', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, 'Bound')).toBeVisible();
        await expect(panel(page, 'Bound')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, 'Bound')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('A-rules', () => {
    test('A4 — while loading the panel is aria-busy, and the host is not; after, neither is', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T" open loading><p>x</p></pdx-drawer>');
        await expect(panel(page)).toHaveAttribute('aria-busy', 'true');
        expect(await page.locator(HOST).getAttribute('aria-busy')).toBeNull();
        await page.locator(HOST).evaluate((el) => el.removeAttribute('loading'));
        await expect(panel(page)).not.toHaveAttribute('aria-busy', 'true');
    });
});

test.describe('parts', () => {
    test('the backdrop, the panel, its sections, the close button and the resize handle are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-drawer label="T" open resizable><span slot="header">Title</span><p>x</p><div slot="footer"><button type="button">OK</button></div></pdx-drawer>');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['backdrop', 'body', 'close', 'footer', 'header', 'resize', 'root']);
        await expect(panel(page)).toHaveAttribute('role', 'dialog');
    });
});
