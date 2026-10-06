/**
 * The CRUD slice, on the production build.
 *
 * What is being demonstrated is not that a grid renders rows — `packages/ui` has 1609 tests for
 * that. It is that the pieces compose over a REAL data source: the page is one the server returned,
 * the filter is one the server applied, and a delete that the server refuses puts the row back.
 *
 * So every assertion here is about the seam between the screen and the source. The store lives in
 * `src/data/tickets.ts` and is deliberately server-shaped: it receives the `DataRequest` and does
 * the paging, sorting and filtering itself.
 *
 * On the selectors: `pdx-data-grid` builds divs with ARIA roles, not a `<table>`, so rows are
 * `[role="row"]` and not `tbody tr`. The drawer's host element is zero-height — what is visible is
 * the `[role="dialog"]` inside it. Written the other way, both fail for a reason that has nothing
 * to do with the screen.
 */
import { test, expect, type Page } from '@playwright/test';
import { ticketSeed } from '../src/data/seed';
import { demo } from './demo';

async function openTickets(page: Page, query = ''): Promise<void> {
    await page.goto(`/tickets${query}`);
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}

/** The DATA rows: `[role="row"]` also matches the header, which is not a ticket. */
const dataRows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

test('the page loads without throwing', async ({ page }) => {
    // First, because every assertion below is worthless on a page that did not mount. The outlet
    // catches a failed page import and shows "Failed to load page: …", so a broken screen looks
    // like a missing element rather than an error — this is what names it.
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto('/tickets');
    // The console first: a page that threw fails the visibility check too, and the timeout would
    // report "element not found" while the reason sat unread in `errors`.
    // ⚠️ AWAITED. `errors.length > 0 || page.locator(…).count()` is a boolean OR a PROMISE, and a
    // promise is always truthy — so unawaited, this poll passes on its first evaluation, before the
    // page has done anything, and the ordering it exists to create does not exist. `tsc` names it.
    await expect.poll(async () => errors.length > 0
        || (await page.locator('[data-test="tickets"]').count()) > 0).toBeTruthy();
    expect(errors).toEqual([]);
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
});

test('the grid shows one page, and the source knows the whole', async ({ page }) => {
    await openTickets(page);

    // 36 rows in the store, a page size of 10. A grid holding an array would show all 36, which is
    // exactly the difference this screen exists to demonstrate.
    await expect(dataRows(page), 'the grid is not showing one page — is it holding the array?').toHaveCount(10);
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
});

test('a filtered list can be linked: ?status=closed arrives filtered', async ({ page }) => {
    // The difference between a demo and an application. The filter is in the URL, so the builder
    // has to seed itself from it and the SOURCE has to be told — a chip that filters nothing is
    // worse than no chip.
    await openTickets(page, '?status=closed');

    // The total is the server's count for the filter, so it is the assertion: 12 of the 36 rows are
    // closed, by construction of the seed (`src/data/seed.ts`: 4 of every 12).
    await expect(page.locator('[data-test="total"]'), 'the filter never reached the source')
        .toHaveText('12 matching');

    // And the grid's toolbar shows it, so a visitor can see what they are looking at and remove it.
    // The toolbar is the screen's ONE filter control, and its chip says «Closed», the column's
    // word, and not `closed`, the stored code.
    const chip = page.locator('[data-test="grid"] .pdx-dg-toolbar-chip-filter');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('Status');
    await expect(chip, 'the chip is showing the stored code, not the label the user picked')
        .toContainText('Closed');
    await expect(chip).not.toContainText('"closed"');
});

test('one way to filter: the screen offers a single «Add filter»', async ({ page }) => {
    // A filter builder of the page's own, a hand's width above the grid's toolbar, would show a
    // reader two «+ Add filter» that do the same thing in two different ways.
    await openTickets(page);
    await expect(page.getByRole('button', { name: 'Add filter' })).toHaveCount(1);
});

// ─── Quick filters and search ─────────────────────────────────────────────────
//
// The filters sit in line above the table. What a list is usually narrowed by is on screen before
// any filter is set, and a search box looks in the columns that make sense to search.

const quickChip = (page: Page, field: string) => page.locator(`[data-test="grid"] .pdx-dg-toolbar-chip-quick[data-field="${field}"]`);

