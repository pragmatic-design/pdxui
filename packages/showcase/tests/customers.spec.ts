// The second entity: the same round-trip, and nothing of the first one's code.
//
// One entity proves a screen. Two prove a PATTERN — and the way a framework fails that test is by
// making the second one a copy of the first. So these are deliberately the same assertions as
// `crud-roundtrip.spec.ts`, pointed at customers: if the pattern repeats, the only thing that had
// to be written is what a customer IS.
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

const box = (page: Page, selector: string) =>
    page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });

const rows = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-body [role="row"]');

async function openList(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/customers');
    await expect(rows(page).first()).toBeVisible();
}

test('the list is the server\'s, with its own count', async ({ page }) => {
    await openList(page);
    await expect(page.locator('[data-test="total"]')).toHaveText('24 matching');
    await expect(rows(page)).toHaveCount(10);
});

test('the bulk bar belongs to this table too', async ({ page }) => {
    await openList(page);
    await rows(page).nth(0).locator('input[type="checkbox"]').check();

    const bar = await box(page, '[data-test="bulk"]');
    const grid = await box(page, '[data-test="grid"]');
    expect(bar.w, `the bar is ${bar.w}px against a ${grid.w}px table`).toBe(grid.w);
    expect(bar.x).toBe(grid.x);
    expect(bar.y, 'the bar is not anchored under the table').toBeGreaterThanOrEqual(grid.y + grid.h - 1);
});

test('create opens a modal, and the list reads the new row back from the server', async ({ page }) => {
    await openList(page);
    await page.locator('[data-test="new"] button').click();

    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog, 'create did not open a modal').toBeVisible();
    await dialog.locator('input[name="name"]').fill('Blue Yonder Airlines');
    await dialog.locator('input[name="sector"]').fill('Travel');
    await dialog.getByRole('button', { name: /create/i }).click();

    await expect(page.locator('[data-test="total"]'), 'the total did not move — nothing was created')
        .toHaveText('25 matching');
});

// ─── One record: the drawer, as on tickets ────────────────────────
//
// Not «select the row, then press Edit in the toolbar», which borrows the bulk selection for one
// record. The row opens it, and so does its eye, into the same drawer.

const drawer = (page: Page) => page.getByRole('dialog', { name: 'Edit' });
const nameCell = (page: Page) => rows(page).first().getByRole('gridcell', { name: 'Northwind Traders', exact: true });

test('a click on a row opens that customer in the drawer, and selects nothing', async ({ page }) => {
    await openList(page);
    const before = page.url();
    await nameCell(page).click();

    await expect(drawer(page), 'the row click opened nothing').toBeVisible();
    await expect(drawer(page).locator('input[name="name"]'), 'the drawer opened on another record')
        .toHaveValue('Northwind Traders');
    expect(page.url(), 'opening a record navigated away from the list').toBe(before);
    await expect(page.locator('[data-test="bulk"]'), 'opening the record selected it').toBeHidden();
    // No toolbar «Edit» through the selection beside it: one way in.
    await expect(page.locator('[data-test="edit"]')).toHaveCount(0);
});

test('the row says it can be clicked', async ({ page }) => {
    await openList(page);
    expect(await nameCell(page).evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer');
});

test('the eye opens the same drawer, and is named after the customer', async ({ page }) => {
    await openList(page);
    await rows(page).first().getByRole('button', { name: /open .*northwind/i }).click();
    await expect(drawer(page).locator('input[name="name"]')).toHaveValue('Northwind Traders');
});

test('control — the selection checkbox selects, and opens nothing', async ({ page }) => {
    await openList(page);
    await rows(page).first().locator('input[type="checkbox"]').check();
    await expect(page.locator('[data-test="bulk"]')).toBeVisible();
    await expect(drawer(page), 'ticking the checkbox opened the drawer').toBeHidden();
});

test('a save from the drawer changes the row the server sends back, and creates nothing', async ({ page }) => {
    await openList(page);
    await nameCell(page).click();
    // The record's value first: the form is built in a rAF, and typing before it is filled types
    // into a field the mount then overwrites (tickets-crud.spec.ts, the same drawer).
    await expect(drawer(page).locator('input[name="name"]')).toHaveValue('Northwind Traders');
    await drawer(page).locator('input[name="name"]').fill('Northwind Traders SpA');
    await drawer(page).getByRole('button', { name: /save/i }).click();

    await expect(drawer(page), 'the drawer stayed open after a save').toBeHidden();
    await expect(rows(page).first(), 'the row did not take the edit').toContainText('Northwind Traders SpA');
    await expect(page.locator('[data-test="total"]'), 'an edit that creates a row is a create')
        .toHaveText('24 matching');
});

test('Escape with something typed asks before throwing it away', async ({ page }) => {
    await openList(page);
    await nameCell(page).click();
    await expect(drawer(page).locator('input[name="name"]')).toHaveValue('Northwind Traders');
    await drawer(page).locator('input[name="name"]').fill('Changed');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('alertdialog'), 'the typing was discarded without asking').toBeVisible();
});

test('archive removes the row, and undo brings it back', async ({ page }) => {
    await openList(page);
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    // The way back travels WITH the message: one shape for every screen, not a bar each page draws
    // for itself. What is asserted is that it is offered, and that it works.
    const undo = page.locator('.pdx-toast').getByRole('button', { name: /undo|annulla/i });
    await expect(undo, 'nothing offered the way back').toBeVisible();
    await expect(page.locator('[data-test="total"]')).toHaveText('23 matching');

    await undo.click();
    await expect(page.locator('[data-test="total"]'), 'undo did not put the record back')
        .toHaveText('24 matching');
});

