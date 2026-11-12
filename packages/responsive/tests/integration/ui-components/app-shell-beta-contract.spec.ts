// pdx-app-shell (#1023), measured in a browser. The shell draws an app's navigation model:
// - a rail of the reader's own entries (home, favourites, recents);
// - a catalogue of every entry the reader may see, searchable;
// - a choice that goes through the router when one runs;
// - favourites and recents kept in storage;
// - a modal drawer below 600px.
// The router is played by the gotchas page: `__gotcha.router()` names a path and a navigator in core,
// as `createRouter` does.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const ITEMS = [
    { key: 'work', label: 'Work', items: [
        { key: 'tickets', label: 'Tickets', href: '/tickets', icon: 'list', badge: 12 },
        { key: 'board', label: 'Board', href: '/board', icon: 'grid' },
        { key: 'billing', label: 'Billing', href: '/billing', icon: 'credit-card', permission: 'billing.read' },
    ] },
    { key: 'admin', label: 'Settings', items: [
        { key: 'settings', label: 'Impostazioni città', href: '/settings', icon: 'settings', exact: false },
    ] },
];
const HOME = { key: 'home', label: 'Dashboard', href: '/', icon: 'home' };

/** Put a shell in a fresh <div id="f">, with the model above, and wait for it to render. */
async function mount(page: Page, attrs = ''): Promise<void> {
    await page.evaluate(async ({ items, home, attrs }) => {
        const markup = `<pdx-app-shell storage-key="t-shell" ${attrs}><span slot="brand">PDX</span><span slot="bar" data-test="title">Title</span><p data-test="page">Page</p></pdx-app-shell>`;
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        const shell = f.firstElementChild as HTMLElement & { items: unknown; home: unknown; defaultFavourites: unknown };
        shell.items = items;
        shell.home = home;
        shell.defaultFavourites = ['tickets'];
        document.body.appendChild(f);
    }, { items: ITEMS, home: HOME, attrs });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

const gotcha = (page: Page, call: string, arg?: unknown) =>
    page.evaluate(({ call, arg }) => (window as unknown as { __gotcha: Record<string, (a?: unknown) => unknown> }).__gotcha[call](arg), { call, arg });

const rail = (page: Page) => page.locator('#f [data-part="railNav"]');
const catalog = (page: Page) => page.locator('#f [data-part="catalog"]');

test.beforeEach(async ({ page }) => {
    await openPage(page, '/gotchas.html?case=app-shell-beta-contract');
    await page.evaluate(() => localStorage.clear());
    await gotcha(page, 'setPermissions', []);
    await gotcha(page, 'router');
    await gotcha(page, 'goTo', '/');
});

test('the rail holds home and the first visit\'s favourites; the page and the bar are the slots', async ({ page }) => {
    await mount(page);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Tickets/ })).toBeVisible();
    await expect(page.locator('#f [data-test="page"]')).toBeVisible();
    await expect(page.locator('#f [data-part="bar"] [data-test="title"]')).toBeVisible();
});

test('an entry whose permission is not granted is not in the catalogue, and appears once it is', async ({ page }) => {
    await mount(page);
    await page.locator('#f [data-part="allButton"]').click();
    await expect(catalog(page).getByRole('link', { name: 'Billing' })).toHaveCount(0);
    await gotcha(page, 'setPermissions', ['billing.read']);
    await expect(catalog(page).getByRole('link', { name: 'Billing' })).toBeVisible();
});

test('the entry of the current path is the current page in the rail; a record lights its list', async ({ page }) => {
    await mount(page);
    await gotcha(page, 'goTo', '/tickets/42');
    await expect(rail(page).locator('[aria-current="page"]')).toHaveText(/Tickets/);
});

