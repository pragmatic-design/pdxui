// pdx-bottom-sheet on the beta contract (#288): `open` is a model, so its own closes — Escape, its
// close button, the backdrop, a swipe down — announce `open-change` `{ value }` and `::open` follows
// them; its states are custom states, `:state(name)` on the host, and the sheet and backdrop carry no
// `data-open` or `data-dragging` of their own; its pieces are parts. Measured in Chromium.
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

const STATES = ['open', 'dragging'];
const HOST = '#f pdx-bottom-sheet';

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), STATES);

/** Record every `open-change` the sheet `sel` dispatches, from now on, and every alpha pdx-close. */
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

const sheet = (page: Page, sel = HOST) => page.locator(`${sel} [data-part="root"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=bottom-sheet-beta-contract'); });

test.describe('states', () => {
    test('control — a closed sheet is in none of its states', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T"><p>x</p></pdx-bottom-sheet>');
        expect(await states(page)).toEqual([]);
    });

    test('open is :state(open), drawn from it: the sheet shows, and neither it nor the backdrop carries data-open', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T"><p>x</p></pdx-bottom-sheet>');
        await call(page, 'show');
        await expect(sheet(page)).toBeVisible();
        await expect.poll(() => states(page)).toEqual(['open']);
        const marked = await page.locator(HOST).evaluate((h) => [...h.querySelectorAll('[data-open], [data-dragging]')].length);
        expect(marked).toBe(0);
    });

    test('dragging the handle is :state(dragging), and the sheet follows with no transition; released, it is not', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T" open><p>x</p></pdx-bottom-sheet>');
        await expect(sheet(page)).toBeVisible();
        const handle = page.locator(`${HOST} [data-part="handle"]`);
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2, box.y - 40, { steps: 4 });
        expect(await states(page)).toEqual(['open', 'dragging']);
        expect(await sheet(page).evaluate((s) => getComputedStyle(s).transitionProperty)).toBe('none');
        await page.mouse.up();
        await expect.poll(() => states(page)).toEqual(['open']);
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false, and no pdx-close', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T"><p>x</p></pdx-bottom-sheet>');
        const log = await record(page);
        await call(page, 'show');
        await expect(sheet(page)).toBeVisible();
        await call(page, 'close');
        await expect(sheet(page)).toBeHidden();
        await call(page, 'toggle');
        await expect(sheet(page)).toBeVisible();
        await call(page, 'toggle');
        await expect(sheet(page)).toBeHidden();
        expect(await log()).toEqual({ open: [true, false, true, false], alpha: 0 });
    });

    test('Escape closes it: open-change false once, and the open prop follows', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T" open><button type="button">In</button></pdx-bottom-sheet>');
        await expect(sheet(page)).toBeVisible();
        const log = await record(page);
        await page.keyboard.press('Escape');
        await expect(sheet(page)).toBeHidden();
        expect(await log()).toEqual({ open: [false], alpha: 0 });
        expect(await page.locator(HOST).evaluate((d) => (d as unknown as { open: boolean }).open)).toBe(false);
    });

    test('::open bound to a signal follows Escape and the close button; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-bottom-sheet';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(sheet(page, bound)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(sheet(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(sheet(page, bound)).toBeVisible();
        await page.locator(`${bound} [data-part="close"]`).click();
        await expect(sheet(page, bound)).toBeHidden();
        expect(await readOpen(), 'the close button wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(sheet(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(sheet(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, and focus returns to that button when it closes', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(sheet(page, '#bound pdx-bottom-sheet')).toBeVisible();
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#bound pdx-bottom-sheet'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(sheet(page, '#bound pdx-bottom-sheet')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('parts', () => {
    test('the backdrop, the sheet, its handle, sections and close button are reached by data-part', async ({ page }) => {
        await mount(page, '<pdx-bottom-sheet label="T" open show-close><span slot="header">Title</span><p>x</p><div slot="footer"><button type="button">OK</button></div></pdx-bottom-sheet>');
        await expect(sheet(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['backdrop', 'body', 'close', 'footer', 'handle', 'header', 'root']);
        await expect(sheet(page)).toHaveAttribute('role', 'dialog');
        await expect(page.locator(`${HOST} [data-part="handle"]`)).toHaveAttribute('role', 'slider');
    });
});
