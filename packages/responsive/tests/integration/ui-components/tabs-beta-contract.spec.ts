// pdx-tabs on the beta contract (#289): `value` is a model, so a click or a key that changes the tab
// writes it and announces `value-change` `{ value }`, which `::value` follows, in place of `pdx-change`;
// a parent's write moves the tabs and announces nothing; `loading` busies the panel (A4); `loading`,
// `bordered` and an overflowing strip are custom states on the host, with no class; the strip, a tab,
// a panel and the indicator are parts; `next()` drives it from an invoker. Measured in Chromium.
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

const TABS = (attrs = '') => `<pdx-tabs label="Sections" ${attrs}>
    <div class="pdx-tabs">
        <button class="pdx-tab" data-tab="a">Alpha</button>
        <button class="pdx-tab" data-tab="b">Beta</button>
        <button class="pdx-tab" data-tab="c">Gamma</button>
    </div>
    <div data-tab-panel="a">Panel A</div>
    <div data-tab-panel="b">Panel B</div>
    <div data-tab-panel="c">Panel C</div>
</pdx-tabs>`;

/** Record on window the `value-change` values and the count of `pdx-change` events of #f's tabs. */
const listen = (page: Page) => page.evaluate(() => {
    const log = { value: [] as string[], alpha: 0 };
    (window as unknown as { __log: typeof log }).__log = log;
    const host = document.querySelector('#f pdx-tabs, #bound pdx-tabs')!;
    host.addEventListener('value-change', (e) => log.value.push((e as CustomEvent<{ value: string }>).detail.value));
    host.addEventListener('pdx-change', () => { log.alpha++; });
});
const log = (page: Page) => page.evaluate(() => (window as unknown as { __log: { value: string[]; alpha: number } }).__log);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=tabs-beta-contract'); });

test('a click and an arrow key write value and announce value-change { value }, and no pdx-change', async ({ page }) => {
    await mount(page, TABS('value="a"'));
    await listen(page);
    await page.getByRole('tab', { name: 'Beta' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Beta' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    expect(await page.locator('#f pdx-tabs').evaluate((h) => (h as HTMLElement & { value: string }).value)).toBe('c');
    expect(await log(page)).toEqual({ value: ['b', 'c'], alpha: 0 });
});

test('::value bound to a signal follows a click; setting the signal moves the tabs and announces nothing', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    const readValue = () => page.evaluate(() => (window as unknown as { __gotcha: { readValue(): string } }).__gotcha.readValue());
    const setValue = (v: string) => page.evaluate((x) => (window as unknown as { __gotcha: { setValue(v: string): void } }).__gotcha.setValue(x), v);
    await expect(page.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    await listen(page);

    await page.getByRole('tab', { name: 'Gamma' }).click();
    await expect.poll(readValue).toBe('c');

    await setValue('a');
    await expect(page.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Alpha' })).toBeVisible();
    expect(await log(page)).toEqual({ value: ['c'], alpha: 0 });
});

test('a button with command="--next" moves to the next tab', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { __gotcha: { mountBound(): void } }).__gotcha.mountBound());
    await expect(page.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('[data-test="next"]').click();
    await expect(page.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
});

test('A4 — loading busies the active panel, not the host, and nothing while not loading', async ({ page }) => {
    await mount(page, `<div data-k="on">${TABS('value="b" loading')}</div><div data-k="off">${TABS('value="b"')}</div>`);
    const panel = (k: string) => page.locator(`#f [data-k="${k}"] [data-tab-panel="b"]`);
    await expect(panel('on')).toHaveAttribute('aria-busy', 'true');
    await expect(panel('off')).not.toHaveAttribute('aria-busy');
    await expect(page.locator('#f [data-k="on"] pdx-tabs')).not.toHaveAttribute('aria-busy');
    // It follows the prop.
    await page.locator('#f [data-k="on"] pdx-tabs').evaluate((h) => { (h as HTMLElement & { loading: boolean }).loading = false; });
    await expect(panel('on')).not.toHaveAttribute('aria-busy');
});

test('loading, bordered and an overflowing strip are custom states on the host, with no class', async ({ page }) => {
    await mount(page, `<div data-k="plain">${TABS()}</div><div data-k="marked">${TABS('loading bordered')}</div>`
        + `<div data-k="narrow" style="width: 90px">${TABS()}</div>`);
    const states = (k: string) => page.locator(`#f [data-k="${k}"] pdx-tabs`).evaluate((h) =>
        ['loading', 'bordered', 'overflow'].filter((s) => h.matches(`:state(${s})`)));
    expect(await states('plain')).toEqual([]);
    expect(await states('marked')).toEqual(['loading', 'bordered']);
    await expect.poll(() => states('narrow')).toEqual(['overflow']);
    expect(await page.locator('#f .pdx-tabs-bordered, #f [data-overflow]').count()).toBe(0);
});

test('the strip, each tab, each panel and the indicator are parts', async ({ page }) => {
    await mount(page, TABS('value="a"'));
    await expect(page.locator('#f [data-part="list"]')).toHaveAttribute('role', 'tablist');
    expect(await page.locator('#f [data-part="tab"]').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['tab', 'tab', 'tab']);
    expect(await page.locator('#f [data-part="panel"]').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['tabpanel', 'tabpanel', 'tabpanel']);
    await expect(page.locator('#f [data-part="indicator"]')).toHaveCount(1);
});
