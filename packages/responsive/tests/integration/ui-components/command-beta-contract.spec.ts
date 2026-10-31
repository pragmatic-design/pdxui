// pdx-command on the beta contract (#288): `open` is a model, so its own opens and closes — Escape,
// the backdrop, a chosen command, the hotkey — announce `open-change` `{ value }` and `::open` follows
// them, in place of `pdx-open` and `pdx-close`; its open state is a custom state, `:state(open)` on the
// host, and the panel and backdrop carry no `data-open` of their own; its pieces are parts; its status
// region says something only while the palette is open (A4); `openPalette()` and `closePalette()` are
// gone. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const ITEMS = '[{"id":"a","label":"Alpha","group":"G"},{"id":"b","label":"Beta","group":"G"},{"id":"c","label":"Gamma"}]';

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

const HOST = '#f pdx-command';
const BASIC = `<pdx-command items='${ITEMS}'></pdx-command>`;

const states = (page: Page, sel = HOST) => page.locator(sel).first().evaluate((host) => ['open'].filter((n) => host.matches(`:state(${n})`)));

/** Record every `open-change` the palette `sel` dispatches, from now on, and every alpha pdx-open / pdx-close. */
async function record(page: Page, sel = HOST): Promise<() => Promise<{ open: unknown[]; alpha: number }>> {
    await page.locator(sel).first().evaluate((host) => {
        const log = { open: [] as unknown[], alpha: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        host.addEventListener('open-change', (e) => log.open.push((e as CustomEvent).detail?.value));
        host.addEventListener('pdx-open', () => { log.alpha++; });
        host.addEventListener('pdx-close', () => { log.alpha++; });
    });
    return () => page.evaluate(() => (window as unknown as { __log: { open: unknown[]; alpha: number } }).__log);
}

const call = (page: Page, method: string, sel = HOST) =>
    page.locator(sel).first().evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

// By its class, so each behaviour is measured on its own; the parts have a test of their own below.
const panel = (page: Page, sel = HOST) => page.locator(`${sel} .pdx-command`);
const status = (page: Page, sel = HOST) => page.locator(`${sel} [role="status"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=command-beta-contract'); });

test.describe('states', () => {
    test('control — a closed palette is in none of its states', async ({ page }) => {
        await mount(page, BASIC);
        expect(await states(page)).toEqual([]);
        await expect(panel(page)).toBeHidden();
    });

    test('open is :state(open), drawn from it: the panel shows, and neither it nor the backdrop carries data-open', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        expect(await states(page)).toEqual(['open']);
        const marked = await page.locator(HOST).evaluate((h) => h.querySelectorAll('[data-open]').length);
        expect(marked).toBe(0);
    });
});

test.describe('open, a model', () => {
    test('show(), close() and toggle() drive it: open-change true, false, true, false; no pdx-open or pdx-close, no openPalette()', async ({ page }) => {
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
        const aliases = await page.locator(HOST).evaluate((h) => ['openPalette', 'closePalette'].filter((n) => n in h));
        expect(aliases).toEqual([]);
    });

    test('Escape, the backdrop and a chosen command close it: open-change false each time, and the open prop follows', async ({ page }) => {
        await mount(page, BASIC);
        const log = await record(page);
        const isOpen = () => page.locator(HOST).evaluate((h) => (h as unknown as { open: boolean }).open);

        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel(page)).toBeHidden();
        expect(await isOpen()).toBe(false);

        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await page.locator(`${HOST} .pdx-command-backdrop`).click({ position: { x: 5, y: 5 } });
        await expect(panel(page)).toBeHidden();

        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(panel(page)).toBeHidden();

        expect(await log()).toEqual({ open: [true, false, true, false, true, false], alpha: 0 });
    });

    test('::open bound to a signal follows Escape and a chosen command; setting the signal opens and closes it', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const bound = '#bound pdx-command';
        const readOpen = () => page.evaluate(() => (window as unknown as { __gotcha: { readOpen(): boolean } }).__gotcha.readOpen());
        const setOpen = (v: boolean) => page.evaluate((x) => (window as unknown as { __gotcha: { setOpen(v: boolean): void } }).__gotcha.setOpen(x), v);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'Escape wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await page.locator(`${bound} [role="option"]`).first().click();
        await expect(panel(page, bound)).toBeHidden();
        expect(await readOpen(), 'a chosen command wrote the bound signal').toBe(false);

        await setOpen(true);
        await expect(panel(page, bound)).toBeVisible();
        await setOpen(false);
        await expect(panel(page, bound)).toBeHidden();
    });

    test('a button with command="--show" opens it, and focus returns to that button when it closes', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
        const opener = page.locator('[data-test="opener"]');
        await opener.click();
        await expect(panel(page, '#bound pdx-command')).toBeVisible();
        await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#bound pdx-command'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(panel(page, '#bound pdx-command')).toBeHidden();
        await expect(opener).toBeFocused();
    });
});

test.describe('A4', () => {
    test('the status region carries text only while the palette is open', async ({ page }) => {
        await mount(page, BASIC);
        await expect(status(page)).toHaveText('');
        await call(page, 'show');
        await expect(status(page)).not.toHaveText('');
        await call(page, 'close');
        await expect(status(page)).toHaveText('');
    });
});

test.describe('parts', () => {
    test('the backdrop, the panel, its input, list, groups, options and footer are reached by data-part', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await expect(panel(page)).toBeVisible();
        const parts = await page.locator(`${HOST} [data-part]`).evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['backdrop', 'footer', 'group', 'input', 'list', 'option', 'root']);
        await expect(page.locator(`${HOST} [data-part="root"]`)).toHaveAttribute('role', 'dialog');
        await expect(page.locator(`${HOST} [data-part="input"]`)).toHaveAttribute('role', 'combobox');
        await expect(page.locator(`${HOST} [data-part="list"]`)).toHaveAttribute('role', 'listbox');
        await expect(page.locator(`${HOST} [data-part="option"]`)).toHaveCount(3);
    });

    test('with nothing matching, the empty message is the empty part', async ({ page }) => {
        await mount(page, BASIC);
        await call(page, 'show');
        await page.locator(`${HOST} .pdx-command-input input`).fill('zzz');
        await expect(page.locator(`${HOST} [data-part="empty"]`)).toBeVisible();
    });
});
