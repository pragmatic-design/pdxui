// The data family's last row on the beta contract (#292): pdx-timeline. Its mode, its connector and its
// dots' alignment are variant axes reflected on the host — `connector-style` and `dot-align` in
// kebab-case (#834) — and the design CSS draws them from there, not from classes on its list; pending
// and clickable are states; a clickable item's click and keys are one listener on the list. Measured in
// Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 3) => page.evaluate((count) => new Promise((r) => {
    let left = count;
    const tick = () => (--left <= 0 ? r(null) : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
}), n);

/** A fresh <div id="f"> holding `html`, with the components it names loaded. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
}

const EVENTS = [{ title: 'Ordered' }, { title: 'Shipped' }, { title: 'Delivered' }];
const setItems = (page: Page, sel: string, items: unknown[]) =>
    page.locator(sel).evaluate((h, it) => { (h as unknown as { items: unknown }).items = it; }, items);

/** Mount a clickable timeline of `n` events, counting the listeners on what it renders. */
async function listenersFor(page: Page, n: number): Promise<number> {
    await mount(page, '<div id="holder"></div>');
    return page.evaluate(async (count) => {
        const proto = EventTarget.prototype;
        const original = proto.addEventListener;
        const targets: EventTarget[] = [];
        proto.addEventListener = function (this: EventTarget, ...args: Parameters<typeof original>) { targets.push(this); return original.apply(this, args); };
        const t = document.createElement('pdx-timeline') as HTMLElement & { items: unknown };
        try {
            t.setAttribute('clickable', '');
            t.items = Array.from({ length: count }, (_, i) => ({ title: `Event ${i + 1}` }));
            document.getElementById('holder')!.appendChild(t);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
            if (t.querySelectorAll('li').length !== count) throw new Error('the timeline did not render its events');
        } finally {
            proto.addEventListener = original;
        }
        return targets.filter((x) => x instanceof Node && t.contains(x)).length;
    }, n);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-timeline', () => {
    test('its mode, connector and dot alignment are reflected on the host, in kebab-case, and no class says them', async ({ page }) => {
        await mount(page, '<pdx-timeline id="t" connector-style="dashed" dot-align="center"></pdx-timeline>');
        await setItems(page, '#t', EVENTS);
        await frames(page);
        const t = page.locator('#t');
        await expect(t).toHaveAttribute('mode', 'left');
        await expect(t).toHaveAttribute('connector-style', 'dashed');
        await expect(t).toHaveAttribute('dot-align', 'center');
        expect(await t.evaluate((h) => h.hasAttribute('connectorstyle') || h.hasAttribute('dotalign'))).toBe(false);
        expect(await t.getAttribute('class')).toBeNull();
        expect(await page.locator('#t [data-part="list"]').getAttribute('class')).toBe('pdx-tl');
    });

    test('the design CSS draws them from the host: a dashed connector, a centred dot, a horizontal row', async ({ page }) => {
        await mount(page, '<pdx-timeline id="d" connector-style="dashed"></pdx-timeline><pdx-timeline id="h" mode="horizontal"></pdx-timeline>');
        await setItems(page, '#d', EVENTS);
        await setItems(page, '#h', EVENTS);
        await frames(page);
        expect(await page.locator('#d [data-part="line"]').first().evaluate((l) => getComputedStyle(l).borderLeftStyle)).toBe('dashed');
        expect(await page.locator('#h [data-part="list"]').evaluate((l) => getComputedStyle(l).flexDirection)).toBe('row');
        await page.locator('#d').evaluate((h) => { h.setAttribute('connector-style', 'dotted'); });
        await expect.poll(() => page.locator('#d [data-part="line"]').first().evaluate((l) => getComputedStyle(l).borderLeftStyle)).toBe('dotted');
    });

    test('pending and clickable are states; its pieces are parts', async ({ page }) => {
        await mount(page, '<pdx-timeline id="t" pending clickable></pdx-timeline>');
        await setItems(page, '#t', [{ title: 'Ordered', description: 'Paid', date: 'Nov 2' }]);
        await frames(page);
        expect(await page.locator('#t').evaluate((h) => h.matches(':state(pending):state(clickable)'))).toBe(true);
        const parts = await page.locator('#t').evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')].map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['content', 'date', 'description', 'dot', 'item', 'line', 'list', 'pending', 'title', 'track']);
    });

    test('a clickable item\'s click and keys are one listener on the list: 200 events add no more than 2', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load('<pdx-timeline></pdx-timeline>'));
        const few = await listenersFor(page, 2);
        const many = await listenersFor(page, 200);
        expect(many, `2 events: ${few} listeners, 200 events: ${many}`).toBe(few);
    });

    test('a click, Enter and Space on an item still emit pdx-click with it', async ({ page }) => {
        await mount(page, '<pdx-timeline id="t" clickable></pdx-timeline>');
        await setItems(page, '#t', EVENTS);
        await page.locator('#t').evaluate((h) => {
            (window as unknown as { __clicks: number[] }).__clicks = [];
            h.addEventListener('pdx-click', (e) => (window as unknown as { __clicks: number[] }).__clicks.push((e as CustomEvent).detail.index));
        });
        await frames(page);
        const items = page.locator('#t [data-part="item"]');
        await items.nth(1).click();
        await items.nth(2).focus();
        await page.keyboard.press('Enter');
        await items.nth(0).focus();
        await page.keyboard.press(' ');
        expect(await page.evaluate(() => (window as unknown as { __clicks: number[] }).__clicks)).toEqual([1, 2, 0]);
    });
});
