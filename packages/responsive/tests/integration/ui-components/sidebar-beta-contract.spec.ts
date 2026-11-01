// pdx-sidebar on the beta contract (#289): the app writes `open` — the sidebar has no toggle of its
// own — so it stays a prop and there is no model; the classes it set on its host become custom
// states, `collapsed` and `mini`, and the sidebar's own look comes from its tag, so the host carries
// no class; it draws nothing of its own, so it has no parts. Measured in Chromium.
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

const SIDEBAR = (attrs = '') => `<div style="height: 300px; display: flex"><pdx-sidebar ${attrs}><a href="#">Dashboard</a></pdx-sidebar><main style="flex: 1">Content</main></div>`;
const host = (page: Page) => page.locator('#f pdx-sidebar');
const states = (page: Page) => host(page).evaluate((h) => ['collapsed', 'mini'].filter((s) => h.matches(`:state(${s})`)));
const box = (page: Page) => host(page).evaluate((h) => ({ width: h.getBoundingClientRect().width, display: getComputedStyle(h).display }));
const setOpen = (page: Page, open: boolean) => host(page).evaluate((h, o) => { (h as HTMLElement & { open: boolean }).open = o; }, open);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=sidebar-beta-contract'); });

test('open, it is laid out from its tag, in none of its states, with no class on the host', async ({ page }) => {
    await mount(page, SIDEBAR());
    // Written by the sidebar once it has run: wait on it, not on a visible box.
    await expect(host(page)).toHaveAttribute('role', 'complementary');
    expect(await host(page).getAttribute('class')).toBeNull();
    expect(await states(page)).toEqual([]);
    expect(await box(page)).toEqual({ width: 260, display: 'flex' });
});

test('closed it is :state(collapsed) and takes no width; closed and mini, :state(mini), an icon rail', async ({ page }) => {
    await mount(page, SIDEBAR('mini'));
    await expect(host(page)).toHaveAttribute('role', 'complementary');
    await setOpen(page, false);
    await expect.poll(() => states(page)).toEqual(['collapsed', 'mini']);
    await expect.poll(async () => (await box(page)).width).toBe(60);
    await host(page).evaluate((h) => { (h as HTMLElement & { mini: boolean }).mini = false; });
    await expect.poll(() => states(page)).toEqual(['collapsed']);
    // Width 0: what is left is its 1px border.
    await expect.poll(async () => (await box(page)).width).toBeLessThanOrEqual(1);
    expect(await host(page).getAttribute('class')).toBeNull();
    await setOpen(page, true);
    await expect.poll(() => states(page)).toEqual([]);
    await expect.poll(async () => (await box(page)).width).toBe(260);
});

test('on the right, its border is on its left edge', async ({ page }) => {
    await mount(page, SIDEBAR('position="right"'));
    await expect(host(page)).toHaveAttribute('role', 'complementary');
    const edges = await host(page).evaluate((h) => {
        const s = getComputedStyle(h);
        return { left: s.borderLeftStyle, right: s.borderRightStyle };
    });
    expect(edges).toEqual({ left: 'solid', right: 'none' });
});

test('on paper the element takes no room, as its .pdx-sidebar class did', async ({ page }) => {
    await mount(page, SIDEBAR());
    await expect(host(page)).toHaveAttribute('role', 'complementary');
    expect((await box(page)).width).toBeGreaterThan(0);
    await page.emulateMedia({ media: 'print' });
    expect(await host(page).evaluate((h) => h.getBoundingClientRect().height)).toBe(0);
});
