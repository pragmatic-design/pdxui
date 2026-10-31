// pdx-pagination on the beta contract (#289): `page` and `pageSize` are models, so a click on a page
// or a new size writes them and announces `page-change` / `page-size-change` `{ value }`, which
// `::page` follows, in place of `pdx-change`; a parent's write moves the pager and announces nothing;
// `goTo(n)` replaces `goto`, and the `currentPage` getter is gone because `page` is the property; the
// navigation, its buttons and its texts are parts; `next()` drives it from an invoker. Measured in
// Chromium.
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

type Log = { page: number[]; pageSize: number[]; alpha: number };

/** Record on window the model events and the count of `pdx-change` events of the pager. */
const listen = (page: Page) => page.evaluate(() => {
    const log: Log = { page: [], pageSize: [], alpha: 0 };
    (window as unknown as { __log: Log }).__log = log;
    const host = document.querySelector('#f pdx-pagination, #bound pdx-pagination')!;
    host.addEventListener('page-change', (e) => log.page.push((e as CustomEvent<{ value: number }>).detail.value));
    host.addEventListener('page-size-change', (e) => log.pageSize.push((e as CustomEvent<{ value: number }>).detail.value));
    host.addEventListener('pdx-change', () => { log.alpha++; });
});
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: Log }).__log);
const current = (page: Page) => page.locator('[aria-current="page"]');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=pagination-beta-contract'); });

test('a click on a page writes page and announces page-change { value }, and no pdx-change', async ({ page }) => {
    await mount(page, '<pdx-pagination total="100" page-size="10" page="1"></pdx-pagination>');
    await listen(page);
    await page.getByRole('button', { name: 'Page 2' }).click();
    await expect(current(page)).toHaveText('2');
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(current(page)).toHaveText('3');
    expect(await page.locator('#f pdx-pagination').evaluate((h) => (h as HTMLElement & { page: number }).page)).toBe(3);
    expect(await log(page)).toEqual({ page: [2, 3], pageSize: [], alpha: 0 });
});

test('a new page size writes pageSize and goes back to page 1, each announced by its model event', async ({ page }) => {
    await mount(page, '<pdx-pagination total="100" page-size="10" page="3" show-page-size></pdx-pagination>');
    await listen(page);
    await page.locator('#f .pdx-pagination-size .pdx-select-trigger').click();
    await page.getByRole('option', { name: '50' }).click();
    await expect(current(page)).toHaveText('1');
    const host = page.locator('#f pdx-pagination');
    expect(await host.evaluate((h) => { const p = h as HTMLElement & { page: number; pageSize: number }; return [p.page, p.pageSize]; })).toEqual([1, 50]);
    expect(await log(page)).toEqual({ page: [1], pageSize: [50], alpha: 0 });
});

test('::page bound to a signal follows a click; setting the signal moves the pager and announces nothing', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    const readValue = () => page.evaluate(() => (window as unknown as { __gotcha: { readValue(): number } }).__gotcha.readValue());
    const setValue = (v: number) => page.evaluate((x) => (window as unknown as { __gotcha: { setValue(v: number): void } }).__gotcha.setValue(x), v);
    await expect(current(page)).toHaveText('2');
    await listen(page);

    // Page 2 of 10 draws 1, 2, 3, …, 10.
    await page.getByRole('button', { name: 'Page 3' }).click();
    await expect.poll(readValue).toBe(3);

    await setValue(7);
    await expect(current(page)).toHaveText('7');
    expect(await log(page)).toEqual({ page: [3], pageSize: [], alpha: 0 });
});

test('a button with command="--next" moves to the next page', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await expect(current(page)).toHaveText('2');
    await page.locator('[data-test="next"]').click();
    await expect(current(page)).toHaveText('3');
});

test('goTo(n) moves to a page, clamped; goto and currentPage are gone', async ({ page }) => {
    await mount(page, '<pdx-pagination total="100" page-size="10" page="1"></pdx-pagination>');
    const host = page.locator('#f pdx-pagination');
    await host.evaluate((h) => (h as HTMLElement & { goTo(n: number): void }).goTo(5));
    await expect(current(page)).toHaveText('5');
    await host.evaluate((h) => (h as HTMLElement & { goTo(n: number): void }).goTo(99));
    await expect(current(page)).toHaveText('10');
    expect(await host.evaluate((h) => ['goto', 'currentPage'].filter((n) => n in h))).toEqual([]);
});

test('the navigation, its buttons and its texts are parts', async ({ page }) => {
    await mount(page, '<pdx-pagination total="200" page-size="10" page="10" show-total show-page-size></pdx-pagination>'
        + '<pdx-pagination total="100" page-size="10" page="3" simple></pdx-pagination>');
    const full = page.locator('#f pdx-pagination').first();
    // The pager's own, not the parts of the size select's inside.
    const parts = await full.locator('[data-part]').evaluateAll((els) => [...new Set(els
        .filter((e) => !e.parentElement?.closest('pdx-select'))
        .map((e) => e.getAttribute('data-part')))]);
    expect(parts.sort()).toEqual(['ellipsis', 'first', 'last', 'nav', 'next', 'page', 'prev', 'range', 'size'].sort());
    await expect(full.locator('[data-part="nav"]')).toHaveAttribute('role', 'navigation');
    await expect(full.locator('[data-part="page"][aria-current="page"]')).toHaveText('10');
    await expect(page.locator('#f pdx-pagination').nth(1).locator('[data-part="position"]')).toHaveText('3 / 10');
});
