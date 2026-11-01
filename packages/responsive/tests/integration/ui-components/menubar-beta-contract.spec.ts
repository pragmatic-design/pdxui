// pdx-menubar on the beta contract (#289): the alpha handle `host.__menubar` is gone, `openMenu()` and
// `closeMenu()` are on the host; the class it set on its host goes, and a menu being open is the
// custom state `open`; the open menu's trigger is its `aria-expanded="true"`, with no `active` class;
// the bar, its triggers, the open panel and its entries are parts; `pdx-select` and `pdx-check` are
// declared and stay on the menubar. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for it to render. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        document.querySelectorAll('.pdx-menubar-panel').forEach((p) => p.remove());
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const ITEMS = JSON.stringify([
    { key: 'file', label: 'File', children: [
        { key: 'new', label: 'New' },
        { type: 'separator' },
        { type: 'label', label: 'Recent' },
        { key: 'wrap', label: 'Word wrap', type: 'checkbox', checked: false },
    ] },
    { key: 'edit', label: 'Edit', children: [{ key: 'undo', label: 'Undo' }] },
]);
const BAR = `<pdx-menubar items='${ITEMS}'></pdx-menubar>`;
const host = (page: Page) => page.locator('#f pdx-menubar');
const isOpen = (page: Page) => host(page).evaluate((h) => h.matches(':state(open)'));
const trigger = (page: Page, key: string) => page.locator(`#f [data-menubar-key="${key}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=menubar-beta-contract'); });

test('openMenu() and closeMenu() are on the host; the alpha __menubar handle is gone', async ({ page }) => {
    await mount(page, BAR);
    // Written by the menubar once it has built its bar: wait on it, not on a visible box.
    await expect(trigger(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    expect(await host(page).evaluate((h) => '__menubar' in h)).toBe(false);
    await host(page).evaluate((h) => (h as unknown as { openMenu(k: string): void }).openMenu('file'));
    await expect(page.locator('[data-part="panel"]')).toBeVisible();
    await host(page).evaluate((h) => (h as unknown as { closeMenu(): void }).closeMenu());
    await expect(page.locator('[data-part="panel"]')).toHaveCount(0);
});

test('a menu open is :state(open); its trigger is aria-expanded, drawn from it, with no class on the host or the trigger', async ({ page }) => {
    await mount(page, BAR);
    await expect(trigger(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    expect(await isOpen(page)).toBe(false);
    expect(await host(page).getAttribute('class')).toBeNull();
    const look = () => trigger(page, 'file').evaluate((t) => getComputedStyle(t).backgroundColor);
    const closedLook = await look();
    await trigger(page, 'file').click();
    await expect(trigger(page, 'file')).toHaveAttribute('aria-expanded', 'true');
    expect(await isOpen(page)).toBe(true);
    expect(await page.locator('#f .active').count()).toBe(0);
    // Away from the pointer, so the hover background is not what is measured.
    await page.mouse.move(0, 400);
    expect(await look()).not.toBe(closedLook);
    await page.keyboard.press('Escape');
    await expect(trigger(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    expect(await isOpen(page)).toBe(false);
});

test('the bar, its triggers, the open panel and its entries are parts', async ({ page }) => {
    await mount(page, BAR);
    await expect(page.locator('#f [data-part="trigger"]')).toHaveCount(2);
    await expect(page.locator('#f [data-part="bar"]')).toHaveAttribute('role', 'menubar');
    await trigger(page, 'file').click();
    const panel = page.locator('[data-part="panel"]');
    await expect(panel).toHaveAttribute('role', 'menu');
    await expect(panel.locator('[data-part="item"]')).toHaveCount(2);
    await expect(panel.locator('[data-part="separator"]')).toHaveCount(1);
    await expect(panel.locator('[data-part="label"]')).toHaveText('Recent');
});

test('pdx-select and pdx-check stay on the menubar', async ({ page }) => {
    await mount(page, BAR);
    await expect(trigger(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    await host(page).evaluate((h) => {
        const seen = { select: [] as string[], check: [] as string[], parent: 0 };
        (window as unknown as { __seen: typeof seen }).__seen = seen;
        for (const n of ['pdx-select', 'pdx-check']) h.parentElement!.addEventListener(n, () => { seen.parent++; });
        h.addEventListener('pdx-select', (e) => { seen.select.push((e as CustomEvent<{ key: string }>).detail.key); });
        h.addEventListener('pdx-check', (e) => { seen.check.push((e as CustomEvent<{ key: string }>).detail.key); });
    });
    await trigger(page, 'file').click();
    await page.locator('[data-part="panel"] [data-menu-key="wrap"]').click();
    // A checkbox entry leaves the menu open; openMenu() opens it if it closed, and does nothing if not.
    await host(page).evaluate((h) => (h as unknown as { openMenu(k: string): void }).openMenu('file'));
    await page.locator('[data-part="panel"] [data-menu-key="new"]').click();
    const seen = await page.evaluate(() => (window as unknown as { __seen: unknown }).__seen);
    expect(seen).toEqual({ select: ['new'], check: ['wrap'], parent: 0 });
});
