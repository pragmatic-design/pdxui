// The accessibility the framework guarantees, measured on the showcase (beta spec, agents.md,
// «Accessibility the framework guarantees»; acceptance: every rule A1–A6 holds on the showcase).
// A2 and A6 (#274), A3, A4 and A5 (#299) here; A1 is #249.
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

/** `/intake`, on its first step, with the wizard's stepper drawn (intake.spec.ts). */
async function openIntake(page: Page): Promise<void> {
    await page.goto('/intake');
    await expect(page.locator('[data-test="intake"]')).toBeVisible();
    await expect(page.locator('[data-test="wizard"] .pdx-stepper')).toBeVisible();
}

test.describe('A2 — a field in error says so, and points at its message', () => {
    test('/intake: an invalid email is aria-invalid, and its aria-describedby reaches the error shown', async ({ page }) => {
        await openIntake(page);
        const email = page.getByRole('textbox', { name: 'Email', exact: true });
        // The control: valid, the field is not marked.
        await expect(email).not.toHaveAttribute('aria-invalid', 'true');
        await email.fill('not-an-email');
        await email.blur();
        await expect(email, 'the field in error is not aria-invalid').toHaveAttribute('aria-invalid', 'true');
        const ids = ((await email.getAttribute('aria-describedby')) ?? '').split(/\s+/).filter(Boolean);
        expect(ids.length, 'the field in error describes itself with nothing').toBeGreaterThan(0);
        const described = (await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent())))
            .map((t) => (t ?? '').trim()).filter(Boolean).join(' ');
        // The error as shown on screen, in the field's own error slot.
        const field = page.locator('pdx-form-field').filter({ has: email });
        const shown = ((await field.locator('.pdx-field-error').textContent()) ?? '').trim();
        expect(shown, 'no error is shown on screen: the case measures nothing').not.toBe('');
        expect(described, 'aria-describedby does not reach the error on screen').toContain(shown);
    });
});

test.describe('A6 — a multi-step flow marks its current step', () => {
    test('/intake: the current step is aria-current="step", and moves with the wizard', async ({ page }) => {
        await openIntake(page);
        const wizard = page.locator('[data-test="wizard"]');
        const current = wizard.locator('[aria-current="step"]');
        await expect(current, 'not exactly one current step').toHaveCount(1);
        await expect(current).toHaveAccessibleName('Requester');
        // A step of the stepper is a tab (pdx-wizard's stepper is a tablist).
        await expect(wizard.getByRole('tab', { name: 'Requester', exact: true })).toHaveAttribute('aria-current', 'step');

        await page.locator('[data-test="requester"] input:not([type="hidden"])').fill('Anna Bianchi');
        await page.getByRole('textbox', { name: 'Email', exact: true }).fill('anna@example.com');
        await page.getByRole('textbox', { name: 'Email', exact: true }).blur();
        await page.locator('[data-wizard-next]').click();
        await expect(page.locator('[data-wizard-step][data-label="Window"]')).toBeVisible();

        await expect(current, 'the current step did not move').toHaveAccessibleName('Window');
        await expect(current).toHaveCount(1);
        await expect(wizard.getByRole('tab', { name: 'Requester', exact: true })).not.toHaveAttribute('aria-current', 'step');
        await expect(wizard.getByRole('tab', { name: 'Window', exact: true })).toHaveAttribute('aria-current', 'step');
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
