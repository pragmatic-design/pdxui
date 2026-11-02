// The data family's second batch on the beta contract (#292): pdx-tree. Its row listeners are
// delegated to one on the tree (a tree of 200 nodes adds no more listeners than a tree of 2); a lazy
// branch that loads makes the tree :state(loading) and aria-busy (A4); its rows carry level, position
// and set size (A3); disabled is a state; its pieces are parts. Measured in Chromium.
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

/** The element's own parts: not those of a component nested in it. */
const parts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => {
    const owner = (e: Element): Element | null => {
        let p = e.parentElement;
        while (p && !p.tagName.includes('-')) p = p.parentElement;
        return p;
    };
    return [...new Set([...h.querySelectorAll('[data-part]')].filter((e) => owner(e) === h).map((e) => e.getAttribute('data-part')))].sort();
});

/** Mount a tree of `n` expanded leaves under one root, counting the listeners added while it builds. */
async function listenersFor(page: Page, n: number): Promise<number> {
    await mount(page, '<div id="holder"></div>');
    return page.evaluate(async (count) => {
        const proto = EventTarget.prototype;
        const original = proto.addEventListener;
        let added = 0;
        proto.addEventListener = function (this: EventTarget, ...args: Parameters<typeof original>) { added++; return original.apply(this, args); };
        try {
            const tree = document.createElement('pdx-tree') as HTMLElement & { nodes: unknown; defaultExpandAll: boolean };
            tree.defaultExpandAll = true;
            tree.nodes = [{ id: 'r', label: 'Root', children: Array.from({ length: count }, (_, i) => ({ id: `n${i}`, label: `Node ${i}` })) }];
            document.getElementById('holder')!.appendChild(tree);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
            if (tree.querySelectorAll('[role="treeitem"]').length !== count + 1) throw new Error('the tree did not render its rows');
        } finally {
            proto.addEventListener = original;
        }
        return added;
    }, n);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-tree', () => {
    test('its row listeners are delegated: 200 nodes add no more listeners than 2', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load('<pdx-tree></pdx-tree>'));
        const few = await listenersFor(page, 2);
        const many = await listenersFor(page, 200);
        expect(many, `2 nodes: ${few} listeners, 200 nodes: ${many}`).toBe(few);
    });

    test('a click still opens a branch, selects a row, and checks a box', async ({ page }) => {
        await mount(page, '<pdx-tree id="t" selection-mode="single"></pdx-tree><pdx-tree id="c" checkable></pdx-tree>');
        const NODES = [{ id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }] }, { id: 'b', label: 'B' }];
        await page.locator('#t').evaluate((h, n) => { (h as unknown as { nodes: unknown }).nodes = n; }, NODES);
        await page.locator('#c').evaluate((h, n) => { (h as unknown as { nodes: unknown }).nodes = n; }, NODES);
        await frames(page);
        await page.locator('#t [data-node-id="a"]').click();
        await expect(page.locator('#t [data-node-id="a"]')).toHaveAttribute('aria-expanded', 'true');
        await page.locator('#t [data-node-id="b"]').click();
        await expect(page.locator('#t [data-node-id="b"]')).toHaveAttribute('aria-selected', 'true');
        await page.locator('#c [data-node-id="b"] [data-part="check"]').click();
        await expect(page.locator('#c [data-node-id="b"]')).toHaveAttribute('aria-checked', 'true');
    });

    test('A4 — while a lazy branch loads the tree is :state(loading) and aria-busy; once loaded, neither', async ({ page }) => {
        await mount(page, '<pdx-tree id="t"></pdx-tree>');
        await page.locator('#t').evaluate((h) => {
            const t = h as unknown as { nodes: unknown; loadChildren: unknown };
            t.loadChildren = () => new Promise((r) => { (window as unknown as { __release: unknown }).__release = () => r([{ id: 'k', label: 'Kid' }]); });
            t.nodes = [{ id: 'p', label: 'Parent', isBranch: true }];
        });
        await frames(page);
        await page.locator('#t [data-node-id="p"]').click();
        const root = page.locator('#t [data-part="root"]');
        await expect.poll(() => page.locator('#t').evaluate((h) => h.matches(':state(loading)'))).toBe(true);
        await expect(root).toHaveAttribute('aria-busy', 'true');
        await page.evaluate(() => (window as unknown as { __release(): void }).__release());
        await expect.poll(() => page.locator('#t').evaluate((h) => h.matches(':state(loading)'))).toBe(false);
        await expect(root).not.toHaveAttribute('aria-busy', /.*/);
        await expect(page.locator('#t [data-node-id="k"]')).toHaveAttribute('aria-level', '2');
    });

    test('A3 — each row carries its level, its position and its set size', async ({ page }) => {
        await mount(page, '<pdx-tree id="t"></pdx-tree>');
        await page.locator('#t').evaluate((h) => { (h as unknown as { nodes: unknown }).nodes = [{ id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }, { id: 'a2', label: 'A2' }] }, { id: 'b', label: 'B' }]; });
        await frames(page);
        await page.locator('#t [data-node-id="a"]').click();
        const a2 = page.locator('#t [data-node-id="a2"]');
        await expect(a2).toHaveAttribute('aria-level', '2');
        await expect(a2).toHaveAttribute('aria-posinset', '2');
        await expect(a2).toHaveAttribute('aria-setsize', '2');
    });

    test('disabled is :state(disabled); its root, rows, groups, twisties, boxes and labels are parts', async ({ page }) => {
        await mount(page, '<pdx-tree id="t" checkable></pdx-tree>');
        await page.locator('#t').evaluate((h) => { (h as unknown as { nodes: unknown }).nodes = [{ id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }] }]; });
        await frames(page);
        await page.locator('#t [data-node-id="a"]').click();
        await page.locator('#t').evaluate((h) => { (h as unknown as { disabled: boolean }).disabled = true; });
        await frames(page);
        expect(await page.locator('#t').evaluate((h) => h.matches(':state(disabled)'))).toBe(true);
        expect(await parts(page, '#t')).toEqual(['check', 'group', 'item', 'label', 'root', 'twisty']);
        await expect(page.locator('#t [data-part="root"]')).toHaveAttribute('role', 'tree');
    });
});