test('the Status, Priority and Assignee chips are there on arrival, empty', async ({ page }) => {
    await openTickets(page);
    for (const field of ['status', 'priority', 'assignee']) {
        await expect(quickChip(page, field), `no ${field} chip`).toBeVisible();
        await expect(quickChip(page, field)).toHaveAttribute('data-empty', '');
    }
    // «Add filter» is still there, for the other columns, by its name.
    await expect(page.getByRole('button', { name: 'Add filter' })).toHaveCount(1);
});

test('picking Closed from the Status chip gives the closed tickets, and × brings the empty chip back', async ({ page }) => {
    await openTickets(page);
    await quickChip(page, 'status').click();
    const popover = page.locator('.pdx-dg-filter-popover');
    await popover.getByRole('checkbox', { name: 'Closed', exact: true }).check();
    await popover.getByRole('button', { name: 'Apply' }).click();
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
    await expect(quickChip(page, 'status')).not.toHaveAttribute('data-empty', '');
    await expect(quickChip(page, 'status')).toContainText('Closed');

    await quickChip(page, 'status').locator('.pdx-dg-toolbar-chip-remove').click();
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
    await expect(quickChip(page, 'status'), 'the chip went away with the filter').toHaveAttribute('data-empty', '');
});

test('searching «vpn» keeps the tickets whose reference, subject or customer has it', async ({ page }) => {
    // Derived from the seed, not typed: the count is whatever the seed's subjects say.
    const expected = ticketSeed().filter(t => [t.reference, t.subject, t.customer]
        .some(v => String(v).toLowerCase().includes('vpn'))).length;
    expect(expected, 'the seed has no VPN ticket to find').toBeGreaterThan(0);

    await openTickets(page);
    await page.locator('[data-test="grid"] [data-grid-search]').fill('vpn');
    await expect(page.locator('[data-test="total"]')).toHaveText(`${expected} matching`);
    // A search is not a filter the reader built: no chip, and the Status chip is still empty.
    await expect(quickChip(page, 'status')).toHaveAttribute('data-empty', '');

    await page.locator('[data-test="grid"] [data-grid-search]').fill('');
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
});

test('removing the filter in the grid takes it out of the address too', async ({ page }) => {
    // The address follows the SOURCE, whichever control changed it: a filter removed in the grid
    // does not stay in a link that still has it.
    await openTickets(page, '?status=closed');
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');

    await page.locator('[data-test="grid"] .pdx-dg-toolbar-chip-filter .pdx-dg-toolbar-chip-remove').click();

    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
    await expect.poll(() => new URL(page.url()).searchParams.get('status'),
        'the list shows everything and the address still says closed').toBeNull();
});

test('the sort chip names the column it sorts', async ({ page }) => {
    // Sorted by `id`, whose column is the row's actions with an empty header, the chip would read
    // «↑ ×» — naming nothing. By reference it is the same order and a word.
    await openTickets(page);
    const chip = page.locator('[data-test="grid"] .pdx-dg-toolbar-chip-sort');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText('Ref');
});

test('Shift+click adds a level: two chips, numbered in order, and removing one leaves the other', async ({ page }) => {
    // Multi-sort is said, not hidden: the header says how, and the levels are numbered in the chips
    // as well as on the headers.
    await openTickets(page);
    const priority = page.locator('[data-test="grid"] [role="columnheader"][data-field="priority"]');
    await expect(priority.locator('button.pdx-dg-sort-btn')).toHaveAttribute('title', 'Priority · Shift+click to add to the sort');
    await priority.locator('button.pdx-dg-sort-btn').click({ modifiers: ['Shift'] });

    const chips = page.locator('[data-test="grid"] .pdx-dg-toolbar-chip-sort');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toContainText('1');
    await expect(chips.nth(0)).toContainText('Ref');
    await expect(chips.nth(1)).toContainText('2');
    await expect(chips.nth(1)).toContainText('Priority');
    await expect(priority.locator('.pdx-dg-sort-badge')).toHaveText('2');

    await chips.nth(0).getByRole('button', { name: 'Remove sort Ref' }).click();
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('Priority');
    await expect(chips.first().locator('.pdx-dg-sort-badge'), 'one level still numbered').toHaveCount(0);
});

