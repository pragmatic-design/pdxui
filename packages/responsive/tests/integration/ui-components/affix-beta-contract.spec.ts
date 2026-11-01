// pdx-affix on the beta contract (#290), against the window: stuck or not is the scroll's doing, so it
// is a read-only output — `affixed-change` `{ value }` in place of `pdx-change` `{ affixed }` — and the
// custom state `affixed` in place of the `pdx-affix-fixed` class; the host carries no class at all; the
// event is declared and stays on the affix. Measured in Chromium. Container mode is measured on the
// site's gallery (packages/site/tests/affix-target.spec.ts).
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

const PAGE = `<div style="height: 300px">Above</div><pdx-affix><div style="height: 40px">Bar</div></pdx-affix><div style="height: 3000px">Below</div>`;
const host = (page: Page) => page.locator('#f pdx-affix');
const affixed = (page: Page) => host(page).evaluate((h) => h.matches(':state(affixed)'));

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=affix-beta-contract'); });

test('scrolling past it: affixed-change { value } once each way, the affixed state, no pdx-change, no class, nothing bubbles', async ({ page }) => {
    await mount(page, PAGE);
    // The host turns block on its first frame: wait on that, not on a visible box.
    await expect.poll(() => host(page).evaluate((h) => (h as HTMLElement).style.display)).toBe('block');
    await host(page).evaluate((h) => {
        const log = { values: [] as unknown[], alpha: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('affixed-change', (e) => log.values.push((e as CustomEvent).detail?.value));
        h.addEventListener('pdx-change', () => { log.alpha++; });
        h.parentElement!.addEventListener('affixed-change', () => { log.parent++; });
    });
    const log = () => page.evaluate(() => (window as unknown as { __log: { values: unknown[]; alpha: number; parent: number } }).__log);
    expect(await affixed(page)).toBe(false);

    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => affixed(page)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 650)); // still stuck: no second announcement
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => affixed(page)).toBe(false);
    expect(await log()).toEqual({ values: [true, false], alpha: 0, parent: 0 });
    expect(await host(page).getAttribute('class')).toBeNull();
});