test('a choice goes through the router, not a page load, and the list becomes a recent', async ({ page }) => {
    await mount(page);
    await page.locator('#f [data-part="allButton"]').click();
    await catalog(page).getByRole('link', { name: 'Board', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __gotcha: { navigated: string[] } }).__gotcha.navigated)).toEqual(['/board']);
    await expect(catalog(page)).toBeHidden();
    // The router's path moved, and the shell noted the visit.
    await expect(rail(page).getByRole('link', { name: 'Board', exact: true })).toBeVisible();
    await expect(rail(page).locator('[aria-current="page"]')).toHaveText(/Board/);
});

test('before-navigate is cancelable: refused, the router is not asked, and the catalogue still closes', async ({ page }) => {
    await mount(page);
    await page.locator('#f pdx-app-shell').evaluate((h) => h.addEventListener('before-navigate', (e) => {
        (window as unknown as { __asked: unknown }).__asked = (e as CustomEvent).detail;
        e.preventDefault();
    }));
    await page.locator('#f [data-part="allButton"]').click();
    await catalog(page).getByRole('link', { name: 'Board', exact: true }).click();
    expect(await page.evaluate(() => (window as unknown as { __asked: unknown }).__asked)).toEqual({ key: 'board', href: '/board' });
    expect(await page.evaluate(() => (window as unknown as { __gotcha: { navigated: string[] } }).__gotcha.navigated)).toEqual([]);
    await expect(catalog(page)).toBeHidden();
});

test('a pin in the catalogue makes a favourite, kept across a new mount', async ({ page }) => {
    await mount(page);
    await page.locator('#f [data-part="allButton"]').click();
    const pin = catalog(page).getByRole('button', { name: 'Pin Board' });
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.click();
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await mount(page);
    await expect(rail(page).getByRole('link', { name: 'Board', exact: true })).toBeVisible();
});

test('All opens the catalogue on its search; the search ignores accents; ArrowDown enters the list; Escape closes it and returns focus', async ({ page }) => {
    await mount(page);
    const all = page.locator('#f [data-part="allButton"]');
    await all.click();
    await expect(all).toHaveAttribute('aria-expanded', 'true');
    const search = page.getByRole('searchbox', { name: 'Search' });
    await expect(search).toBeFocused();
    await search.fill('citta');
    await expect(catalog(page).getByRole('link')).toHaveText([/Impostazioni città/]);
    await search.press('ArrowDown');
    await expect(catalog(page).getByRole('link', { name: /Impostazioni città/ })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(catalog(page)).toBeHidden();
    await expect(all).toBeFocused();
    await all.click();
    await search.fill('zzz');
    await expect(catalog(page).locator('[data-part="empty"]')).toHaveText('Nothing matches “zzz”');
});

test('the rail collapses to icons and stays collapsed on the next visit', async ({ page }) => {
    await mount(page);
    const width = () => page.locator('#f [data-part="rail"]').evaluate((e) => e.getBoundingClientRect().width);
    expect(await width()).toBeGreaterThanOrEqual(280);
    const toggle = page.locator('#f [data-part="railToggle"]');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(width).toBeLessThanOrEqual(96);
    await mount(page);
    await expect.poll(width).toBeLessThanOrEqual(96);
});

test('below 600px the rail is a drawer: the bar\'s menu opens it modally, Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await mount(page);
    await expect(page.locator('#f [data-part="rail"]')).toBeHidden();
    const menu = page.locator('#f [data-part="menuButton"]');
    await menu.click();
    await expect(page.locator('#f [data-part="rail"]')).toBeVisible();
    await expect(page.locator('#f [data-part="frame"]')).toHaveAttribute('inert', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('#f [data-part="rail"]')).toBeHidden();
});

test('axe finds nothing, with the catalogue closed and open', async ({ page }) => {
    await mount(page);
    const scan = async () => (await new AxeBuilder({ page }).include('#f').analyze()).violations.map((v) => `${v.id}: ${v.nodes.length}`);
    expect(await scan()).toEqual([]);
    await page.locator('#f [data-part="allButton"]').click();
    expect(await scan()).toEqual([]);
});