test('a subject too long for its cell ends in an ellipsis, and the whole of it is on hover', async ({ page }) => {
    // Not cut mid-word with no ellipsis and no way to read the rest, as text straight in a flex
    // cell is: `text-overflow` does not apply there. 390px, where a subject cannot fit.
    await page.setViewportSize({ width: 390, height: 844 });
    await openTickets(page);

    const cut = page.locator('[data-test="grid"] [role="gridcell"] .pdx-dg-td-text')
        .filter({ hasText: /\w{3,} \w{3,} \w{3,}/ });
    const overflowing = await cut.evaluateAll((els) => els
        .map((el, i) => ({ i, cut: el.scrollWidth > el.clientWidth, text: el.textContent ?? '' }))
        .filter(e => e.cut));
    expect(overflowing.length, 'no subject overflows at 390px — the test measures nothing').toBeGreaterThan(0);

    const target = cut.nth(overflowing[0].i);
    await expect(target).toHaveCSS('text-overflow', 'ellipsis');
    await target.hover();
    await expect(target, 'the cut text has no tooltip with the rest of it')
        .toHaveAttribute('title', overflowing[0].text);
});

test('at 1440 the Subject column is wide enough to read, and the page does not scroll sideways', async ({ page }) => {
    // Subject is the one column that flexes, and the fixed ones must not squeeze it to its 70px
    // floor: «Subject» and nothing else in the header, «Bad…» in every row.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTickets(page);
    const header = page.locator('[data-test="grid"] [role="columnheader"][data-field="subject"]');
    const width = (await header.boundingBox())!.width;
    expect(width, `Subject is ${Math.round(width)}px wide`).toBeGreaterThanOrEqual(240);
    const label = header.locator('.pdx-dg-th-label');
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth), 'the header label is cut').toBe(true);
    // Control: what does not fit scrolls inside the grid, never the page.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        'the page body scrolls sideways').toBe(true);
});

test('create adds a row the list then reads back from the server', async ({ page }) => {
    await openTickets(page);

    // IN A MODAL. The reference creates in one and edits in the page, with no exception across its
    // whole area, and the logic is in the difference: a new record has no place in the page yet.
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog, 'create did not open a modal').toBeVisible();

    await dialog.locator('input[name="subject"]').fill('Coffee machine is offline');
    await dialog.locator('input[name="customer"]').fill('Northwind');
    await dialog.getByRole('button', { name: /create/i }).click();

    // The TOTAL is the assertion, and it is the server's own count: the screen reloaded and the
    // store answered 37. The new row itself is not on this page — the default sort is `id` ascending
    // and it has the highest id, so it is on the last one. Asserting on its text here would be
    // asserting on the sort order, which is not what create proves.
    await expect(page.locator('[data-test="total"]'), 'the total did not move — nothing was created')
        .toHaveText('37 matching');
});

test('a row opens in a drawer, filled, without navigating', async ({ page }) => {
    // The way in is the row itself — no SELECTION and toolbar button, no panel under the list. What
    // is asserted: no navigation, not the create modal, the form arrives filled, the row behind it
    // changes, the total does not.
    //
    // Why no panel beside the drawer: two ways to edit the same record in one screen is worse than
    // the long way round. The rule the reference gives holds by SCOPE — a FIELD is edited where it lives (the inline subject, still there), a RECORD in the
    // drawer the row opens, and a NEW record in the modal.
    await openTickets(page);
    const before = page.url();

    await dataRows(page).first().getByRole('button', { name: /open/i }).click();

    // The panel is re-parented to <body>, so the HOST element has no box and `toBeVisible()` on it
    // is false however well the drawer works. What is on screen is a dialog, and it has a name.
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await expect(drawer, 'the row did not open a drawer').toBeVisible();
    await expect(page.locator('[data-test="create-dialog"] .pdx-dialog-panel'),
        'the row opened the create modal').toBeHidden();
    expect(page.url(), 'opening a row navigated away from the list').toBe(before);

    // FILLED: a form that opens empty is a create with the wrong label.
    // The customers store's name, not a «Northwind» of the ticket seed's own.
    await expect(drawer.locator('input[name="customer"]')).toHaveValue('Northwind Traders');

    await drawer.locator('input[name="subject"]').fill('Lift is stuck between floors');
    await drawer.getByRole('button', { name: /save/i }).click();

    // Re-read from the source, in the row the grid shows — not in a local copy.
    await expect(dataRows(page).first()).toContainText('Lift is stuck between floors');
    // And the total did not move: an edit that creates a row is a create.
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
});

