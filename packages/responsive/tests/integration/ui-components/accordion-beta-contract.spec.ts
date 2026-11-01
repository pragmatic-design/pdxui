// pdx-accordion on the beta contract (#290): it has no prop for its open items, so which are open is a
// read-only output — `open-change` `{ value }`, the keys of the open items, in place of `pdx-change`
// `{ open }`; it is declared, so it stays on the accordion; `loading` and `disabled` are custom states,
// and loading the accordion is `aria-busy` (A4); the items, triggers and panels it wires are parts.
// Measured in Chromium.
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

const ITEM = (key: string) => `<div data-accordion-item="${key}"><button data-accordion-trigger>${key}</button><div data-accordion-content>Body of ${key}</div></div>`;
const ACC = (attrs = '') => `<pdx-accordion ${attrs}>${ITEM('a')}${ITEM('b')}${ITEM('c')}</pdx-accordion>`;
const host = (page: Page) => page.locator('#f pdx-accordion');
const trigger = (page: Page, k: string) => page.locator(`#f [data-accordion-item="${k}"] [data-accordion-trigger]`);

/** Record, from now on, what the accordion announces on itself and what reaches its parent. */
async function record(page: Page): Promise<() => Promise<{ open: unknown[]; alpha: number; parent: number }>> {
    await host(page).evaluate((h) => {
        const log = { open: [] as unknown[], alpha: 0, parent: 0 };
        (window as unknown as { __log: typeof log }).__log = log;
        h.addEventListener('open-change', (e) => log.open.push((e as CustomEvent).detail?.value));
        h.addEventListener('pdx-change', () => { log.alpha++; });
        h.parentElement!.addEventListener('open-change', () => { log.parent++; });
    });
    return () => page.evaluate(() => (window as unknown as { __log: { open: unknown[]; alpha: number; parent: number } }).__log);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=accordion-beta-contract'); });

test('opening and closing announces open-change { value }, the open items\' keys; pdx-change is gone and nothing bubbles', async ({ page }) => {
    await mount(page, ACC('mode="multiple"'));
    // Written by the accordion once it has wired its items: wait on it, not on a visible box.
    await expect(trigger(page, 'a')).toHaveAttribute('aria-expanded', 'false');
    const log = await record(page);
    await trigger(page, 'a').click();
    await trigger(page, 'c').click();
    await trigger(page, 'a').click();
    expect(await log()).toEqual({ open: [['a'], ['a', 'c'], ['c']], alpha: 0, parent: 0 });
});

test('in single mode, opening one closes the other: one announcement, the one open key', async ({ page }) => {
    await mount(page, ACC());
    await expect(trigger(page, 'a')).toHaveAttribute('aria-expanded', 'false');
    const log = await record(page);
    await trigger(page, 'a').click();
    await trigger(page, 'b').click();
    await host(page).evaluate((h) => (h as unknown as { collapseAll(): void }).collapseAll());
    expect((await log()).open).toEqual([['a'], ['b'], []]);
});

test('the items, triggers and panels it wires are parts', async ({ page }) => {
    await mount(page, ACC());
    await expect(trigger(page, 'a')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#f [data-part="item"]')).toHaveCount(3);
    await expect(page.locator('#f [data-part="trigger"]')).toHaveCount(3);
    await expect(page.locator('#f [data-part="panel"]')).toHaveCount(3);
    await expect(page.locator('#f [data-part="panel"]').first()).toHaveAttribute('role', 'region');
});

test('loading and disabled are custom states; loading, the accordion is aria-busy, and not otherwise (A4)', async ({ page }) => {
    await mount(page, ACC('loading disabled'));
    await expect(host(page)).toHaveAttribute('aria-busy', 'true');
    const states = () => host(page).evaluate((h) => ['loading', 'disabled'].filter((s) => h.matches(`:state(${s})`)));
    expect(await states()).toEqual(['loading', 'disabled']);
    await host(page).evaluate((h) => { Object.assign(h, { loading: false, disabled: false }); });
    await expect(host(page)).not.toHaveAttribute('aria-busy');
    await expect.poll(states).toEqual([]);
});
