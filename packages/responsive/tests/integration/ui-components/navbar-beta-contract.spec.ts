// pdx-navbar on the beta contract (#289): nothing it holds is read back by the app, so it has no
// model; the classes it set on itself become custom states — `sticky` and `compact` from their props,
// `collapsed` from its own width, `menu-open` from its toggle — and the current link is its
// `aria-current="page"`, with no `active` class beside it; the bar, the brand, the toggle, the nav, the
// links, the actions and the mobile drawer are parts; `pdx-select` stays on the navbar. Measured in
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

const ITEMS = `[{"key":"home","label":"Home","href":"#","active":true},{"key":"docs","label":"Docs","href":"#"},{"key":"about","label":"About","href":"#"}]`;
const WIDE = `[{"key":"home","label":"Home","href":"#","active":true},{"key":"docs","label":"Documentation","href":"#"},`
    + `{"key":"components","label":"Components","href":"#"},{"key":"playground","label":"Playground","href":"#"},{"key":"pricing","label":"Pricing","href":"#"}]`;
const NAVBAR = (attrs = '', items = ITEMS) =>
    `<pdx-navbar brand="Acme" ${attrs} items='${items}'><button type="button" aria-label="Settings">S</button></pdx-navbar>`;
const STATES = ['sticky', 'compact', 'collapsed', 'menu-open'];
const states = (page: Page, sel = '#f pdx-navbar') =>
    page.locator(sel).evaluate((h, names) => names.filter((s) => h.matches(`:state(${s})`)), STATES);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=navbar-beta-contract'); });

test('the bar, the brand, the toggle, the nav, the links, the actions and the drawer are parts', async ({ page }) => {
    await mount(page, NAVBAR());
    const part = (name: string) => page.locator(`#f [data-part="${name}"]`);
    // Written by the navbar once it has built its bar: wait on it, not on a visible box.
    await expect(part('nav')).toHaveAttribute('aria-label', 'Main navigation');
    await expect(part('bar')).toHaveCount(1);
    await expect(part('brand')).toHaveText('Acme');
    await expect(part('toggle')).toHaveAttribute('aria-controls', /.+/);
    // Three in the bar, the same three in the drawer.
    await expect(part('item')).toHaveCount(6);
    await expect(part('actions').locator('button')).toHaveAttribute('aria-label', 'Settings');
    await expect(part('drawer')).toHaveAttribute('id', (await part('toggle').getAttribute('aria-controls'))!);
});

test('the current link is aria-current="page", with no class beside it, and is drawn from it', async ({ page }) => {
    await mount(page, NAVBAR());
    const current = page.locator('#f [data-part="nav"] [data-nav-key="home"]');
    await expect(current).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('#f .active').count()).toBe(0);
    const weight = (key: string) => page.locator(`#f [data-part="nav"] [data-nav-key="${key}"]`)
        .evaluate((a) => getComputedStyle(a).fontWeight);
    expect(await weight('home')).not.toBe(await weight('docs'));
});

test('sticky and compact are custom states that follow their props, with no class on the host', async ({ page }) => {
    await mount(page, NAVBAR('sticky compact'));
    const host = page.locator('#f pdx-navbar');
    await expect.poll(() => states(page)).toEqual(['sticky', 'compact']);
    expect(await host.getAttribute('class')).toBeNull();
    expect(await host.evaluate((h) => getComputedStyle(h).position)).toBe('sticky');
    const barHeight = () => page.locator('#f [data-part="bar"]').evaluate((b) => b.getBoundingClientRect().height);
    expect(await barHeight()).toBe(48);
    await host.evaluate((h) => { Object.assign(h, { sticky: false, compact: false }); });
    await expect.poll(() => states(page)).toEqual([]);
    await expect.poll(barHeight).toBe(56);
    expect(await host.evaluate((h) => getComputedStyle(h).position)).toBe('static');
});

test('in a narrow column it is collapsed, and its toggle opens the drawer as menu-open', async ({ page }) => {
    await mount(page, `<div style="width: 420px">${NAVBAR('', WIDE)}</div>`);
    await expect.poll(() => states(page)).toEqual(['collapsed']);
    const toggle = page.locator('#f [data-part="toggle"]');
    const drawer = page.locator('#f [data-part="drawer"]');
    await expect(toggle).toBeVisible();
    await expect(drawer).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(await states(page)).toEqual(['collapsed', 'menu-open']);
    await expect(drawer).toBeVisible();
    expect(await page.locator('#f [class*="drawer-open"]').count()).toBe(0);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(await states(page)).toEqual(['collapsed']);
    await expect(drawer).toBeHidden();
});

test('on paper the element takes no room, as its .pdx-navbar class did', async ({ page }) => {
    await mount(page, NAVBAR());
    await expect(page.locator('#f [data-part="nav"]')).toHaveCount(1);
    const height = () => page.locator('#f pdx-navbar').evaluate((h) => h.getBoundingClientRect().height);
    expect(await height()).toBeGreaterThan(0);
    await page.emulateMedia({ media: 'print' });
    expect(await height()).toBe(0);
});

test('pdx-select stays on the navbar', async ({ page }) => {
    await mount(page, NAVBAR());
    await expect(page.locator('#f [data-nav-key="docs"]').first()).toHaveAttribute('href', '#');
    const heard = await page.locator('#f pdx-navbar').evaluate((h) => {
        const seen = { select: [] as string[], parent: 0 };
        h.parentElement!.addEventListener('pdx-select', () => { seen.parent++; });
        h.addEventListener('pdx-select', (e) => { seen.select.push((e as CustomEvent<{ key: string }>).detail.key); });
        (h.querySelector('[data-nav-key="docs"]') as HTMLElement).click();
        return seen;
    });
    expect(heard).toEqual({ select: ['docs'], parent: 0 });
});
