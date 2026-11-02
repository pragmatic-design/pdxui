// The data family's first batch on the beta contract (#292): pdx-list. Its looks and its loading and
// empty conditions are custom states on the host, with no class of its own there; its list, items,
// empty state and overlay are parts; `renderItem` is gone (the `item` slot is the way). A3: a list that
// shows part of its source carries the source's total on its items. A4: the host is aria-busy while the
// source is pending, and not once it has settled. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** Put `html` in a fresh <div id="f"> and wait two frames for the components to build. */
async function mount(page: Page, html: string): Promise<void> {
    await page.evaluate(async (markup) => {
        await (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load(markup);
        document.getElementById('f')?.remove();
        const f = document.createElement('div');
        f.id = 'f';
        f.innerHTML = markup;
        document.body.appendChild(f);
    }, html);
    await frames(page);
}

const frames = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const LIST_STATES = ['bordered', 'dividers', 'loading', 'empty'];
const states = (page: Page, sel: string) => page.locator(sel).evaluate(
    (host, ns) => ns.filter((n) => host.matches(`:state(${n})`)), LIST_STATES);

/** The element's own parts: not those of a component nested in it. */
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => {
    const owner = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && !p.tagName.includes('-')) p = p.parentElement;
        return p;
    };
    return [...new Set([...h.querySelectorAll('[data-part]')].filter((e) => owner(e) === h).map((e) => e.getAttribute('data-part')))].sort();
});

/** Give the list `sel` a source built in the page: an array source, paged. */
const arraySource = (page: Page, sel: string, count: number, pageSize: number, pageNo = 1) => page.locator(sel).evaluate((h, [n, size, p]) => {
    const data = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
    const ds = (window as unknown as { __ds(o: unknown): { setPage(n: number): void } }).__ds({ data, pageSize: size });
    if (p > 1) ds.setPage(p);
    (h as unknown as { source: unknown }).source = ds;
}, [count, pageSize, pageNo] as const);

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-list', () => {
    test('bordered (the default) and dividers are states of the host, drawn so, with no class on the host', async ({ page }) => {
        await mount(page, '<pdx-list id="b" dividers></pdx-list><pdx-list id="p" bordered="false"></pdx-list>');
        await page.locator('#b').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]; });
        await page.locator('#p').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }]; });
        await frames(page);
        expect(await states(page, '#b')).toEqual(['bordered', 'dividers']);
        expect(await states(page, '#p')).toEqual([]);
        expect(await page.locator('#b').evaluate((h) => h.getAttribute('class'))).toBeNull();
        expect(await page.locator('#b').evaluate((h) => getComputedStyle(h).borderTopStyle)).toBe('solid');
        expect(await page.locator('#p').evaluate((h) => getComputedStyle(h).borderTopStyle)).toBe('none');
        expect(await page.locator('#b [data-part="item"]').nth(1).evaluate((i) => getComputedStyle(i).borderTopStyle)).toBe('solid');
    });

    test('empty is :state(empty), and its empty part shows; a list with items is not empty', async ({ page }) => {
        await mount(page, '<pdx-list id="e"></pdx-list><pdx-list id="i"></pdx-list>');
        await page.locator('#i').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }]; });
        await page.locator('#e').evaluate((h) => { (h as unknown as { items: unknown[] }).items = []; });
        await expect.poll(() => states(page, '#e')).toContain('empty');
        await expect(page.locator('#e [data-part="empty"]')).toBeVisible();
        await expect.poll(() => states(page, '#i')).not.toContain('empty');
    });

    test('A4 — while its source is pending the host is :state(loading) and aria-busy; once it settles, neither', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await page.locator('#l').evaluate((h) => {
            const p = (window as unknown as { __pending(n: number): { ds: unknown; settle(d: unknown[], t: number): void } }).__pending(10);
            (window as unknown as { __settle: unknown }).__settle = p.settle;
            (h as unknown as { source: unknown }).source = p.ds;
        });
        await expect.poll(() => states(page, '#l')).toContain('loading');
        await expect(page.locator('#l')).toHaveAttribute('aria-busy', 'true');
        await page.evaluate(() => (window as unknown as { __settle(d: unknown[], t: number): void }).__settle([{ id: 1, name: 'A' }], 1));
        await expect.poll(() => states(page, '#l')).not.toContain('loading');
        await expect(page.locator('#l')).not.toHaveAttribute('aria-busy', /.*/);
    });

    test('A3 — a page of a larger source: each item carries the total and its place in it', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await arraySource(page, '#l', 30, 10, 2);
        const items = page.locator('#l [data-part="item"]');
        await expect(items).toHaveCount(10);
        expect(await items.evaluateAll((els) => els.map((e) => [e.getAttribute('aria-setsize'), e.getAttribute('aria-posinset')])))
            .toEqual(Array.from({ length: 10 }, (_, i) => ['30', String(11 + i)]));
    });

    test('A3 control — a list that shows all of its items needs no total', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await arraySource(page, '#l', 5, 10);
        const items = page.locator('#l [data-part="item"]');
        await expect(items).toHaveCount(5);
        expect(await items.evaluateAll((els) => els.filter((e) => e.hasAttribute('aria-setsize')).length)).toBe(0);
    });

    test('its list, items, empty state and overlay are parts; the list part is the role="list"', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await page.locator('#l').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }]; });
        await frames(page);
        expect(await parts(page, '#l')).toEqual(['empty', 'item', 'list', 'overlay']);
        await expect(page.locator('#l [data-part="list"]')).toHaveAttribute('role', 'list');
    });

    test('control — a list over items it all shows carries no total, and is not busy', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await page.locator('#l').evaluate((h) => { (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }]; });
        await frames(page);
        await expect(page.locator('#l')).not.toHaveAttribute('aria-busy', /.*/);
        expect(await states(page, '#l')).not.toContain('loading');
    });

    test('renderItem is gone: a callback passed to it does not render the items', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await page.locator('#l').evaluate((h) => {
            (h as unknown as { renderItem: unknown }).renderItem = () => '<b class="cb">from the callback</b>';
            (h as unknown as { items: unknown[] }).items = [{ id: 1, name: 'A' }];
        });
        await frames(page);
        await expect(page.locator('#l [data-part="item"]')).toHaveText('A');
        await expect(page.locator('#l .cb')).toHaveCount(0);
    });
});

