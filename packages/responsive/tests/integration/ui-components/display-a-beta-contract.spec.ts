// The first batch of #291 on the beta contract: pdx-statistic, pdx-description-list, pdx-empty-state,
// pdx-progress and pdx-badge (pdx-kbd has nothing to measure beyond its manifest row). The host carries
// no class any of them put there; statistic's loading is a custom state and its host is aria-busy only
// while loading (A4); the pieces they draw are named parts; a determinate ring does not spin; a badge's
// status says something only while it is shown (A4). Measured in Chromium.
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

const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) =>
    [...new Set([...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')))].sort());

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=display-a-beta-contract'); });

test('pdx-statistic: no class on the host (the author\'s kept), loading is a state and aria-busy only while loading', async ({ page }) => {
    await mount(page, '<pdx-statistic class="author-x" title="Revenue" value="1200" trend="up" trend-value="+3%" description="This month" compare-value="900" loading></pdx-statistic>');
    const host = page.locator('#f pdx-statistic');
    await expect.poll(() => host.evaluate((h) => h.matches(':state(loading)'))).toBe(true);
    expect(await host.evaluate((h) => ({ cls: h.getAttribute('class'), busy: h.getAttribute('aria-busy') })))
        .toEqual({ cls: 'author-x', busy: 'true' });

    await host.evaluate((h) => { (h as unknown as { loading: boolean }).loading = false; });
    await expect.poll(() => host.evaluate((h) => h.matches(':state(loading)'))).toBe(false);
    await expect(page.locator('#f [data-part="value"]')).toHaveText('1200');
    expect(await host.evaluate((h) => ({ cls: h.getAttribute('class'), busy: h.getAttribute('aria-busy') })))
        .toEqual({ cls: 'author-x', busy: null });
    expect(await parts(page, '#f pdx-statistic')).toEqual(['compare', 'description', 'title', 'trend', 'value']);
});

test('pdx-statistic: its size still draws from the host with no class on it', async ({ page }) => {
    await mount(page, '<pdx-statistic title="A" value="1"></pdx-statistic><pdx-statistic size="lg" title="B" value="2"></pdx-statistic>');
    await expect(page.locator('#f [data-part="value"]')).toHaveCount(2);
    const sizes = await page.locator('#f [data-part="value"]').evaluateAll((v) => v.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    expect(sizes[1], 'the lg value is drawn larger than the md one').toBeGreaterThan(sizes[0]);
});

test('pdx-description-list and pdx-empty-state: no class on the host, parts named, still laid out', async ({ page }) => {
    await mount(page, `<pdx-description-list></pdx-description-list>
        <pdx-empty-state title="Nothing yet" description="Add one" action-label="Add"></pdx-empty-state>`);
    await page.locator('#f pdx-description-list').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ label: 'Name', value: 'Ada' }]; });
    await expect(page.locator('#f pdx-description-list [data-part="root"] dd')).toHaveText('Ada');
    await expect(page.locator('#f pdx-empty-state [data-part="action"]')).toHaveText('Add');
    const m = await page.evaluate(() => {
        const dl = document.querySelector('#f pdx-description-list')!;
        const es = document.querySelector('#f pdx-empty-state')!;
        return {
            dlClass: dl.getAttribute('class'), dlPosition: getComputedStyle(dl).position,
            esClass: es.getAttribute('class'), esDisplay: getComputedStyle(es).display,
        };
    });
    expect(m).toEqual({ dlClass: null, dlPosition: 'relative', esClass: null, esDisplay: 'flex' });
    expect(await parts(page, '#f pdx-empty-state')).toEqual(['action', 'description', 'icon', 'title']);
});

test('pdx-empty-state: pdx-action is declared and stays on the empty state', async ({ page }) => {
    await mount(page, '<pdx-empty-state title="Nothing yet" action-label="Add"></pdx-empty-state>');
    const host = page.locator('#f pdx-empty-state');
    await expect(page.locator('#f [data-part="action"]')).toHaveCount(1);
    await host.evaluate((h) => {
        const log = { own: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('pdx-action', () => { log.own++; });
        h.parentElement!.addEventListener('pdx-action', () => { log.parent++; });
    });
    await page.locator('#f [data-part="action"]').click();
    expect(await page.evaluate(() => (window as unknown as { __log: unknown }).__log)).toEqual({ own: 1, parent: 0 });
});

test('pdx-progress: a ring spins while indeterminate and stops once it has a value; parts named', async ({ page }) => {
    await mount(page, '<pdx-progress circular show-label></pdx-progress><pdx-progress value="40" show-label></pdx-progress>');
    const ring = page.locator('#f pdx-progress[circular] [data-part="ring"]');
    await expect(ring).toHaveCount(1);
    const spin = () => ring.evaluate((r) => getComputedStyle(r).animationName);
    await expect.poll(spin, { message: 'an indeterminate ring spins' }).toBe('pdx-ring-spin');
    await page.locator('#f pdx-progress[circular]').evaluate((h) => { (h as unknown as { value: number }).value = 60; });
    await frames(page);
    await expect.poll(spin, { message: 'a ring with a value spins on' }).toBe('none');
    expect(await parts(page, '#f pdx-progress:not([circular])')).toEqual(['bar', 'label', 'root']);
    expect(await parts(page, '#f pdx-progress[circular]')).toEqual(['label', 'ring', 'root']);
});

test('pdx-badge: its status is in the tree with something to say, and out of it when hidden (A4)', async ({ page }) => {
    await mount(page, '<pdx-badge value="3" label="3 unread"></pdx-badge><pdx-badge value="0"></pdx-badge><pdx-badge dot variant="success" label="Online"></pdx-badge>');
    await frames(page);
    const statuses = await page.locator('#f').getByRole('status').evaluateAll((s) => s.map((e) => e.getAttribute('aria-label') || e.textContent));
    expect(statuses, 'the zero badge is hidden: no empty status in the tree').toEqual(['3 unread', 'Online']);
});
