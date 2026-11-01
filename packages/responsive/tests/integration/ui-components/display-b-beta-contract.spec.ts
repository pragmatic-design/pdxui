// The second batch of #291 on the beta contract: pdx-avatar-group, pdx-image and pdx-block-ui. The host
// carries no class any of them put there; the image's loading, zoom and broken source and the block's
// blocked and shown moments are custom states; the block's host is aria-busy only while blocked and its
// status says something only while the overlay is drawn (A4); the pieces they draw are named parts; their
// events stay on the element. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait two frames for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.style.width = '360px';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) =>
    [...new Set([...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')))].sort());

/** Count `name` on the element and on its parent: a declared event does not bubble. */
async function listen(page: Page, sel: string, name: string): Promise<void> {
    await page.locator(sel).evaluate((h, n) => {
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener(n, () => { log.own++; });
        h.parentElement!.addEventListener(n, () => { log.parent++; });
    }, name);
}
const logged = (page: Page) => page.evaluate(() => (window as unknown as { __log: unknown }).__log);

const DOT = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="teal"/></svg>');

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=display-b-beta-contract'); });

test('pdx-avatar-group: no class on the host (the author\'s kept), still a row; parts named; its events stay on it', async ({ page }) => {
    await mount(page, '<pdx-avatar-group class="author-x" max="2" clickable></pdx-avatar-group>');
    const host = page.locator('#f pdx-avatar-group');
    await host.evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ name: 'Ada' }, { name: 'Bo' }, { name: 'Cy' }]; });
    await expect(page.locator('#f [data-part="overflow"]')).toHaveText('+1');
    expect(await host.evaluate((h) => ({
        cls: h.getAttribute('class'),
        display: getComputedStyle(h).display,
        row: getComputedStyle(h.querySelector('[data-part="root"]')!).flexDirection,
    }))).toEqual({ cls: 'author-x', display: 'inline-block', row: 'row' });
    expect(await parts(page, '#f pdx-avatar-group')).toEqual(['avatar', 'overflow', 'root']);

    await listen(page, '#f pdx-avatar-group', 'pdx-overflow-click');
    await page.locator('#f [data-part="overflow"]').click();
    expect(await logged(page)).toEqual({ own: 1, parent: 0 });
    await listen(page, '#f pdx-avatar-group', 'pdx-click');
    await page.locator('#f [data-part="avatar"]').first().click();
    expect(await logged(page)).toEqual({ own: 1, parent: 0 });
});

test('pdx-image: no class on the host; loaded, it shows the image and leaves the loading state; parts named', async ({ page }) => {
    await mount(page, `<pdx-image class="author-x" src="${DOT}" alt="A dot" width="80px" height="80px" caption="A dot"></pdx-image>`);
    const host = page.locator('#f pdx-image');
    await expect(page.locator('#f [data-part="image"]')).toHaveCount(1);
    await expect.poll(() => host.evaluate((h) => h.matches(':state(loading)')), { message: 'a loaded image is not loading' }).toBe(false);
    await expect.poll(() => page.locator('#f [data-part="image"]').evaluate((i) => getComputedStyle(i).opacity)).toBe('1');
    expect(await host.evaluate((h) => ({ cls: h.getAttribute('class'), display: getComputedStyle(h).display, broken: h.matches(':state(broken)') })))
        .toEqual({ cls: 'author-x', display: 'inline-block', broken: false });
    expect(await parts(page, '#f pdx-image')).toEqual(['caption', 'frame', 'image']);
});

test('pdx-image: an image not loaded yet is in the loading state and not drawn', async ({ page }) => {
    // Lazy, and far below the viewport: its source is never asked for while the test runs.
    await mount(page, `<div style="height: 4000px"></div><pdx-image src="${DOT}" alt="Far" width="80px" height="80px"></pdx-image>`);
    const host = page.locator('#f pdx-image');
    await expect(page.locator('#f [data-part="image"]')).toHaveCount(1);
    await expect.poll(() => host.evaluate((h) => h.matches(':state(loading)'))).toBe(true);
    expect(await page.locator('#f [data-part="image"]').evaluate((i) => getComputedStyle(i).opacity)).toBe('0');
    expect(await parts(page, '#f pdx-image')).toEqual(['frame', 'image', 'placeholder']);
});

