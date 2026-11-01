// pdx-breadcrumb on the beta contract (#289): it holds no position of its own — the page you are on
// is its last crumb, `aria-current="page"` — so it has no model; the nav, the list, each crumb, its
// link or current page, the separators and the collapsed ellipsis are parts; the host carries no
// class; `pdx-select` stays on the breadcrumb. Measured in Chromium.
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

const ITEMS = JSON.stringify([
    { key: 'home', label: 'Home', href: '#home' },
    { key: 'products', label: 'Products' },
    { key: 'shoes', label: 'Shoes', href: '#shoes' },
    { key: 'detail', label: 'Detail' },
]);
const CRUMBS = (attrs = '') => `<pdx-breadcrumb items='${ITEMS}' ${attrs}></pdx-breadcrumb>`;
const part = (page: Page, name: string) => page.locator(`#f [data-part="${name}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=breadcrumb-beta-contract'); });

test('the nav, the list, each crumb, its link or the current page and the separators are parts', async ({ page }) => {
    await mount(page, CRUMBS());
    await expect(part(page, 'nav')).toHaveAttribute('aria-label', 'Breadcrumb');
    await expect(part(page, 'list')).toHaveAttribute('role', 'list');
    await expect(part(page, 'item')).toHaveCount(4);
    // A crumb with an href is a link; one without is a button, which pdx-select answers.
    expect(await part(page, 'link').evaluateAll((els) => els.map((e) => e.tagName))).toEqual(['A', 'BUTTON', 'A']);
    await expect(part(page, 'current')).toHaveText('Detail');
    await expect(part(page, 'current')).toHaveAttribute('aria-current', 'page');
    await expect(part(page, 'separator')).toHaveCount(3);
});

test('a collapsed trail draws the ellipsis as a part; expanding it gives focus to the first crumb it revealed', async ({ page }) => {
    await mount(page, CRUMBS('max-items="3"'));
    await expect(part(page, 'item')).toHaveCount(4); // Home, …, Shoes, Detail
    await part(page, 'ellipsis').click();
    await expect(part(page, 'ellipsis')).toHaveCount(0);
    await expect(part(page, 'item')).toHaveCount(4); // Home, Products, Shoes, Detail
    await expect(page.getByRole('button', { name: 'Products' })).toBeFocused();
});

test('the host carries no class it set itself', async ({ page }) => {
    await mount(page, CRUMBS());
    await expect(part(page, 'nav')).toBeVisible();
    expect(await page.locator('#f pdx-breadcrumb').getAttribute('class')).toBeNull();
});

test('pdx-select carries the crumb, on the breadcrumb, not past it', async ({ page }) => {
    await mount(page, CRUMBS());
    const heard = page.evaluate(() => new Promise<{ host: unknown; parent: number }>((resolve) => {
        const host = document.querySelector('#f pdx-breadcrumb')!;
        let parent = 0;
        host.parentElement!.addEventListener('pdx-select', () => { parent++; });
        host.addEventListener('pdx-select', (e) => {
            // After this dispatch: a bubbling event reaches the parent in the same one.
            queueMicrotask(() => resolve({ host: (e as CustomEvent<{ key: string }>).detail.key, parent }));
        });
    }));
    await page.getByRole('button', { name: 'Products' }).click();
    expect(await heard).toEqual({ host: 'products', parent: 0 });
});
