// The data family's fourth batch on the beta contract (#292): the composites. Their events are
// declared and stay on the host; their pieces are parts; pdx-relation-picker keeps no class on its host;
// the A-rules hold through the grid they render (A3, A4 for the picker; A3, A5 for the entity grid).
// Measured in Chromium.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

const frames = (page: Page, n = 4) => page.evaluate((count) => new Promise((r) => {
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

/** The element's own parts, not those of a component nested in it. */
const ownParts = (page: Page, sel: string) => page.locator(sel).evaluate((h) => [...new Set([...h.querySelectorAll('[data-part]')]
    .filter((e) => { let p = e.parentElement; while (p && !p.tagName.includes('-')) p = p.parentElement; return p === h; })
    .map((e) => e.getAttribute('data-part')))].sort());

const SIX = [
    { id: 1, name: 'Northwind' }, { id: 2, name: 'Contoso' }, { id: 3, name: 'Fabrikam' },
    { id: 4, name: 'Adventure Works' }, { id: 5, name: 'Tailspin' }, { id: 6, name: 'Wide World' },
];

test.beforeEach(async ({ page }) => { await openPage(page, '/gotchas.html?case=data-a-beta-contract'); });

test.describe('pdx-relation-picker', () => {
    test('no class on its host; its grid, footer, count and buttons are parts', async ({ page }) => {
        await mount(page, '<pdx-relation-picker id="rp" create-label="New"></pdx-relation-picker>');
        await page.locator('#rp').evaluate((h, rows) => {
            const w = window as unknown as { __ds(o: unknown): unknown };
            Object.assign(h, { source: w.__ds({ data: rows, pageSize: 3 }), columns: [{ field: 'name', header: 'Customer' }] });
        }, SIX);
        await frames(page);
        expect(await page.locator('#rp').getAttribute('class')).toBeNull();
        expect(await ownParts(page, '#rp')).toEqual(['add', 'count', 'create', 'foot', 'grid']);
    });

    test('A3 — a page of its source carries the total through its grid', async ({ page }) => {
        await mount(page, '<pdx-relation-picker id="rp"></pdx-relation-picker>');
        await page.locator('#rp').evaluate((h, rows) => {
            const w = window as unknown as { __ds(o: unknown): unknown };
            Object.assign(h, { source: w.__ds({ data: rows, pageSize: 3 }), columns: [{ field: 'name', header: 'Customer' }] });
        }, SIX);
        await frames(page);
        // Header row + six: three on screen, the total announced.
        await expect(page.locator('#rp [role="grid"]')).toHaveAttribute('aria-rowcount', '7');
    });

    test('A4 — while its source is pending its grid is aria-busy, and not once it has settled', async ({ page }) => {
        await mount(page, '<pdx-relation-picker id="rp"></pdx-relation-picker>');
        await page.locator('#rp').evaluate((h) => {
            const w = window as unknown as { __pending(n: number): { ds: unknown; settle(d: unknown[], t: number): void }; __settle: unknown };
            const p = w.__pending(3);
            w.__settle = p.settle;
            Object.assign(h, { source: p.ds, columns: [{ field: 'name', header: 'Customer' }] });
        });
        await frames(page);
        const grid = page.locator('#rp [role="grid"]');
        await expect(grid).toHaveAttribute('aria-busy', 'true');
        await page.evaluate((rows) => (window as unknown as { __settle(d: unknown[], t: number): void }).__settle(rows.slice(0, 3), 6), SIX);
        await expect(grid).not.toHaveAttribute('aria-busy', /.*/);
    });
});

test.describe('pdx-entity-grid', () => {
    const SCHEMA = { fields: [{ name: 'name', label: 'Name', type: 'text' }] };

    test('its toolbar, title and create button are parts', async ({ page }) => {
        await mount(page, '<pdx-entity-grid id="eg" title="Customers"></pdx-entity-grid>');
        await page.locator('#eg').evaluate((h, a) => {
            Object.assign(h, { schema: a.schema, columns: [{ field: 'name', header: 'Name' }], data: a.rows });
        }, { schema: SCHEMA, rows: SIX });
        await frames(page);
        expect(await ownParts(page, '#eg')).toEqual(['add', 'title', 'toolbar']);
    });

    test('A3 and A5 through its grid: the total, and each sortable header named by its label with aria-sort', async ({ page }) => {
        await mount(page, '<pdx-entity-grid id="eg" title="Customers"></pdx-entity-grid>');
        await page.locator('#eg').evaluate((h, a) => {
            Object.assign(h, { schema: a.schema, columns: [{ field: 'name', header: 'Name', sortable: true }], data: a.rows });
        }, { schema: SCHEMA, rows: SIX });
        await frames(page);
        await expect(page.locator('#eg [role="grid"]')).toHaveAttribute('aria-rowcount', '7');
        const header = page.locator('#eg').getByRole('columnheader', { name: 'Name', exact: true });
        await expect(header).toHaveCount(1);
        await expect(header).toHaveAttribute('aria-sort', 'none');
    });
});

test.describe('pdx-edit-drawer', () => {
    test('busy is a state, and its header, form, footer and buttons are parts', async ({ page }) => {
        await mount(page, '<pdx-edit-drawer id="ed" busy></pdx-edit-drawer>');
        await page.locator('#ed').evaluate((h) => {
            Object.assign(h, { schema: { fields: [{ name: 'name', label: 'Name', type: 'text' }] }, open: true });
        });
        await frames(page);
        expect(await page.locator('#ed').evaluate((h) => h.matches(':state(busy)'))).toBe(true);
        // The drawer may move its panel to <body>: the parts are looked for in the document, by where
        // they sit in the edit drawer's own markup.
        await expect(page.locator('.pdx-edit-drawer > [data-part="header"]')).toHaveCount(1);
        await expect(page.locator('.pdx-edit-drawer > [data-part="body"]')).toHaveCount(1);
        const actions = page.locator('[data-part="actions"]:has(> [data-part="cancel"]):has(> [data-part="save"])');
        await expect(actions).toHaveCount(1);
        await expect(actions.locator('[data-part="save"]')).toBeDisabled();
        await page.locator('#ed').evaluate((h) => { (h as unknown as { busy: boolean }).busy = false; });
        await expect.poll(() => page.locator('#ed').evaluate((h) => h.matches(':state(busy)'))).toBe(false);
    });
});

test.describe('pdx-bulk-actions', () => {
    test('its events stay on the host: the host hears pdx-action, a parent does not', async ({ page }) => {
        await mount(page, '<div id="parent"><pdx-bulk-actions id="ba" count="2"></pdx-bulk-actions></div>');
        await page.locator('#ba').evaluate((h) => {
            const w = window as unknown as { __host: unknown[]; __parent: unknown[] };
            w.__host = []; w.__parent = [];
            (h as unknown as { actions: unknown }).actions = [{ key: 'archive', label: 'Archive' }];
            h.addEventListener('pdx-action', (e) => w.__host.push((e as CustomEvent).detail.key));
            document.getElementById('parent')!.addEventListener('pdx-action', () => w.__parent.push('heard'));
        });
        await frames(page, 2);
        expect(await ownParts(page, '#ba')).toEqual(['action', 'clear', 'count', 'root']);
        await page.locator('#ba [data-part="action"]').click();
        expect(await page.evaluate(() => (window as unknown as { __host: unknown[] }).__host)).toEqual(['archive']);
        expect(await page.evaluate(() => (window as unknown as { __parent: unknown[] }).__parent)).toEqual([]);
    });
});
