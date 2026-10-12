// The accessibility the framework guarantees, measured on the showcase (beta spec, agents.md,
// «Accessibility the framework guarantees»; acceptance: every rule A1–A6 holds on the showcase).
// A3, A4 and A5 here (#299); A1 is #249, A2 and A6 are #274.
//
// Read off the browser's accessibility tree — getByRole, aria attributes as Chromium exposes them —
// because that is what a screen reader and an agent read. Axe does not flag a status region that has
// text, and the components' own tests read classes, not the tree.
import { test, expect, type Page } from './fixture';

/** The customers in the simulated store (customers.spec.ts: «24 matching»). */
const CUSTOMERS = 24;

async function openDashboard(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-test="dashboard"]')).toBeVisible();
    // The queue has loaded: its three tickets are on screen (dashboard.spec.ts).
    await expect(page.locator('[data-test="queue"] .pdx-list-item')).toHaveCount(3);
}

test.describe('A3 — a list says how much of its source it shows', () => {
    test('/customers: the grid counts every customer while it shows its first page', async ({ page }) => {
        await page.goto('/customers');
        await expect(page.locator('[data-test="total"]')).toHaveText(`${CUSTOMERS} matching`);
        const grid = page.getByRole('grid').first();
        const headerRows = await grid.locator('[role="row"]:has([role="columnheader"])').count();
        expect(headerRows, 'no header row: the count below measures nothing').toBeGreaterThan(0);
        const shown = await grid.locator('[role="row"]:not(:has([role="columnheader"]))').count();
        expect(shown, 'the grid shows every customer, so it is not a partial list').toBeLessThan(CUSTOMERS);
        await expect(grid).toHaveAttribute('aria-rowcount', String(CUSTOMERS + headerRows));
    });

    test('/: every list in main shows its whole source, and no item says otherwise', async ({ page }) => {
        await openDashboard(page);
        const lists = page.locator('main [role="list"]');
        const count = await lists.count();
        expect(count, 'no list on the dashboard: the rule measures nothing').toBeGreaterThan(0);
        // The sources: the four KPI tiles and the three unassigned open tickets (dashboard.spec.ts).
        const expected = new Map([['kpis', 4], ['queue', 3]]);
        let measured = 0;
        for (let i = 0; i < count; i++) {
            const list = lists.nth(i);
            const items = list.locator(':scope > [role="listitem"], :scope > * > [role="listitem"]');
            const n = await items.count();
            const owner = await list.evaluate((el) => el.closest('[data-test]')?.getAttribute('data-test') ?? '');
            const key = owner.startsWith('kpi') ? 'kpis' : owner;
            if (expected.has(key)) {
                expect(n, `the ${key} list shows ${n} of ${expected.get(key)} items`).toBe(expected.get(key));
                measured++;
            }
            for (let j = 0; j < n; j++) {
                const setsize = await items.nth(j).getAttribute('aria-setsize');
                if (setsize !== null) expect(Number(setsize), `an item of the ${key || i} list claims a set of ${setsize}`).toBe(n);
            }
        }
        expect(measured, 'the KPI list and the queue were not both found').toBe(expected.size);
    });
});

test.describe('A4 — a region says it is busy only while it is', () => {
    test('/: the queue, once loaded, holds no status with something to say, and is not busy', async ({ page }) => {
        await openDashboard(page);
        const queue = page.locator('[data-test="queue"]');
        const statuses = queue.getByRole('status');
        const n = await statuses.count();
        for (let i = 0; i < n; i++) {
            const status = statuses.nth(i);
            const said = await status.evaluate((el) => (el.getAttribute('aria-label') ?? '') + (el.textContent ?? '').trim());
            expect(said, 'a loaded list still announces a status').toBe('');
        }
        await expect(queue.locator('pdx-list')).not.toHaveAttribute('aria-busy', 'true');
        // The tree, as an agent reads it: nothing named «Loading» / «Caricamento» in the queue.
        expect(await queue.ariaSnapshot()).not.toMatch(/status "/);
    });
});

test.describe('A5 — a column header is named by its label alone', () => {
    test('/customers: every labelled header is found by its label, and a sortable one has aria-sort', async ({ page }) => {
        await page.goto('/customers');
        await expect(page.locator('[data-test="total"]')).toHaveText(`${CUSTOMERS} matching`);
        const grid = page.getByRole('grid').first();
        const headers = grid.locator('[role="columnheader"]:has(.pdx-dg-th-label)');
        const n = await headers.count();
        expect(n, 'no labelled header: the rule measures nothing').toBeGreaterThan(1);
        for (let i = 0; i < n; i++) {
            const header = headers.nth(i);
            const label = ((await header.locator('.pdx-dg-th-label').textContent()) ?? '').trim();
            if (!label) continue;
            await expect(grid.getByRole('columnheader', { name: label, exact: true }),
                `the «${label}» header is not named by its label alone`).toHaveCount(1);
            if (await header.evaluate((el) => el.classList.contains('pdx-dg-th-sortable'))) {
                await expect(header, `the sortable «${label}» header has no aria-sort`).toHaveAttribute('aria-sort', /^(ascending|descending|none)$/);
            }
        }
    });
});
