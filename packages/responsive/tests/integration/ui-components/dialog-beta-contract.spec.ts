// pdx-dialog on the beta contract (#288): `open` is a model, so the dialog's own closes — Escape, its
// close button — announce `open-change` `{ value }` and `::open` follows them; its states are custom
// states, `:state(name)` on the host, and its backdrop and body carry no state attribute or class of
// their own; its pieces are parts. And the A-rule that applies (docs/language/beta/agents.md): A4,
// while loading the panel is `aria-busy`. Measured in Chromium: `:state()`, focus and the invoker
// command are not happy-dom's to tell.
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

const STATES = ['open', 'loading', 'scroll-top', 'scroll-bottom'];

/** The custom states of the dialog `sel` is, among STATES. */
const states = (page: Page, sel = '#f pdx-dialog') => page.locator(sel).first().evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), STATES);

/** Record every `open-change` the dialog `sel` dispatches, from now on, and every alpha pdx-close. */
async function record(page: Page, sel = '#f pdx-dialog'): Promise<() => Promise<{ open: unknown[]; alpha: number }>> {
    await page.locator(sel).first().evaluate((host) => {
        const log = { open: [] as unknown[], alpha: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        host.addEventListener('open-change', (e) => log.open.push((e as CustomEvent).detail?.value));
        host.addEventListener('pdx-close', () => { log.alpha++; });
    });
    return () => page.evaluate(() => (window as unknown as { __log: { open: unknown[]; alpha: number } }).__log);
}

const call = (page: Page, method: string, sel = '#f pdx-dialog') =>
    page.locator(sel).first().evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

const panel = (page: Page, sel = '#f pdx-dialog') => page.locator(`${sel} [data-part="root"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=dialog-beta-contract'); });

test.describe('states', () => {
    test('control — a closed dialog is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T"><p>x</p></pdx-dialog>');
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open), drawn from it: the backdrop shows, and carries no data-open', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T"><p>x</p></pdx-dialog>');
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open']);
        const backdrop = page.locator('#f pdx-dialog [data-part="backdrop"]');
        await expect.poll(() => backdrop.evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
        expect(await backdrop.evaluate((b) => b.hasAttribute('data-open'))).toBe(false);
    });

    test('loading is :state(loading), only while it is set', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T" loading><p>x</p></pdx-dialog>');
        expect(await states(page)).toEqual(['loading']);
        await page.locator('#f pdx-dialog').evaluate((el) => el.removeAttribute('loading'));
        await expect.poll(() => states(page)).toEqual([]);
    });

    test('a body with more below is :state(scroll-bottom); scrolled to its end, :state(scroll-top) — drawn on the body, with no class', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T" open><div style="height: 3000px">tall</div></pdx-dialog>');
        await expect.poll(() => states(page)).toEqual(['open', 'scroll-bottom']);
        const body = page.locator('#f pdx-dialog [data-part="body"]');
        const shadow = () => body.evaluate((b) => getComputedStyle(b).boxShadow);
        expect(await shadow()).not.toBe('none');
        await body.evaluate((b) => { b.scrollTop = b.scrollHeight; });
        await expect.poll(() => states(page)).toEqual(['open', 'scroll-top']);
        expect(await body.evaluate((b) => [...b.classList].filter((c) => c.startsWith('pdx-scroll')))).toEqual([]);
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false, and no pdx-close', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T"><p>x</p></pdx-dialog>');
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
        await mount(page, '<pdx-dialog title="T" open><button type="button">In</button></pdx-dialog>');
        await expect(panel(page)).toBeVisible();
        const log = await record(page);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [false], alpha: 0 });
        expect(await page.locator('#f pdx-dialog').evaluate((d) => (d as unknown as { open: boolean }).open)).toBe(false);
    });

    test('::open bound to a signal follows Escape and the close button; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-dialog';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.locator(`${bound} [data-part="close"]`).click();
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'the close button wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(panel(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, and focus returns to that button when it closes', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, '#bound pdx-dialog')).toBeVisible();
        await expect(page.locator('#bound pdx-dialog [data-test="inside"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, '#bound pdx-dialog')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('A-rules', () => {
    test('A4 — while loading the panel is aria-busy, and the host is not; after, neither is', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T" open loading><p>x</p></pdx-dialog>');
        await expect(panel(page)).toHaveAttribute('aria-busy', 'true');
        expect(await page.locator('#f pdx-dialog').getAttribute('aria-busy')).toBeNull();
        await page.locator('#f pdx-dialog').evaluate((el) => el.removeAttribute('loading'));
        await expect(panel(page)).not.toHaveAttribute('aria-busy', 'true');
    });
});

test.describe('parts', () => {
    test('the backdrop, the panel and its sections are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-dialog title="T" open><p>x</p><div slot="footer"><button type="button">OK</button></div></pdx-dialog>');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator('#f pdx-dialog [data-part]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['backdrop', 'body', 'close', 'footer', 'header', 'root']);
        await expect(panel(page)).toHaveAttribute('role', 'dialog');
    });
});
