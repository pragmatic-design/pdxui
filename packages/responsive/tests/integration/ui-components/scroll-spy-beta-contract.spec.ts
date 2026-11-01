// pdx-scroll-spy on the beta contract (#289): the section in view is a read-only output, announced by
// `section-change` `{ value }` — the shape of a model event, but not a model — in place of `pdx-change`
// `{ section }`, which is gone; it is declared, so it stays on the spy, and it fires when the section
// changes, not on every pass of its observer. The current link is its `aria-current="page"`, with no
// `active` class written on the app's links. Measured in Chromium.
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

const KEYS = ['intro', 'usage', 'api'];
const SPY = `<pdx-scroll-spy smooth-scroll="false">
    <nav aria-label="On this page" style="position: fixed; top: 0; right: 0;">
        ${KEYS.map((k) => `<a href="#${k}" data-spy-link>${k}</a>`).join(' ')}
    </nav>
    ${KEYS.map((k) => `<section id="${k}" data-section="${k}" style="height: 1200px">${k}</section>`).join('')}
</pdx-scroll-spy>`;
const link = (page: Page, k: string) => page.locator(`#f a[href="#${k}"]`);

/** Record, from before the spy runs, what it announces on itself and what reaches its parent. */
async function mountRecorded(page: Page): Promise<() => Promise<{ values: string[]; alpha: number; parent: number }>> {
    await page.evaluate(() => {
        const log = { values: [] as string[], alpha: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        // Capture on the document sees the spy's own events before they would bubble.
        document.addEventListener('section-change', (e) => {
            if ((e.target as Element).matches('pdx-scroll-spy')) log.values.push((e as CustomEvent<{ value: string }>).detail.value);
        }, true);
        document.addEventListener('pdx-change', (e) => { if ((e.target as Element).matches('pdx-scroll-spy')) log.alpha++; }, true);
        // Bubble phase on the document: only an event that bubbles gets here.
        document.addEventListener('section-change', () => { log.parent++; });
    });
    await mount(page, SPY);
    return () => page.evaluate(() => (window as unknown as { __log: { values: string[]; alpha: number; parent: number } }).__log);
}

const scrollTo = (page: Page, k: string) => page.evaluate((id) => {
    window.scrollTo(0, document.getElementById(id)!.getBoundingClientRect().top + window.scrollY);
}, k);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=scroll-spy-beta-contract'); });

test('the section in view is announced by section-change { value }, once per change; pdx-change is gone', async ({ page }) => {
    const log = await mountRecorded(page);
    await expect(link(page, 'intro')).toHaveAttribute('aria-current', 'page');
    await scrollTo(page, 'usage');
    await expect(link(page, 'usage')).toHaveAttribute('aria-current', 'page');
    await scrollTo(page, 'api');
    await expect(link(page, 'api')).toHaveAttribute('aria-current', 'page');
    // A scroll inside the same section announces nothing new.
    await page.evaluate(() => window.scrollBy(0, 40));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const heard = await log();
    expect(heard.alpha, 'no pdx-change').toBe(0);
    expect(heard.values.at(-1)).toBe('api');
    expect(heard.values.filter((v, i) => v === heard.values[i - 1]), 'the same section twice in a row').toEqual([]);
    expect(heard.values).toEqual(expect.arrayContaining(['intro', 'usage', 'api']));
});

test('section-change stays on the spy: it is declared, and does not bubble', async ({ page }) => {
    const log = await mountRecorded(page);
    await expect(link(page, 'intro')).toHaveAttribute('aria-current', 'page');
    const heard = await log();
    expect(heard.values).toEqual(['intro']);
    expect(heard.parent).toBe(0);
});

test('a new observer that finds the same section announces nothing', async ({ page }) => {
    const log = await mountRecorded(page);
    await expect(link(page, 'intro')).toHaveAttribute('aria-current', 'page');
    // A prop change builds the observer again, and its first pass reports the section in view.
    const spy = page.locator('#f pdx-scroll-spy');
    await spy.evaluate((h) => { (h as HTMLElement & { offset: number }).offset = 120; });
    await spy.evaluate((h) => { (h as HTMLElement & { offset: number }).offset = 140; });
    for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect((await log()).values).toEqual(['intro']);
});

test('the current link is aria-current="page", with no class written on the app\'s links', async ({ page }) => {
    await mountRecorded(page);
    await expect(link(page, 'intro')).toHaveAttribute('aria-current', 'page');
    await scrollTo(page, 'usage');
    await expect(link(page, 'usage')).toHaveAttribute('aria-current', 'page');
    await expect(link(page, 'intro')).not.toHaveAttribute('aria-current');
    expect(await page.locator('#f a[class]').count()).toBe(0);
    // getActiveSection() reads the same section.
    expect(await page.locator('#f pdx-scroll-spy').evaluate((h) => (h as unknown as { getActiveSection(): string }).getActiveSection())).toBe('usage');
});
