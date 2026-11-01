// pdx-nav-menu on the beta contract (#289): the app writes `activeKey` and `collapsed`, so they stay
// props; the host's classes become custom states, `ready` and `collapsed`; an entry's own state is its
// ARIA attribute — the current one `aria-current="page"`, an open group `aria-expanded="true"` — with
// no class beside it; the nav, the entries, a group, a heading, a separator, an entry's actions and the
// collapsed menu's flyout are parts; `pdx-select` and `pdx-toggle` stay on the menu. Measured in Chromium.
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

const SVG = '<svg viewBox=\\"0 0 24 24\\"><rect x=\\"4\\" y=\\"4\\" width=\\"16\\" height=\\"16\\"/></svg>';
const ITEMS = `[{"type":"header","label":"General"},{"key":"dashboard","label":"Dashboard","icon":"${SVG}"},{"type":"separator"},`
    + `{"key":"tickets","label":"Tickets","icon":"${SVG}","expanded":true,"children":[{"key":"all","label":"All tickets"},{"key":"mine","label":"Mine"}]}]`;
const MENU = (attrs = '') => `<pdx-nav-menu active-key="dashboard" ${attrs} items='${ITEMS}'></pdx-nav-menu>`;
const part = (page: Page, name: string) => page.locator(`[data-part="${name}"]`);
const host = (page: Page) => page.locator('#f pdx-nav-menu');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=nav-menu-beta-contract'); });

test('the nav, the entries, a group, a heading and a separator are parts', async ({ page }) => {
    await mount(page, MENU());
    await expect(part(page, 'nav')).toHaveAttribute('role', 'navigation');
    // Dashboard, Tickets, and the group's two.
    await expect(part(page, 'item')).toHaveCount(4);
    await expect(part(page, 'group')).toHaveAttribute('role', 'group');
    await expect(part(page, 'heading')).toHaveText('General');
    await expect(part(page, 'separator')).toHaveCount(1);
});

test('the current entry and an open group are their ARIA attributes, with no class beside them', async ({ page }) => {
    await mount(page, MENU());
    const current = page.locator('#f [data-nav-key="dashboard"]');
    await expect(current).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('#f .active, #f .expanded').count()).toBe(0);
    // The open group's chevron is turned, from its entry's aria-expanded.
    const chevron = page.locator('#f [data-nav-key="tickets"] > .pdx-nav-chevron');
    const turned = () => chevron.evaluate((c) => getComputedStyle(c).transform);
    expect(await turned()).not.toBe('none');
    await page.locator('#f [data-nav-key="tickets"]').click();
    await expect(page.locator('#f [data-nav-key="tickets"]')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(turned).toBe('none');
});

test('ready and collapsed are custom states on the host, with no class', async ({ page }) => {
    await mount(page, `<div data-k="open">${MENU()}</div><div data-k="rail" style="width: 64px">${MENU('collapsed')}</div>`);
    const states = (k: string) => page.locator(`#f [data-k="${k}"] pdx-nav-menu`).evaluate((h) =>
        ['ready', 'collapsed'].filter((s) => h.matches(`:state(${s})`)));
    await expect.poll(() => states('open')).toEqual(['ready']);
    await expect.poll(() => states('rail')).toEqual(['ready', 'collapsed']);
    expect(await page.locator('#f pdx-nav-menu[class]').count()).toBe(0);
    // Collapsed draws icons only: the labels go, the rail's entries are its icons.
    await expect(page.locator('#f [data-k="rail"] .pdx-nav-label')).toHaveCount(0);
    // And it follows the prop.
    await page.locator('#f [data-k="rail"] pdx-nav-menu').evaluate((h) => { (h as HTMLElement & { collapsed: boolean }).collapsed = false; });
    await expect.poll(() => states('rail')).toEqual(['ready']);
});

test('collapsed, a group opens in a flyout part', async ({ page }) => {
    await mount(page, `<div style="width: 64px">${MENU('collapsed')}</div>`);
    await page.locator('#f [data-nav-key="tickets"]').hover();
    await expect(part(page, 'flyout')).toBeVisible();
    await expect(part(page, 'flyout').locator('[data-part="item"]')).toHaveCount(2);
});

test('pdx-select and pdx-toggle stay on the menu; pdx-select is cancellable', async ({ page }) => {
    await mount(page, MENU());
    const heard = await host(page).evaluate(async (h) => {
        const seen = { select: [] as string[], toggle: [] as string[], parent: 0 };
        for (const name of ['pdx-select', 'pdx-toggle']) h.parentElement!.addEventListener(name, () => { seen.parent++; });
        h.addEventListener('pdx-select', (e) => { seen.select.push((e as CustomEvent<{ key: string }>).detail.key); e.preventDefault(); });
        h.addEventListener('pdx-toggle', (e) => { seen.toggle.push((e as CustomEvent<{ key: string }>).detail.key); });
        (h.querySelector('[data-nav-key="all"]') as HTMLElement).click();
        (h.querySelector('[data-nav-key="tickets"]') as HTMLElement).click();
        return seen;
    });
    expect(heard).toEqual({ select: ['all'], toggle: ['tickets'], parent: 0 });
});
