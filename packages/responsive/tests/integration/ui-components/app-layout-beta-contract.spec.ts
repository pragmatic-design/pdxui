// pdx-app-layout on the beta contract (#290). Its navbar methods write `navbarCollapsed` above the
// breakpoint, so the prop is a model: the component's write announces `navbar-collapsed-change`
// `{ value }`, a parent's write announces nothing, and neither bubbles. The classes it toggled on its
// host and on the app's navbar and backdrop are custom states of the host — `bordered`, `drawer`,
// `drawer-open`, `navbar-collapsed`, `navbar-gone` — and the host carries no class. The regions keep
// their `pdx-app-*` classes, which CSS-only markup and `main.pdx-app-main` rely on, and are named parts.
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the layout to wrap its main area. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    // The <main> is written by the build: wait on it, not on a visible box.
    await expect(page.locator('#f pdx-app-layout > main')).toHaveCount(1);
}

const SHELL = `<pdx-app-layout aside-width="200px" footer-height="40px">
    <div data-region="header">Header</div>
    <div data-region="navbar"><button type="button">Tickets</button></div>
    <div data-region="aside">Aside</div>
    <div data-region="footer">Footer</div>
    <div data-test="content" style="height: 2000px">Content</div>
</pdx-app-layout>`;

const host = (page: Page) => page.locator('#f pdx-app-layout');
const states = (page: Page) => host(page).evaluate((h) =>
    ['bordered', 'drawer', 'drawer-open', 'navbar-collapsed', 'navbar-gone'].filter((s) => h.matches(`:state(${s})`)));
const call = (page: Page, method: string) => host(page).evaluate((h, m) => (h as unknown as Record<string, () => void>)[m](), method);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=app-layout-beta-contract'); });

test('above the breakpoint the navbar methods write the model: navbar-collapsed-change once each, nothing bubbles; a parent\'s write announces nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mount(page, SHELL);
    await host(page).evaluate((h) => {
        const log = { values: [] as unknown[], parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('navbar-collapsed-change', (e) => log.values.push((e as CustomEvent).detail?.value));
        h.parentElement!.addEventListener('navbar-collapsed-change', () => { log.parent++; });
    });
    const log = () => page.evaluate(() => (window as unknown as { __log: { values: unknown[]; parent: number } }).__log);
    expect(await states(page)).toEqual(['bordered']);

    await call(page, 'closeNavbar');
    await expect.poll(() => states(page)).toEqual(['bordered', 'navbar-collapsed']);
    await call(page, 'closeNavbar'); // already closed: no second announcement
    await call(page, 'toggleNavbar');
    await expect.poll(() => states(page)).toEqual(['bordered']);
    expect(await log()).toEqual({ values: [true, false], parent: 0 });

    // A parent's write: the navbar follows, and nothing is announced.
    await host(page).evaluate((h) => { (h as unknown as { navbarCollapsed: boolean }).navbarCollapsed = true; });
    await expect.poll(() => states(page)).toEqual(['bordered', 'navbar-collapsed']);
    expect((await log()).values).toEqual([true, false]);

    // Collapsed to a 0px rail, the navbar is gone.
    await host(page).evaluate((h) => { (h as unknown as { navbarCollapsedWidth: string }).navbarCollapsedWidth = '0px'; });
    await expect.poll(() => states(page)).toEqual(['bordered', 'navbar-collapsed', 'navbar-gone']);
});

test('the host carries no class and the regions are parts; without border the state is off and the border goes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mount(page, SHELL);
    const facts = await host(page).evaluate((h) => ({
        cls: h.getAttribute('class'),
        parts: [...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')).sort(),
        // What CSS-only markup and `main.pdx-app-main` rely on stays.
        main: h.querySelector(':scope > main')?.className,
        display: getComputedStyle(h).display,
        navbarBorder: getComputedStyle(h.querySelector('[data-part="navbar"]')!).borderRightWidth,
    }));
    expect(facts).toEqual({
        cls: null,
        parts: ['aside', 'footer', 'header', 'main', 'navbar', 'overlay'],
        main: 'pdx-app-main',
        display: 'grid',
        navbarBorder: '1px',
    });
    await host(page).evaluate((h) => { (h as unknown as { withBorder: boolean }).withBorder = false; });
    await expect.poll(() => states(page)).toEqual([]);
    expect(await host(page).evaluate((h) => getComputedStyle(h.querySelector('[data-part="navbar"]')!).borderRightWidth)).toBe('0px');
});

test('below the breakpoint the navbar is a drawer: closed off screen, open on screen with its backdrop, and the drawer is not the model', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    await mount(page, SHELL);
    await host(page).evaluate((h) => {
        (window as unknown as { __changes: number }).__changes = 0;
        h.addEventListener('navbar-collapsed-change', () => { (window as unknown as { __changes: number }).__changes++; });
    });
    const drawer = () => host(page).evaluate((h) => {
        const nav = h.querySelector('[data-part="navbar"]')!;
        return {
            x: Math.round(nav.getBoundingClientRect().x),
            backdrop: getComputedStyle(h.querySelector('[data-part="overlay"]')!).display,
            classes: [...h.querySelectorAll('[class*="pdx-app-navbar-"], [class*="pdx-app-overlay-"]')].length,
        };
    });
    await expect.poll(() => states(page)).toEqual(['bordered', 'drawer']);
    await expect.poll(async () => (await drawer()).x, { message: 'a closed drawer sits off screen' }).toBeLessThan(0);
    expect(await drawer()).toMatchObject({ backdrop: 'none', classes: 0 });

    await call(page, 'openNavbar');
    await expect.poll(() => states(page)).toEqual(['bordered', 'drawer', 'drawer-open']);
    await expect.poll(async () => (await drawer()).x, { message: 'an open drawer is on screen' }).toBe(0);
    expect(await drawer()).toMatchObject({ backdrop: 'block', classes: 0 });
    expect(await page.evaluate(() => (window as unknown as { __changes: number }).__changes)).toBe(0);
});

test('on paper the shell is a block as tall as its content, and its chrome is gone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mount(page, SHELL);
    await page.emulateMedia({ media: 'print' });
    const paper = await host(page).evaluate((h) => ({
        display: getComputedStyle(h).display,
        tallerThanTheScreen: h.getBoundingClientRect().height > 1500,
        header: getComputedStyle(h.querySelector('[data-part="header"]')!).display,
    }));
    expect(paper).toEqual({ display: 'block', tallerThanTheScreen: true, header: 'none' });
});