test('it opens without a selection, and does not make one', async ({ page }) => {
    // Selecting the row first would borrow the bulk bar's gesture for a single record. Opening one
    // row must not select it: a reader who opens three in a row would
    // otherwise build a selection they never asked for, and the bulk bar would appear over it.
    await openTickets(page);
    await expect(page.locator('[data-test="bulk"]')).toBeHidden();

    await dataRows(page).first().getByRole('button', { name: /open/i }).click();
    await expect(page.getByRole('dialog', { name: 'Edit' })).toBeVisible();

    await expect(page.locator('[data-test="bulk"]'), 'opening a row selected it').toBeHidden();
    await expect(dataRows(page).first().locator('input[type="checkbox"]')).not.toBeChecked();
});

test('Escape with something typed ASKS before discarding it', async ({ page }) => {
    // A drawer is not a modal: Escape and the ✕ close it, and both are easy to hit by accident. So
    // it asks before discarding — and only when there is something to discard, which is the control
    // in the test below this one.
    await openTickets(page);
    await dataRows(page).first().getByRole('button', { name: /open/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    // The record's value first: the form is built in a rAF, and typing into it before it is filled
    // types into a field the mount then overwrites.
    await expect(drawer.locator('input[name="subject"]')).toHaveValue('Printer on floor 2 is jammed');

    await drawer.locator('input[name="subject"]').fill('Half-written');
    await page.keyboard.press('Escape');

    const ask = page.getByRole('alertdialog');
    await expect(ask, 'it discarded unsaved work without asking').toBeVisible();
    // What the question says, because «are you sure?» is not a question about anything.
    await expect(ask).toContainText(/unsaved|saved/i);
    await expect(ask.getByRole('button', { name: /stay/i })).toBeVisible();
    await expect(ask.getByRole('button', { name: /discard/i })).toBeVisible();

    // And STAY keeps both the drawer and the typing. No wait between the click and the assertion:
    // a panel that leaves the accessibility tree and comes back — absent right after the click,
    // present 500ms later — is a race, and a `toBeVisible()` that only passes after a sleep hides
    // it rather than measuring a behaviour.
    await ask.getByRole('button', { name: /stay/i }).click();
    await expect(ask).toBeHidden();
    await expect(drawer, 'Stay closed the drawer anyway').toBeVisible();
    await expect(drawer.locator('input[name="subject"]'), 'Stay kept the drawer and lost the typing')
        .toHaveValue('Half-written');
});

// Discard is the other half, and it IS steady: the drawer goes, and what was typed goes with it.
test('Discard throws the typing away and closes', async ({ page }) => {
    await openTickets(page);
    await dataRows(page).first().getByRole('button', { name: /open/i }).click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await expect(drawer.locator('input[name="subject"]')).toHaveValue('Printer on floor 2 is jammed');
    await drawer.locator('input[name="subject"]').fill('Half-written');
    await page.keyboard.press('Escape');

    await page.getByRole('alertdialog').getByRole('button', { name: /discard/i }).click();

    await expect(page.getByRole('alertdialog')).toBeHidden();
    await expect(drawer, 'Discard left the drawer open').toBeHidden();
    // And the row is untouched: a discarded edit is not a saved one.
    await expect(dataRows(page).first()).toContainText('Printer on floor 2 is jammed');
});

test('control — Escape with nothing changed closes, and focus is back on the row', async ({ page }) => {
    // The question of the row above must NOT be asked when there is nothing to lose: a confirm on
    // every close is a confirm nobody reads. And the drawer took the focus, so it owes it back —
    // to the control that opened it, which is the only place a keyboard reader can carry on from.
    await openTickets(page);
    const opener = dataRows(page).first().getByRole('button', { name: /open/i });
    await opener.click();
    const drawer = page.getByRole('dialog', { name: 'Edit' });
    await expect(drawer.locator('input[name="subject"]')).toHaveValue('Printer on floor 2 is jammed');

    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog'),
        'it asked about a change nobody made').toBeHidden();
    await expect(drawer).toBeHidden();
    await expect(opener, 'the focus did not come back to the row that opened it').toBeFocused();
});

// The destructive action is called what the DOMAIN calls it — a ticket is archived, not deleted,
// and the sentence after it says it is out of the list rather than gone. Underneath it is a
// delete: the same request, the same optimism and the same way back.
test('archive removes the row, and undo brings it back', async ({ page }) => {
    await openTickets(page);
    const before = await page.locator('[data-test="total"]').textContent();

    await dataRows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    await expect(page.locator('[data-test="total"]'), 'the row is still there').toHaveText('35 matching');
    // The way back travels WITH the message: one shape for every screen, instead of a bar each
    // page draws for itself. What is asserted is that it is offered, and it works.
    const undo = page.locator('.pdx-toast').getByRole('button', { name: /undo|annulla/i });
    await expect(undo).toBeVisible();

    await undo.click();
    await expect(page.locator('[data-test="total"]'), 'undo did not restore the row').toHaveText(before!);
});

// Two rows: the undo puts back every row it removed, not only the FIRST, and the toast names them
// all. One row selected, the case above, cannot tell.
test('archive two, and undo brings both back — and the toast says two', async ({ page }) => {
    await openTickets(page);
    await dataRows(page).nth(0).locator('input[type="checkbox"]').check();
    await dataRows(page).nth(1).locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    await expect(page.locator('[data-test="total"]')).toHaveText('34 matching');
    const toast = page.locator('.pdx-toast').filter({ has: page.getByRole('button', { name: /undo/i }) });
    await expect.soft(toast, 'the toast named one ticket for two archived').toContainText(/\b2 tickets\b/);

    await toast.getByRole('button', { name: /undo/i }).click();
    await expect(page.locator('[data-test="total"]'), 'undo put back fewer rows than it took').toHaveText('36 matching');
});

/** The references the grid is SHOWING, in order — what the user can actually see. */
const shownRefs = (page: Page) => dataRows(page).evaluateAll(
    (rows) => rows.map(r => (r.textContent ?? '').match(/T-\d+/)?.[0] ?? '?'));

test('the server can refuse an archive, and the row comes back', async ({ page }) => {
    await openTickets(page);

    // The ROWS, not the total. `[data-test="total"]` stays green on a page whose defect is that the
    // row is missing from the screen: the count the server reports comes back while the rendered
    // list stays one short. A test that
    // measures the number a server says, on a bug about what is on screen, passes on exactly the
    // failure it was written for.
    const before = await shownRefs(page);
    const total = await page.locator('[data-test="total"]').textContent();

    // The store refuses the next delete, the way a server refuses one the caller may not make.
    await demo(page, 'refuse-next');

    await dataRows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive/i }).click();

    // The row LEAVES first. This is the strongest form of the assertion and the one that cannot
    // pass by measuring too early: a list that has not changed yet equals the list it is supposed
    // to return to, so polling straight for `before` matches on its first try and proves nothing.
    //
    // A mock that rejects in the same microtask it is called in never lets the page render the
    // gap. `ticketTransport`'s writes take about as long as a server does, and the optimistic
    // removal is on screen while they do.
    await expect.poll(() => shownRefs(page), { message: 'the delete was not optimistic — the row never left' })
        .not.toEqual(before);

    // Then the refusal, then the restoration. The notice cannot appear before `destroy()` has
    // rejected, so past it the rows below are a restored state and not an untouched one.
    // A toast: a paragraph under the grid is out of sight.
    await expect(page.locator('.pdx-toast').filter({ hasText: /referenced by an open intervention/i }),
        'the refusal was swallowed').toBeVisible();
    await expect.poll(() => shownRefs(page), { message: 'the refused row did not come back on screen' })
        .toEqual(before);
    await expect(page.locator('[data-test="total"]'), 'the total did not come back').toHaveText(total!);
});

