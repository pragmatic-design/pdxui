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

    test('its looks are states of the host, and the wrapper keeps no class for them', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" striped compact row-clickable fill-height show-footer="false"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            g.columns = [{ field: 'name', header: 'Name' }];
            g.data = [{ id: 1, name: 'Ada' }];
            await g.whenReady();
        });
        await frames(page, 3);
        const states = await page.locator('#g').evaluate((h) => ['striped', 'hover', 'row-clickable', 'compact', 'sticky-header', 'fill-height', 'empty', 'loading', 'editing']
            .filter((s) => h.matches(`:state(${s})`)));
        expect(states).toEqual(['striped', 'hover', 'row-clickable', 'compact', 'sticky-header', 'fill-height']);
        expect(await page.locator('#g .pdx-dg').getAttribute('class')).toBe('pdx-dg');
        await page.locator('#g').evaluate((h) => { (h as unknown as { striped: boolean }).striped = false; });
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(striped)'))).toBe(false);
    });

    test('row-clickable is a state set by the property as by the attribute, and absent without either', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="a" row-clickable></pdx-data-grid><pdx-data-grid id="p"></pdx-data-grid><pdx-data-grid id="n"></pdx-data-grid>');
        await page.locator('#p').evaluate((h) => { (h as unknown as { rowClickable: boolean }).rowClickable = true; });
        const clickable = (id: string) => page.locator(id).evaluate((h) => h.matches(':state(row-clickable)'));
        await expect.poll(() => clickable('#a')).toBe(true);
        await expect.poll(() => clickable('#p')).toBe(true);
        expect(await clickable('#n')).toBe(false);
    });

    test('empty and editing are states; its pieces are parts', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" editable show-toolbar show-footer="true"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            g.columns = [{ field: 'name', header: 'Name' }];
            g.data = [];
            await g.whenReady();
        });
        await frames(page, 3);
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(empty)'))).toBe(true);
        await page.locator('#g').evaluate((h) => { (h as unknown as { data: unknown }).data = [{ id: 1, name: 'Ada' }]; });
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(empty)'))).toBe(false);
        await page.locator('#g .pdx-dg-body [data-row-id="1"] [data-field="name"]').dblclick();
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(editing)'))).toBe(true);
        // The editor loads lazily and takes the focus a frame later: Escape goes to it then.
        await expect(page.locator('#g .pdx-dg-cell-editing input')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(editing)'))).toBe(false);
        const parts = await page.locator('#g').evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')]
            .filter((e) => { let p = e.parentElement; while (p && !p.tagName.includes('-')) p = p.parentElement; return p === h; })
            .map((e) => e.getAttribute('data-part')))].sort());
        expect(parts).toEqual(['body', 'cell', 'column-header', 'empty', 'footer', 'grid', 'header', 'loading', 'row', 'toolbar']);
    });

    test('A3 — a page of a larger source carries its total in aria-rowcount, and each row its index', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" show-footer="false"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            const w = window as unknown as { __ds(o: unknown): unknown };
            g.columns = [{ field: 'name', header: 'Name' }];
            g.source = w.__ds({ data: Array.from({ length: 1240 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` })), pageSize: 25 });
            await g.whenReady();
        });
        await frames(page, 3);
        const grid = page.locator('#g [role="grid"]');
        // The header row counts, as ARIA defines: 1 + 1240.
        await expect(grid).toHaveAttribute('aria-rowcount', '1241');
        await expect(page.locator('#g .pdx-dg-body [role="row"]').nth(2)).toHaveAttribute('aria-rowindex', '4');
    });

    test('A4 — while its source is pending the grid is aria-busy and :state(loading); the empty status speaks only when empty', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" show-footer="false"></pdx-data-grid>');
        await page.locator('#g').evaluate(async (el) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            const w = window as unknown as { __pending(n: number): { ds: unknown; settle(d: unknown[], t: number): void }; __settle: unknown };
            const p = w.__pending(25);
            w.__settle = p.settle;
            g.columns = [{ field: 'name', header: 'Name' }];
            g.source = p.ds;
            (p.ds as { read(): void }).read?.();
            await g.whenReady();
        });
        await frames(page, 3);
        const grid = page.locator('#g [role="grid"]');
        // The empty state's status; the loading overlay's spinner is a status of its own, shown while it loads.
        const status = page.locator('#g [data-part="empty"][role="status"]');
        await expect(grid).toHaveAttribute('aria-busy', 'true');
        expect(await page.locator('#g').evaluate((h) => h.matches(':state(loading)'))).toBe(true);
        await expect(status).toHaveText('');
        await page.evaluate(() => (window as unknown as { __settle(d: unknown[], t: number): void }).__settle([{ id: 1, name: 'Ada' }], 1));
        await expect(grid).not.toHaveAttribute('aria-busy', /.*/);
        await expect.poll(() => page.locator('#g').evaluate((h) => h.matches(':state(loading)'))).toBe(false);
        await expect(status).toHaveText('');
        await page.locator('#g').evaluate((h) => { (h as unknown as { grid: { source: { setFilter(f: unknown[]): void } } }).grid.source.setFilter([{ field: 'name', operator: 'eq', value: 'nobody' }]); });
        await page.evaluate(() => (window as unknown as { __settle(d: unknown[], t: number): void }).__settle([], 0));
        await expect(status).not.toHaveText('');
    });

    test('A5 — each sortable header carries aria-sort, and is named by its label alone, filterable or not', async ({ page }) => {
        await mount(page, '<pdx-data-grid id="g" filterable filter-mode="popover" show-footer="false"></pdx-data-grid>');
        const COLS = [
            { field: 'name', header: 'Name', type: 'string', sortable: true },
            { field: 'price', header: 'Price', type: 'number', sortable: true },
            { field: 'due', header: 'Due', type: 'date', sortable: true },
            { field: 'paid', header: 'Paid', type: 'boolean', sortable: true },
            { field: 'note', header: 'Note', type: 'string', sortable: true, filterable: false },
        ];
        await page.locator('#g').evaluate(async (el, cols) => {
            const g = el as HTMLElement & Record<string, unknown> & { whenReady(): Promise<void> };
            g.columns = cols;
            g.data = [{ id: 1, name: 'Ada', price: 3, due: '2026-01-02', paid: true, note: 'x' }];
            await g.whenReady();
        }, COLS);
        await frames(page, 3);
        for (const c of COLS) {
            const header = page.getByRole('columnheader', { name: c.header, exact: true });
            await expect(header, `${c.header} (${c.type}) is not named by its label alone`).toHaveCount(1);
            await expect(header).toHaveAttribute('aria-sort', 'none');
        }
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
