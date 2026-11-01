// pdx-bottom-nav on the beta contract (#289): the app writes `activeKey`, so it stays a prop and there
// is no model; the class it set on its host becomes the custom state `ready`, and the current item is
// its `aria-current="page"`, with no `active` class beside it; the bar, the items, an item's icon, badge
// and label are parts; `pdx-select` stays on the bar. Measured in Chromium.
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

const ITEMS = `[{"key":"home","label":"Home","icon":"home"},{"key":"inbox","label":"Inbox","icon":"mail","badge":"3"},{"key":"me","label":"Me","icon":"user"}]`;
const BAR = `<pdx-bottom-nav active-key="home" items='${ITEMS}'></pdx-bottom-nav>`;
const host = (page: Page) => page.locator('#f pdx-bottom-nav');
const part = (page: Page, name: string) => page.locator(`#f [data-part="${name}"]`);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=bottom-nav-beta-contract'); });

test('the bar, the items and an item\'s icon, badge and label are parts', async ({ page }) => {
    await mount(page, BAR);
    // Written by the bar once it has drawn its items: wait on it, not on a visible box.
    await expect(part(page, 'item')).toHaveCount(3);
    await expect(part(page, 'bar')).toHaveCount(1);
    await expect(part(page, 'icon')).toHaveCount(3);
    await expect(part(page, 'label')).toHaveText(['Home', 'Inbox', 'Me']);
    await expect(part(page, 'badge')).toHaveText('3');
});

test('ready is a custom state, with no class on the host, and it pins the bar to the bottom', async ({ page }) => {
    await mount(page, BAR);
    await expect(part(page, 'item')).toHaveCount(3);
    expect(await host(page).evaluate((h) => h.matches(':state(ready)'))).toBe(true);
    expect(await host(page).getAttribute('class')).toBeNull();
    const pinned = await host(page).evaluate((h) => ({
        position: getComputedStyle(h).position,
        gap: window.innerHeight - h.getBoundingClientRect().bottom,
    }));
    expect(pinned).toEqual({ position: 'fixed', gap: 0 });
});

test('the current item is aria-current="page", with no class beside it, and is drawn from it', async ({ page }) => {
    await mount(page, BAR);
    const current = page.locator('#f [data-nav-key="home"]');
    await expect(current).toHaveAttribute('aria-current', 'page');
    expect(await page.locator('#f .active').count()).toBe(0);
    const color = (key: string) => page.locator(`#f [data-nav-key="${key}"]`).evaluate((b) => getComputedStyle(b).color);
    expect(await color('home')).not.toBe(await color('me'));
    // The app moves it: activeKey is a prop the bar follows.
    await host(page).evaluate((h) => { (h as HTMLElement & { activeKey: string }).activeKey = 'me'; });
    await expect(page.locator('#f [data-nav-key="me"]')).toHaveAttribute('aria-current', 'page');
    await expect(current).not.toHaveAttribute('aria-current');
});

test('on paper the element takes no room, as its .pdx-bottom-nav class did', async ({ page }) => {
    await mount(page, BAR);
    await expect(part(page, 'item')).toHaveCount(3);
    const height = () => host(page).evaluate((h) => h.getBoundingClientRect().height);
    expect(await height()).toBeGreaterThan(0);
    await page.emulateMedia({ media: 'print' });
    expect(await height()).toBe(0);
});

test('pdx-select stays on the bar', async ({ page }) => {
    await mount(page, BAR);
    await expect(part(page, 'item')).toHaveCount(3);
    const heard = await host(page).evaluate((h) => {
        const seen = { select: [] as string[], parent: 0 };
        h.parentElement!.addEventListener('pdx-select', () => { seen.parent++; });
        h.addEventListener('pdx-select', (e) => { seen.select.push((e as CustomEvent<{ key: string }>).detail.key); });
        (h.querySelector('[data-nav-key="inbox"]') as HTMLElement).click();
        return seen;
    });
    expect(heard).toEqual({ select: ['inbox'], parent: 0 });
});