test.describe('pdx-sortable-list', () => {
    const ITEMS = '[{"id":1,"label":"One"},{"id":2,"label":"Two"},{"id":3,"label":"Three"}]';
    const boxes = (page: Page, sel: string) => page.locator(`${sel} [data-part="item"]`).evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top) };
    }));

    test('axis is a variant reflected on the host, vertical by default; horizontal lays the items in a row', async ({ page }) => {
        await mount(page, `<pdx-sortable-list id="v" items='${ITEMS}'></pdx-sortable-list><pdx-sortable-list id="h" axis="horizontal" items='${ITEMS}'></pdx-sortable-list>`);
        await expect(page.locator('#v')).toHaveAttribute('axis', 'vertical');
        await expect(page.locator('#h')).toHaveAttribute('axis', 'horizontal');
        const v = await boxes(page, '#v');
        const h = await boxes(page, '#h');
        expect(new Set(v.map((b) => b.x)).size, 'one column').toBe(1);
        expect(new Set(h.map((b) => b.y)).size, 'one row').toBe(1);
        expect(await page.locator('#h [data-part="item"]').nth(1).evaluate((i) => getComputedStyle(i).borderLeftStyle)).toBe('solid');
        expect(await page.locator('#v [data-part="item"]').nth(1).evaluate((i) => getComputedStyle(i).borderTopStyle)).toBe('solid');
    });

    test('no class on the host; disabled is :state(disabled), and its handles are aria-disabled', async ({ page }) => {
        await mount(page, `<pdx-sortable-list id="d" disabled items='${ITEMS}'></pdx-sortable-list><pdx-sortable-list id="e" items='${ITEMS}'></pdx-sortable-list>`);
        expect(await page.locator('#d').evaluate((h) => h.getAttribute('class'))).toBeNull();
        expect(await page.locator('#d').evaluate((h) => h.matches(':state(disabled)'))).toBe(true);
        expect(await page.locator('#e').evaluate((h) => h.matches(':state(disabled)'))).toBe(false);
        await expect(page.locator('#d [data-part="handle"]').first()).toHaveAttribute('aria-disabled', 'true');
    });

    test('its list, items, handles and bodies are parts', async ({ page }) => {
        await mount(page, `<pdx-sortable-list id="s" items='${ITEMS}'></pdx-sortable-list>`);
        expect(await parts(page, '#s')).toEqual(['body', 'handle', 'item', 'list']);
        await expect(page.locator('#s [data-part="list"]')).toHaveAttribute('role', 'list');
    });
});