test('pdx-image: a source that fails is the broken state, with its fallback part', async ({ page }) => {
    await mount(page, '<pdx-image src="/no-such-image.png" alt="Gone" width="80px" height="80px"></pdx-image>');
    const host = page.locator('#f pdx-image');
    await expect.poll(() => host.evaluate((h) => h.matches(':state(broken)'))).toBe(true);
    expect(await host.evaluate((h) => h.matches(':state(loading)'))).toBe(false);
    await expect(page.locator('#f [data-part="fallback"]')).toHaveCount(1);
});

test('pdx-image: zoom is a state that draws the image scaled; pdx-zoom stays on the image', async ({ page }) => {
    await mount(page, `<pdx-image src="${DOT}" alt="A dot" width="80px" height="80px" zoomable></pdx-image>`);
    const host = page.locator('#f pdx-image');
    await expect.poll(() => host.evaluate((h) => h.matches(':state(loading)'))).toBe(false);
    const transform = () => page.locator('#f [data-part="image"]').evaluate((i) => getComputedStyle(i).transform);
    expect(await transform()).toBe('none');

    await listen(page, '#f pdx-image', 'pdx-zoom');
    await page.locator('#f [data-part="frame"]').click();
    expect(await host.evaluate((h) => h.matches(':state(zoomed)'))).toBe(true);
    await expect.poll(transform, { message: 'zoomed, the image is drawn scaled' }).not.toBe('none');
    await page.locator('#f [data-part="frame"]').click();
    expect(await host.evaluate((h) => h.matches(':state(zoomed)'))).toBe(false);
    expect(await logged(page)).toEqual({ own: 2, parent: 0 });
});

test('pdx-block-ui: blocked and shown are states; aria-busy and the status only while blocked (A4); no class on the host', async ({ page }) => {
    await mount(page, '<pdx-block-ui class="author-x" delay="0" min-duration="0" message="Saving"><button>Save</button></pdx-block-ui>');
    const host = page.locator('#f pdx-block-ui');
    await expect(page.locator('#f [data-part="overlay"]')).toHaveCount(1);
    // The statuses in the accessibility tree: the spinner's own is hidden, the overlay's only while drawn.
    const statuses = () => page.locator('#f').getByRole('status').allTextContents();
    const read = () => host.evaluate((h) => ({
        cls: h.getAttribute('class'),
        busy: h.getAttribute('aria-busy'),
        blocked: h.matches(':state(blocked)'),
        shown: h.matches(':state(shown)'),
        opacity: getComputedStyle(h.querySelector('[data-part="overlay"]')!).opacity,
    }));
    expect(await read(), 'not blocked: no busy attribute, no state').toEqual({ cls: 'author-x', busy: null, blocked: false, shown: false, opacity: '0' });
    expect(await statuses(), 'at rest, no status in the tree').toEqual([]);

    await listen(page, '#f pdx-block-ui', 'pdx-block');
    await host.evaluate((h) => { (h as unknown as { blocked: boolean }).blocked = true; });
    await expect.poll(read).toEqual({ cls: 'author-x', busy: 'true', blocked: true, shown: true, opacity: '0.7' });
    await expect.poll(statuses, { message: 'drawn, one status with its message' }).toEqual(['Saving']);
    expect(await logged(page)).toEqual({ own: 1, parent: 0 });

    await host.evaluate((h) => { (h as unknown as { blocked: boolean }).blocked = false; });
    await expect.poll(read).toEqual({ cls: 'author-x', busy: null, blocked: false, shown: false, opacity: '0' });
    expect(await statuses(), 'unblocked, no status in the tree again').toEqual([]);
    expect(await parts(page, '#f pdx-block-ui')).toEqual(['message', 'overlay', 'spinner']);
});

test('pdx-block-ui: within its delay it is blocked and not yet shown', async ({ page }) => {
    await mount(page, '<pdx-block-ui delay="5000"><button>Save</button></pdx-block-ui>');
    const host = page.locator('#f pdx-block-ui');
    await expect(page.locator('#f [data-part="overlay"]')).toHaveCount(1);
    await host.evaluate((h) => { (h as unknown as { blocked: boolean }).blocked = true; });
    await expect.poll(() => host.evaluate((h) => h.matches(':state(blocked)'))).toBe(true);
    expect(await host.evaluate((h) => ({ shown: h.matches(':state(shown)'), busy: h.getAttribute('aria-busy') })))
        .toEqual({ shown: false, busy: 'true' });
});