// Two rows: an undo that restores only one reads 24 → archive 2 → 22 → undo → 23, with a toast
// naming one customer.
test('archive two, and undo brings both back — and the toast says two', async ({ page }) => {
    await openList(page);
    await rows(page).nth(0).locator('input[type="checkbox"]').check();
    await rows(page).nth(1).locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    await expect(page.locator('[data-test="total"]')).toHaveText('22 matching');
    const toast = page.locator('.pdx-toast').filter({ has: page.getByRole('button', { name: /undo/i }) });
    await expect.soft(toast, 'the toast named one customer for two archived').toContainText(/\b2 customers\b/);

    await toast.getByRole('button', { name: /undo/i }).click();
    await expect(page.locator('[data-test="total"]'), 'undo put back fewer rows than it took').toHaveText('24 matching');
});

test('the server can refuse an archive, and it says so', async ({ page }) => {
    await openList(page);
    await demo(page, 'refuse-next');
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    // Rule 3: a toast in view that stays until it is dismissed.
    const refusal = page.locator('.pdx-toast').filter({ hasText: /open tickets/ });
    await expect(refusal, 'the refusal is not a toast').toBeVisible();
    await expect(refusal, 'the refusal is out of sight').toBeInViewport();
    await expect(page.locator('[data-test="total"]'), 'the record was archived anyway')
        .toHaveText('24 matching');

    await page.waitForTimeout(6000);
    await expect(refusal, 'the refusal disappeared on a timer').toBeVisible();
    // Control: it can be closed. A toast nobody could dismiss would pass everything above.
    await refusal.getByRole('button', { name: /close|dismiss|chiudi/i }).click();
    await expect(refusal, 'the refusal could not be dismissed').toHaveCount(0);
});

// The bar's ✕ is a command on the grid, which owns the checkboxes: clearing the page's copy alone
// hides the bar and leaves the row ticked. Both lists clear through the one `createListActions`.
test('the bar\'s clear unticks the rows it counted', async ({ page }) => {
    await openList(page);
    const box0 = rows(page).nth(0).locator('input[type="checkbox"]');
    await box0.check();
    await page.locator('[data-test="bulk"] .pdx-bulk-clear').click();

    await expect(page.locator('[data-test="bulk"]'), 'the bar stayed after its clear').toBeHidden();
    await expect(box0, 'the bar went and the row stayed ticked').not.toBeChecked();
});

test('the next archive takes the old refusal away', async ({ page }) => {
    await openList(page);
    await demo(page, 'refuse-next');
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();
    const refusal = page.locator('.pdx-toast').filter({ hasText: /open tickets/ });
    await expect(refusal).toBeVisible();

    // One `check()`: the archive clears the grid's selection too, so the box is unticked already.
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();
    await expect(refusal, 'a stale refusal stayed on screen after the next action').toHaveCount(0);
});

test('the detail opens with the entity, and its sections are on the left', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/customers/1');
    await expect(page.locator('[data-test="detail-menu"]')).toBeVisible();

    const menu = await box(page, '[data-test="detail-menu"]');
    const body = await box(page, '.detail-body');
    expect(menu.w, 'the section menu is not 260').toBe(260);
    expect(menu.x, 'the section menu is not on the left of the body').toBeLessThan(body.x);

    const portrait = await box(page, '[data-test="identity"] .portrait');
    expect(portrait.w).toBe(100);
    await expect(page.locator('[data-test="identity-name"]')).toHaveText('C-2000');
    // A customer has a name, so its monogram is the initials — a ticket's is its number. The
    // pattern is the same; what fills it is the entity's.
    await expect(page.locator('.portrait')).toHaveText('NT');
});

test('and a section has three states here too', async ({ page }) => {
    await page.goto('/customers/1');
    await page.locator('[data-test="section-contacts"]').click();

    await expect(page.locator('[data-test="no-contacts"]'), 'the empty state is not drawn').toBeVisible();

    await page.locator('[data-test="add-contact"] button').click();
    await expect(page.locator('[data-test="contact-list"] li').first()).toContainText('Contact 1');
    await expect(page.locator('[data-test="no-contacts"]')).toHaveCount(0);
    await expect(page.locator('[data-test="after"]'), 'nothing says what the action did')
        .toContainText('added');

    await page.locator('[data-test="remove-1"] button').click();
    await expect(page.locator('[data-test="no-contacts"]'), 'it did not go back to empty').toBeVisible();
    await expect(page.locator('[data-test="after"]')).toContainText('removed');
});

test('control — the two entities are separate stores, not one', async ({ page }) => {
    // Without this, "the pattern repeats" could be satisfied by a second page reading the first
    // one's rows. The counts differ, and a customer is not a ticket.
    await openList(page);
    await expect(page.locator('[data-test="total"]')).toHaveText('24 matching');

    await page.goto('/tickets');
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
});

test('a section with nothing yet INVITES, with its own words and its own action', async ({ page }) => {
    // «Nothing yet» is not the same sentence as «no results», and it is not a grey line either: the
    // reference draws the empty state of every section, and what it draws is an invitation — what
    // the section is for, and the action that creates the first one. A line of muted text beside a
    // button somewhere else is a state a reader has to assemble themselves.
    await page.goto('/customers/1');
    await page.locator('[data-test="section-contacts"]').click();

    const empty = page.locator('[data-test="no-contacts"]');
    await expect(empty).toBeVisible();
    // Its own words: the section's, not a generic «No data».
    await expect(empty).toContainText(/contact/i);
    // Its own action, IN the empty state — and it does what the section's button does.
    const invite = empty.getByRole('button');
    await expect(invite, 'the empty state has nothing to do').toHaveCount(1);

    await invite.click();
    await expect(page.locator('[data-test="contact-list"] li').first()).toContainText('Contact 1');
    await expect(empty, 'the invitation is still there with a row beside it').toHaveCount(0);
});

