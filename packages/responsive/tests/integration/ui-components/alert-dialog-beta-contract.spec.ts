// pdx-alert-dialog on the beta contract (#288): `open` is a model, so Cancel, Confirm and Escape (with
// `close-on-escape`) announce `open-change` `{ value }` and `::open` follows them; `pdx-confirm` and
// `pdx-cancel` stay, as results. Its states are custom states, `:state(name)` on the host, and its
// backdrop carries no `data-open`; its pieces are parts. And A4: while loading the panel is
// `aria-busy`. Measured in Chromium: `:state()`, focus and the invoker command are not happy-dom's.
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
const HOST = '#f pdx-alert-dialog';

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), STATES);

/** Record every `open-change`, `pdx-confirm` and `pdx-cancel` the alert dialog `sel` dispatches, from now on. */
async function record(page: Page, sel = HOST): Promise<() => Promise<{ open: unknown[]; results: string[] }>> {
    await page.locator(sel).first().evaluate((host) => {
        const log = { open: [] as unknown[], results: [] as string[] };
        (window as unknown as { __log: typeof log }).__log = log;
        host.addEventListener('open-change', (e) => log.open.push((e as CustomEvent).detail?.value));
        for (const n of ['pdx-confirm', 'pdx-cancel']) host.addEventListener(n, () => log.results.push(n));
    });
    return () => page.evaluate(() => (window as unknown as { __log: { open: unknown[]; results: string[] } }).__log);
}

const call = (page: Page, method: string, sel = HOST) =>
    page.locator(sel).first().evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

const panel = (page: Page, sel = HOST) => page.locator(`${sel} [data-part="root"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=alert-dialog-beta-contract'); });

test.describe('states', () => {
    test('control — a closed alert dialog is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T"></pdx-alert-dialog>');
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open), drawn from it: the backdrop shows, and carries no data-open', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T"></pdx-alert-dialog>');
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open']);
        const backdrop = page.locator(`${HOST} [data-part="backdrop"]`);
        await expect.poll(() => backdrop.evaluate((b) => getComputedStyle(b).opacity)).toBe('1');
        expect(await backdrop.evaluate((b) => b.hasAttribute('data-open'))).toBe(false);
    });

    test('loading is :state(loading), only while it is set', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T" loading></pdx-alert-dialog>');
        expect(await states(page)).toEqual(['loading']);
        await page.locator(HOST).evaluate((el) => el.removeAttribute('loading'));
        await expect.poll(() => states(page)).toEqual([]);
    });
});

test.describe('open, a model', () => {
    test('Cancel closes it: open-change false and pdx-cancel, once each', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T" open></pdx-alert-dialog>');
        await expect(panel(page)).toBeVisible();
        const log = await record(page);
        await page.locator(`${HOST} [data-part="cancel"]`).click();
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [false], results: ['pdx-cancel'] });
    });

    test('Confirm closes it: open-change false and pdx-confirm, once each', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T" open></pdx-alert-dialog>');
        await expect(panel(page)).toBeVisible();
        const log = await record(page);
        await page.locator(`${HOST} [data-part="confirm"]`).click();
        await expect(panel(page)).toBeHidden();
        expect(await log()).toEqual({ open: [false], results: ['pdx-confirm'] });
    });

    test('show() and toggle() drive it: open-change true, false, true', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T"></pdx-alert-dialog>');
        const log = await record(page);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(panel(page)).toBeHidden();
        await call(page, 'toggle');
        await expect(panel(page)).toBeVisible();
        expect((await log()).open).toEqual([true, false, true]);
    });

    test('::open bound to a signal follows Cancel and Escape; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-alert-dialog';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.locator(`${bound} [data-part="cancel"]`).click();
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Cancel wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await expect(page.locator(`${bound} [data-part="cancel"]`)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(panel(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, Cancel takes the focus, and it returns to that button on close', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, '#bound pdx-alert-dialog')).toBeVisible();
        await expect(page.locator('#bound pdx-alert-dialog [data-part="cancel"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(panel(page, '#bound pdx-alert-dialog')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('A-rules', () => {
    test('A4 — while loading the panel is aria-busy, and the confirm is held back; after, neither', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T" open loading></pdx-alert-dialog>');
        await expect(panel(page)).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator(`${HOST} [data-part="confirm"]`)).toBeDisabled();
        await page.locator(HOST).evaluate((el) => el.removeAttribute('loading'));
        await expect(panel(page)).not.toHaveAttribute('aria-busy', 'true');
        await expect(page.locator(`${HOST} [data-part="confirm"]`)).toBeEnabled();
    });
});

test.describe('parts', () => {
    test('the backdrop, the panel, its sections, its buttons and the type-to-confirm field are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-alert-dialog title="T" open confirm-text="DELETE"></pdx-alert-dialog>');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['backdrop', 'body', 'cancel', 'confirm', 'confirm-input', 'footer', 'header', 'root']);
        await expect(panel(page)).toHaveAttribute('role', 'alertdialog');
    });
});
