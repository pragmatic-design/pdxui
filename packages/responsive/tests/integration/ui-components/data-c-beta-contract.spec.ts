// The data family's third batch on the beta contract (#292): pdx-data-grid. Its row events are
// delegated to its body (a grid of 200 rows adds no more listeners than a grid of 2), and a click, a
// checkbox, a double click, an action and a drag still do what they did. Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 2) => page.evaluate((count) => new Promise((r) => {
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

/**
 * Build a grid of `n` rows with every per-row feature it has — selection, reorder, expand, cell
 * editing, an actions column — and count the listeners added while it builds.
 */
async function listenersFor(page: Page, n: number): Promise<number> {
    await mount(page, '<div id="holder"></div>');
    return page.evaluate(async (count) => {
        const proto = EventTarget.prototype;
        const original = proto.addEventListener;
        const targets: EventTarget[] = [];
        proto.addEventListener = function (this: EventTarget, ...args: Parameters<typeof original>) { targets.push(this); return original.apply(this, args); };
        let grid: HTMLElement | null = null;
        /**
         * What can grow with the rows: listeners on the body and what it holds, and on the document and
         * the window. The header, the toolbar and the footer are built per column, and are rebuilt a
         * number of times that depends on the frames; anything a rebuild has thrown away is gone; and
         * other elements of the page are other components — the editors the grid prefetches upgrade the
         * page's own date pickers and dialogs when they load. All of those are left out.
         */
        const added = () => targets.filter((t) => {
            if (t === window || t === document) return true;
            const body = grid!.querySelector('.pdx-dg-body');
            return t instanceof Node && !!body && body.contains(t);
        }).length;
        try {
            const g = document.createElement('pdx-data-grid') as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            grid = g;
            g.setAttribute('selection', 'multiple');
            g.setAttribute('row-reorder', '');
            g.setAttribute('expandable', '');
            g.setAttribute('editable', '');
            g.setAttribute('show-footer', 'false');
            g.columns = [
                { field: 'name', header: 'Name' },
                { field: 'open', header: '', cell: { kind: 'actions', actions: [{ label: 'Open', onClick() { /* counted, not run */ } }] } },
            ];
            g.data = Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
            document.getElementById('holder')!.appendChild(g);
            await g.whenReady();
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
            // The editors and filters the grid prefetches load when the page is idle.
            await new Promise((r) => requestIdleCallback(() => r(null)));
            if (g.querySelectorAll('.pdx-dg-body [role="row"]').length !== count) throw new Error('the grid did not render its rows');
        } finally {
            proto.addEventListener = original;
        }
        return added();
    }, n);
}

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-data-grid', () => {
    test('its row events are delegated: 200 rows add no more listeners than 2', async ({ page }) => {
        await page.evaluate(() => (window as unknown as { __gotcha: { load(m: string): Promise<void> } }).__gotcha.load('<pdx-data-grid></pdx-data-grid>'));
        // A first grid, not counted: what a page sets up once — a module the grid loads, its global
        // listeners — is set up by it.
        await listenersFor(page, 2);
        const few = await listenersFor(page, 2);
        const many = await listenersFor(page, 200);
        expect(many, `2 rows: ${few} listeners, 200 rows: ${many}`).toBe(few);
    });

    test('a click on a row, its checkbox, its action, its expand button and a double click still do what they did', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" selection="multiple" expandable editable show-footer="false"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            const w = window as unknown as { __seen: string[] };
            w.__seen = [];
            g.columns = [
                { field: 'name', header: 'Name' },
                { field: 'open', header: '', cell: { kind: 'actions', actions: [{ label: 'Open', onClick: (row: { id: number }) => w.__seen.push(`action:${row.id}`) }] } },
            ];
            g.data = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }];
            for (const name of ['pdx-row-click', 'pdx-selection-change', 'pdx-row-expand']) {
                g.addEventListener(name, (e) => w.__seen.push(`${name}:${JSON.stringify((e as CustomEvent).detail?.id ?? '')}`));
            }
            await g.whenReady();
        });
        await frames(page, 3);
        const row1 = page.locator('#g .pdx-dg-body [data-row-id="1"]');
        await row1.locator('[data-field="name"]').click();
        await row1.locator('.pdx-dg-checkbox input').click();
        await page.locator('#g .pdx-dg-body [data-row-id="2"] .pdx-dg-checkbox').click({ position: { x: 2, y: 2 } });
        await row1.getByRole('button', { name: 'Open' }).click();
        await row1.locator('.pdx-dg-expand-btn').click();
        const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
        // The row click, once; the checkbox and its cell select without a row click; the action and the
        // expand button do not click the row either.
        expect(seen.filter((s) => s.startsWith('pdx-row-click'))).toEqual(['pdx-row-click:1']);
        expect(seen).toContain('action:1');
        expect(seen).toContain('pdx-row-expand:1');
        expect(await page.locator('#g').evaluate((g) => (g as unknown as { getSelectedIds(): unknown[] }).getSelectedIds())).toEqual([1, 2]);
        await page.locator('#g .pdx-dg-body [data-row-id="2"] [data-field="name"]').dblclick();
        await expect(page.locator('#g .pdx-dg-body [data-row-id="2"] [data-field="name"].pdx-dg-cell-editing')).toHaveCount(1);
    });

    test('a dragged row reports where it went', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" row-reorder show-footer="false"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            g.columns = [{ field: 'name', header: 'Name' }];
            g.data = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }, { id: 3, name: 'Cy' }];
            g.addEventListener('pdx-row-reorder', (e) => { (window as unknown as { __moved: unknown }).__moved = (e as CustomEvent).detail; });
            await g.whenReady();
        });
        await frames(page, 3);
        await page.locator('#g .pdx-dg-body [data-row-id="1"]').dragTo(page.locator('#g .pdx-dg-body [data-row-id="3"]'));
        expect(await page.evaluate(() => (window as unknown as { __moved: unknown }).__moved)).toEqual({ from: 0, to: 2, fromId: 1, toId: 3 });
    });
});
