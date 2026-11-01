// pdx-scroll-area on the beta contract (#290). It marked the edges it had scrolled to with
// `data-at-top`/`-bottom`/`-left`/`-right` on its host and put a `.pdx-scroll-area` class there; the edges
// are the custom states `at-top`, `at-bottom`, `at-left` and `at-right`, the host carries no class or
// attribute of its own, and the viewport and the scrollbar it draws are named parts. `pdx-scroll` is
// declared and stays on the scroll area. On paper it prints its content, not its viewport. Measured in
// Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait for the scroll area to draw its scrollbar. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '300px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    // The scrollbar is written by the build: wait on it, not on a visible box.
    await expect(page.locator('#f pdx-scroll-area [data-pdx-scrollbar-thumb]').first()).toBeAttached();
}

const TALL = '<pdx-scroll-area max-height="120px"><p style="height: 600px; margin: 0">Long</p></pdx-scroll-area>';
const WIDE = '<pdx-scroll-area axis="horizontal"><p style="width: 900px; height: 40px; margin: 0">Wide</p></pdx-scroll-area>';
const host = (page: Page) => page.locator('#f pdx-scroll-area');
const states = (page: Page) => host(page).evaluate((h) =>
    ['at-top', 'at-bottom', 'at-left', 'at-right'].filter((s) => h.matches(`:state(${s})`)));
const viewport = (page: Page) => page.locator('#f pdx-scroll-area [data-part="viewport"]');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=scroll-area-beta-contract'); });

test('the edges are states, the fade follows them, and the host carries no class or data-at attribute', async ({ page }) => {
    await mount(page, TALL);
    await expect.poll(() => states(page)).toEqual(['at-top']);
    const fade = () => host(page).evaluate((h) => {
        const s = getComputedStyle(h);
        return [s.getPropertyValue('--pdx-scroll-fade-top').trim(), s.getPropertyValue('--pdx-scroll-fade-bottom').trim()];
    });
    expect(await fade(), 'at the top only the bottom edge fades').toEqual(['0', '1']);

    await viewport(page).evaluate((v) => { v.scrollTop = v.scrollHeight; });
    await expect.poll(() => states(page)).toEqual(['at-bottom']);
    expect(await fade()).toEqual(['1', '0']);

    const own = await host(page).evaluate((h) => ({
        cls: h.getAttribute('class'),
        dataAt: [...h.attributes].map((a) => a.name).filter((n) => n.startsWith('data-at-')),
    }));
    expect(own).toEqual({ cls: null, dataAt: [] });
});

test('a horizontal area: at-left and at-right', async ({ page }) => {
    await mount(page, WIDE);
    await expect.poll(() => states(page)).toEqual(['at-top', 'at-bottom', 'at-left']);
    await viewport(page).evaluate((v) => { v.scrollLeft = v.scrollWidth; });
    await expect.poll(() => states(page)).toEqual(['at-top', 'at-bottom', 'at-right']);
});

test('the viewport and the scrollbar are parts; pdx-scroll stays on the scroll area', async ({ page }) => {
    await mount(page, TALL);
    const parts = await host(page).evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')))].sort());
    expect(parts).toEqual(['scrollbar', 'thumb', 'viewport']);

    await host(page).evaluate((h) => {
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('pdx-scroll', () => { log.own++; });
        h.parentElement!.addEventListener('pdx-scroll', () => { log.parent++; });
    });
    await viewport(page).evaluate((v) => { v.scrollTop = 200; });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __log: { own: number } }).__log.own)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as unknown as { __log: { parent: number } }).__log.parent)).toBe(0);
});

test('on paper it prints its content, not its viewport', async ({ page }) => {
    await mount(page, TALL);
    await page.emulateMedia({ media: 'print' });
    const paper = await host(page).evaluate((h) => {
        const v = h.querySelector('[data-part="viewport"]') as HTMLElement;
        return { host: Math.round(h.getBoundingClientRect().height), viewport: Math.round(v.getBoundingClientRect().height) };
    });
    expect(paper, 'the 600px of content are cut at the 120px the screen shows').toEqual({ host: 600, viewport: 600 });
});