test('and an action this role may not perform is offered, refused, and explained', async ({ page }) => {
    // A bulk bar where everything is allowed teaches a permission model nobody has.
    //
    // The action is offered, not WITHHELD: `BulkAction` carries `disabled`, so the visitor learns
    // Export exists, and the explanation is the component's rather than a paragraph this page
    // invents beside the bar.
    await openTickets(page);
    await dataRows(page).first().locator('input[type="checkbox"]').check();

    const bulk = page.locator('[data-test="bulk"]');
    await expect(bulk.getByRole('button', { name: /archive/i }),
        'the bulk bar did not appear at all — this test would pass vacuously').toBeVisible();

    const exportButton = bulk.getByRole('button', { name: /export/i });
    await expect(exportButton, 'the action is hidden again, so nobody learns it exists').toBeVisible();
    await expect(exportButton).toHaveAttribute('aria-disabled', 'true');

    // The reason travels WITH the button, not as a paragraph beside the bar — the accessible
    // description is what a screen reader reads after the name.
    //
    // ⚠️ Not `getByRole('button', { name, description })`: `description` is not an option
    // `getByRole` takes, it is IGNORED, so the locator is the same button as above and the
    // assertion holds whatever the description says, including nothing. `tsc` names it;
    // `toHaveAccessibleDescription` is the assertion that actually reads it.
    await expect(exportButton, 'the button does not say why')
        .toHaveAccessibleDescription(/permission|role|autorizz/i);

    // And it is refused, not merely painted: the bar emits nothing and the selection is untouched.
    await exportButton.click({ force: true });
    await expect(bulk, 'the click cleared the selection, so something handled it').toContainText('1');
});

