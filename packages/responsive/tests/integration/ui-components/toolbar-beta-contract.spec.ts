// pdx-toolbar on the beta contract (#289): the classes it set on its host become custom states —
// `compact`, `bordered` and `vertical`, from their props — and the toolbar's own look comes from its
// tag, so the host carries no class at all; it draws nothing of its own, so it has no parts; no model.
// CSS-only markup keeps `.pdx-toolbar` and its modifiers. Measured in Chromium.
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

const BUTTONS = '<button type="button" data-k="a">A</button><span class="pdx-toolbar-sep" data-k="sep"></span><button type="button" data-k="b">B</button>';
const STATES = ['compact', 'bordered', 'vertical'];
const states = (page: Page, k: string) => page.locator(`#f [data-t="${k}"]`).evaluate((h, names) =>
    names.filter((s) => h.matches(`:state(${s})`)), STATES);
const style = (page: Page, sel: string) => page.locator(sel).evaluate((el) => {
    const s = getComputedStyle(el);
    return { display: s.display, direction: s.flexDirection, border: s.borderTopStyle, gap: s.columnGap };
});

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=toolbar-beta-contract'); });

test('a toolbar is laid out from its tag, with no class on the host', async ({ page }) => {
    await mount(page, `<pdx-toolbar data-t="plain">${BUTTONS}</pdx-toolbar>`);
    const host = page.locator('#f [data-t="plain"]');
    // Written by the toolbar once it has run: wait on it, not on a visible box.
    await expect(host).toHaveAttribute('role', 'toolbar');
    expect(await host.getAttribute('class')).toBeNull();
    expect(await states(page, 'plain')).toEqual([]);
    expect((await style(page, '#f [data-t="plain"]')).display).toBe('flex');
});

test('compact, bordered and vertical are custom states that follow their props, and are drawn from them', async ({ page }) => {
    await mount(page, `<pdx-toolbar data-t="plain">${BUTTONS}</pdx-toolbar><pdx-toolbar data-t="all" compact bordered vertical>${BUTTONS}</pdx-toolbar>`);
    const host = page.locator('#f [data-t="all"]');
    await expect(host).toHaveAttribute('aria-orientation', 'vertical');
    expect(await states(page, 'all')).toEqual(['compact', 'bordered', 'vertical']);
    expect(await host.getAttribute('class')).toBeNull();
    const plain = await style(page, '#f [data-t="plain"]');
    const all = await style(page, '#f [data-t="all"]');
    expect(all.direction, 'vertical stacks the controls').toBe('column');
    expect(all.border, 'bordered draws a border').toBe('solid');
    expect(all.gap, 'compact tightens the gap').not.toBe(plain.gap);
    // The vertical separator turns horizontal.
    const sep = await page.locator('#f [data-t="all"] [data-k="sep"]').evaluate((s) => s.getBoundingClientRect());
    expect(sep.width).toBeGreaterThan(sep.height);
    // And they follow the props.
    await host.evaluate((h) => { Object.assign(h, { compact: false, bordered: false, vertical: false }); });
    await expect.poll(() => states(page, 'all')).toEqual([]);
    await expect.poll(async () => (await style(page, '#f [data-t="all"]')).direction).toBe('row');
});

test('a sticky toolbar still sticks, from its pdx-sticky attribute', async ({ page }) => {
    await mount(page, `<pdx-toolbar data-t="sticky" pdx-sticky>${BUTTONS}</pdx-toolbar>`);
    await expect(page.locator('#f [data-t="sticky"]')).toHaveAttribute('role', 'toolbar');
    expect(await page.locator('#f [data-t="sticky"]').evaluate((h) => getComputedStyle(h).position)).toBe('sticky');
});

test('on paper the element takes no room, as its .pdx-toolbar class did', async ({ page }) => {
    await mount(page, `<pdx-toolbar data-t="plain">${BUTTONS}</pdx-toolbar>`);
    const host = page.locator('#f [data-t="plain"]');
    await expect(host).toHaveAttribute('role', 'toolbar');
    const height = () => host.evaluate((h) => h.getBoundingClientRect().height);
    expect(await height()).toBeGreaterThan(0);
    await page.emulateMedia({ media: 'print' });
    expect(await height()).toBe(0);
});