test.describe('pdx-infinite-scroll', () => {
    const IS_STATES = ['loading', 'ended', 'disabled'];
    const isStates = (page: Page, sel: string) => page.locator(sel).evaluate((h, ns) => ns.filter((n) => h.matches(`:state(${n})`)), IS_STATES);

    test('A4 — while its source is pending it is :state(loading) and aria-busy, its status says so; once settled, neither', async ({ page }) => {
        await mount(page, '<pdx-infinite-scroll id="s"><p>feed</p></pdx-infinite-scroll>');
        await page.locator('#s').evaluate((h) => {
            const p = (window as unknown as { __pending(n: number): { ds: unknown; settle(d: unknown[], t: number): void } }).__pending(10);
            (window as unknown as { __settle: unknown }).__settle = p.settle;
            (h as unknown as { source: unknown }).source = p.ds;
        });
        await expect.poll(() => isStates(page, '#s')).toContain('loading');
        await expect(page.locator('#s')).toHaveAttribute('aria-busy', 'true');
        await expect(page.locator('#s [data-part="loading"]')).toBeVisible();
        // A total the first page completes: with more to load the visible sentinel would ask again.
        await page.evaluate(() => (window as unknown as { __settle(d: unknown[], t: number): void }).__settle([{ id: 1 }], 1));
        await expect.poll(() => isStates(page, '#s')).not.toContain('loading');
        await expect(page.locator('#s')).not.toHaveAttribute('aria-busy', /.*/);
        expect(await page.locator('#s [data-part="loading"]').evaluate((e) => e.textContent?.trim()), 'a status with nothing to say is empty').toBe('');
    });

    test('at the end of its source it is :state(ended) and its end status speaks; no class on the host', async ({ page }) => {
        await mount(page, '<pdx-infinite-scroll id="s"><p>feed</p></pdx-infinite-scroll>');
        await page.locator('#s').evaluate((h) => {
            const ds = (window as unknown as { __ds(o: unknown): unknown }).__ds({ data: [{ id: 1 }, { id: 2 }], pageSize: 10 });
            (h as unknown as { source: unknown }).source = ds;
        });
        await expect.poll(() => isStates(page, '#s')).toContain('ended');
        await expect(page.locator('#s [data-part="end"]')).not.toHaveText('');
        expect(await page.locator('#s').evaluate((h) => h.getAttribute('class'))).toBeNull();
    });

    test('disabled is :state(disabled); its sentinel, loading and end status are parts', async ({ page }) => {
        await mount(page, '<pdx-infinite-scroll id="s" disabled><p>feed</p></pdx-infinite-scroll>');
        expect(await isStates(page, '#s')).toContain('disabled');
        expect(await parts(page, '#s')).toEqual(['end', 'loading', 'sentinel']);
    });

    test('A3 — a list over the pages loaded so far numbers its items from the first, against the total', async ({ page }) => {
        await mount(page, '<pdx-list id="l"></pdx-list>');
        await page.locator('#l').evaluate(async (h) => {
            const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
            const ds = (window as unknown as { __ds(o: unknown): { loadMore(): Promise<void> } }).__ds({ data, pageSize: 10 });
            (h as unknown as { source: unknown }).source = ds;
            await new Promise((r) => setTimeout(r, 50));
            await ds.loadMore();
        });
        const items = page.locator('#l [data-part="item"]');
        await expect(items).toHaveCount(20);
        expect(await items.evaluateAll((els) => els.map((e) => [e.getAttribute('aria-setsize'), e.getAttribute('aria-posinset')])))
            .toEqual(Array.from({ length: 20 }, (_, i) => ['25', String(i + 1)]));
    });
});