/** The grid's Export is a menu: open it and pick a format. */
async function exportAs(page: Page, format: 'CSV (.csv)' | 'Excel (.xlsx)') {
    const download = page.waitForEvent('download');
    await page.locator('[data-test="grid"] [data-grid-export]').click();
    await page.getByRole('menuitem', { name: format, exact: true }).click();
    return download;
}

/** One part of a STORED zip — what `toXlsx` writes — read from its central directory. */
function zipPart(zip: Buffer, name: string): string {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    let p = zip.readUInt32LE(eocd + 16);
    for (let i = 0; i < zip.readUInt16LE(eocd + 10); i++) {
        const size = zip.readUInt32LE(p + 20);
        const nameLen = zip.readUInt16LE(p + 28);
        const entry = zip.toString('utf8', p + 46, p + 46 + nameLen);
        const local = zip.readUInt32LE(p + 42);
        if (entry === name) {
            const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
            return zip.toString('utf8', start, start + size);
        }
        p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
    }
    throw new Error(`${name} is not in the file`);
}

test('Export writes the rows the user filtered to, not the page', async ({ page }) => {
    // The complaint every line-of-business grid receives, and the file is read BACK: a test that
    // only clicked the button would pass on an empty download.
    await openTickets(page, '?status=closed');
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
    // One page shows 10 of those 12 — which is the difference the export has to get right.
    await expect(dataRows(page)).toHaveCount(10);

    const file = await exportAs(page, 'CSV (.csv)');

    const stream = await file.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
        const parts: Buffer[] = [];
        stream.on('data', (c: Buffer) => parts.push(c));
        stream.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        stream.on('error', reject);
    });

    expect(file.suggestedFilename(), 'the file is not dated').toMatch(/^export-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(text.charCodeAt(0), 'no BOM — Excel will show accented text as mojibake').toBe(0xFEFF);

    const lines = text.replace(/^﻿/, '').trimEnd().split('\r\n');
    // The header the user reads, not the field names.
    expect(lines[0]).toContain('Ref');
    expect(lines[0]).toContain('Subject');
    // 12 rows + the header: the FILTER decides, not the page.
    expect(lines.length, `the export wrote ${lines.length - 1} rows — the page has 10 and the filter 12`).toBe(13);
    // And the status column went through its `format`: the file says what the screen says.
    expect(text, 'the export wrote the stored code instead of the label on screen').toContain('Closed');
});

test('and a selection wins over the filter', async ({ page }) => {
    await openTickets(page, '?status=closed');
    await dataRows(page).first().locator('input[type="checkbox"]').check();
    await dataRows(page).nth(1).locator('input[type="checkbox"]').check();

    const file = await exportAs(page, 'CSV (.csv)');
    const stream = await file.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
        const parts: Buffer[] = [];
        stream.on('data', (c: Buffer) => parts.push(c));
        stream.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
        stream.on('error', reject);
    });

    const lines = text.replace(/^﻿/, '').trimEnd().split('\r\n');
    expect(lines.length, 'a selection of two exported something other than two rows').toBe(3);
});

test('Excel writes the same rows, as a workbook', async ({ page }) => {
    // Read BACK, as the CSV is: the sheet inside the file, not the fact that a file arrived.
    await openTickets(page, '?status=closed');
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');

    const file = await exportAs(page, 'Excel (.xlsx)');
    expect(file.suggestedFilename()).toMatch(/^export-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const stream = await file.createReadStream();
    const zip = await new Promise<Buffer>((resolve, reject) => {
        const parts: Buffer[] = [];
        stream.on('data', (c: Buffer) => parts.push(c));
        stream.on('end', () => resolve(Buffer.concat(parts)));
        stream.on('error', reject);
    });
    const sheet = zipPart(zip, 'xl/worksheets/sheet1.xml');
    // 12 rows + the header: the filter decides, as for the CSV.
    expect(sheet.match(/<row /g) ?? [], 'the workbook does not hold the filtered rows').toHaveLength(13);
    // The header the user reads, in bold (style 1), as the CSV's first line.
    expect(sheet).toMatch(/<c r="A1" t="inlineStr" s="1"><is><t>Ref/);
    expect(sheet, 'the stored code instead of the label on screen').toContain('<t>Closed</t>');
    expect(sheet, 'an open ticket in a closed-only export').not.toContain('<t>Open</t>');
});

// ─── The two emptinesses ──────────────────────────────────────────────────────
//
// The reference draws an empty state for every section, always, and it draws the RIGHT one: the
// answer to «there is nothing yet» is an invitation, and the answer to «your filter excludes
// everything» is the way back. One message for both teaches a reader that their filter deleted the
// records — «Nessun risultato», with nothing else on screen.

test('a filter that matches nothing says so, and offers the way back', async ({ page }) => {
    await page.goto('/tickets?status=archiviato');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    // The premise: the filter is real and it matches none of the 36.
    await expect(page.locator('[data-test="total"]')).toHaveText('0 matching');

    const filtered = page.locator('[data-test="empty-filtered"]');
    await expect(filtered, 'a filtered-out list shows the generic empty state').toBeVisible();

    // It says what is filtering — a reader who cannot see the filter cannot undo it.
    await expect(filtered).toContainText('1');

    await filtered.getByRole('button', { name: /clear/i }).click();

    // The rows are back, and so is the URL: the control cleared the filter, it did not reload.
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');
    await expect(filtered).toBeHidden();
    expect(new URL(page.url()).searchParams.get('status'), 'the filter is still in the URL').toBeNull();
});

test('control — the two emptinesses are different elements', async ({ page }) => {
    // The assertion this pair exists for: a screen that draws one state for both passes the row
    // above and fails here. `empty-filtered` must NOT be what a section with no rows yet shows.
    await page.goto('/tickets?status=archiviato');
    await expect(page.locator('[data-test="empty-filtered"]')).toBeVisible();
    await expect(page.locator('[data-test="empty-nothing-yet"]'),
        'the nothing-yet state is drawn when a filter is what emptied the list').toBeHidden();

    // And on a screen whose section has nothing YET, it is the other way round.
    await page.goto('/customers/1');
    await page.locator('[data-test="section-contacts"]').click();
    await expect(page.locator('[data-test="no-contacts"]')).toBeVisible();
    await expect(page.locator('[data-test="empty-filtered"]'),
        'a section with nothing yet blamed a filter').toHaveCount(0);
});

test('and it REPLACES the grid’s own empty state rather than sitting under it', async ({ page }) => {
    // Put under the grid, the page’s empty state reads as a SECOND message below the one the grid
    // draws for itself — one empty list with two answers. The grid’s `empty` slot is where it goes.
    await page.goto('/tickets?status=archiviato');
    const gridEmpty = page.locator('[data-test="grid"] .pdx-dg-empty');
    await expect(gridEmpty).toBeVisible();

    // Nested, not beside: the page’s state IS the grid’s.
    await expect(gridEmpty.locator('[data-test="empty-filtered"]')).toHaveCount(1);
    // And the grid’s own default text is not on screen next to it.
    await expect(page.getByText('No results', { exact: true })).toHaveCount(0);
});

