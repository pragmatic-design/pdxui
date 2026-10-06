/**
 * A list a reader arranged is theirs to keep.
 *
 * Filtering to the six tickets you care about and losing it on every visit is the difference
 * between a demo grid and a tool somebody works in all day. The grid publishes everything a view
 * is made of — `saveState()` returns the filter, the sort, the column order and the page size — so
 * what a view adds is not machinery, it is a NAME and somewhere to keep it.
 *
 * The control that runs through the file: a view holds the ARRANGEMENT and nothing else. A
 * selection is not an arrangement, and neither is where you had scrolled to.
 *
 * The views live in ONE list header, the reference's: the title, a view picker whose name carries
 * `*` while the arrangement differs from the saved one, a reset icon and a save menu — on every
 * list, each list with views of its own. No browser dialog and no native control: the rule, and
 * the guard at the foot of this file.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clearAllButSession } from './session';

const dataRows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
const header = (page: Page) => page.locator('[data-test="list-header"]');
const picker = (page: Page) => page.locator('[data-test="view-picker"]');
/** What the picker shows as chosen: the view's name, `*` in front while it is changed. */
const shown = (page: Page) => picker(page).locator('.pdx-select-value');

async function openList(page: Page, path: string, query = ''): Promise<void> {
    await page.goto(`${path}${query}`);
    await expect(header(page)).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}
const openTickets = (page: Page, query = '') => openList(page, '/tickets', query);

/** Narrow the list through the URL, which is the filter this page already carries both ways. */
async function filterToClosed(page: Page): Promise<void> {
    await openTickets(page, '?status=closed');
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
}

/** One of the save menu's entries. */
async function fromSaveMenu(page: Page, entry: string): Promise<void> {
    await page.locator('[data-test="view-menu"] button').first().click();
    await page.getByRole('menuitem', { name: entry, exact: true }).click();
}

/** Save the current arrangement under a name, through the page's own dialog. */
async function saveAs(page: Page, name: string): Promise<void> {
    await fromSaveMenu(page, 'Save as…');
    const dialog = page.locator('[data-test="view-name-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(header(page)).not.toHaveAttribute('data-active-view', 'default');
}

/** Choose a view by its name, through the picker a person uses. */
async function chooseView(page: Page, name: string): Promise<void> {
    await picker(page).locator('[role="combobox"]').click();
    await page.getByRole('option', { name, exact: true }).click();
}

/** The names the picker offers, read by opening it. */
async function offered(page: Page): Promise<string[]> {
    await picker(page).locator('[role="combobox"]').click();
    const names = await page.getByRole('option').allTextContents();
    await page.keyboard.press('Escape');
    return names.map((n) => n.trim());
}

test.beforeEach(async ({ page }) => {
    await page.goto('/tickets');
    await clearAllButSession(page);
});

test('an arrangement saved under a name comes back on the next visit', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');

    // The whole point: a fresh load, with no query of its own, opens on the saved arrangement.
    await openTickets(page);
    await expect(header(page)).toHaveAttribute('data-active-view', /mine/i);
    await expect(shown(page)).toHaveText('Mine');
    await expect(page.locator('[data-test="total"]'), 'the list came back unarranged').toHaveText('12 matching');
});

test('a view can be LINKED: its key is in the URL and opens it', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');

    const url = new URL(page.url());
    expect(url.searchParams.get('view'), 'the address does not carry the view').toBeTruthy();
    const key = url.searchParams.get('view')!;

    // Another arrangement, so the link has something to change. Chosen, not left to a bare URL:
    // the list remembers the view its reader was working in, which is the point of the row above.
    await chooseView(page, 'All tickets');
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');

    await openTickets(page, `?view=${key}`);
    await expect(header(page)).toHaveAttribute('data-active-view', key);
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
});

test('a view chosen from the picker is named in the address by its key, not by its filter', async ({ page }) => {
    // The filter a VIEW puts on the list is the view's to name. Written as `?status=` as well, the
    // address would carry two answers to one question — and which of them wins on a reload would
    // depend on where the page's setup created its address filter.
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await chooseView(page, 'All tickets');
    await expect(page.locator('[data-test="total"]')).toHaveText('36 matching');

    await chooseView(page, 'Mine');
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
    const url = new URL(page.url());
    expect(url.searchParams.get('view'), 'the address does not name the view').toBeTruthy();
    expect(url.searchParams.get('status'), 'the view\'s filter was written into the address as well').toBeNull();

    // Control: a filter the READER sets is theirs, and it is in the address. On the default view —
    // the last one used is put back on the next visit, and it would stand in for the address's filter.
    await chooseView(page, 'All tickets');
    await openTickets(page, '?status=open');
    await expect(page.locator('[data-test="total"]')).not.toHaveText('36 matching');
    await expect(page).toHaveURL(/status=open/);
});

test('an address that names a filter opens on it, not on the last-used view', async ({ page }) => {
    // A link that carries a filter is an explicit request. The last-used view does not stand in for
    // it when the address names no VIEW: otherwise `/tickets?status=open` with «Mine» last used
    // becomes `?view=mine` and Mine's 12 closed tickets.
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await expect(header(page)).toHaveAttribute('data-active-view', /mine/i);

    await openTickets(page, '?status=open');
    await expect(page).toHaveURL(/status=open/);
    await expect(page).not.toHaveURL(/view=/);
    await expect(page.locator('[data-test="total"]'), 'the list opened on the last-used view').not.toHaveText('12 matching');
    await expect(header(page)).toHaveAttribute('data-active-view', 'default');

    // The dashboard's «Unassigned» link, the case that matters.
    await openTickets(page, '?assignee=none');
    await expect(page).toHaveURL(/assignee=none/);
    await expect(header(page)).toHaveAttribute('data-active-view', 'default');

    // Control: an address that names nothing still opens on the view last used.
    await openTickets(page);
    await expect(header(page)).toHaveAttribute('data-active-view', /mine/i);
    await expect(page.locator('[data-test="total"]')).toHaveText('12 matching');
});

test('a view that has been changed carries * before its name, and Reset puts it back', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await expect(shown(page), 'a view said it was changed the moment it was saved').toHaveText('Mine');
    await expect(page.locator('[data-test="view-reset"] button'), 'Reset offered with nothing to reset').toBeDisabled();

    // Change the arrangement without saving it.
    await page.locator('[data-test="grid"] .pdx-dg-th[data-field="subject"] .pdx-dg-sort-btn').click();
    await expect(shown(page), 'a changed view did not say so').toHaveText('*Mine');

    await page.locator('[data-test="view-reset"] button').click();
    await expect(shown(page), 'Reset left the view marked as changed').toHaveText('Mine');
    await expect(page.locator('[data-test="grid"] .pdx-dg-th[data-field="subject"]'))
        .not.toHaveAttribute('aria-sort', /ascending|descending/);
});

// ─── Grouping, chosen by the reader and kept in the view ────────────────────────

/** The toolbar's «Group by» menu, and a column from it. */
async function groupBy(page: Page, column: string): Promise<void> {
    await page.locator('[data-test="grid"] [data-grid-group]').click();
    await page.getByRole('menuitemradio', { name: column, exact: true }).click();
}
const groupLabels = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-group-label');
const groupCounts = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-group-count');

test('the tickets grouped by status: a header per status, in words, counting the whole list', async ({ page }) => {
    await openTickets(page);
    await groupBy(page, 'Status');
    // The seed's arithmetic (`seed.ts`): 12 closed, 15 open, 9 waiting — the LIST's counts, not a
    // page's ten rows.
    await expect(groupLabels(page)).toHaveText([/^Status: Closed$/, /^Status: Open$/, /^Status: Waiting$/]);
    await expect(groupCounts(page)).toHaveText(['(12)', '(15)', '(9)']);
});

test('a grouping is part of a view: saved, back after a reload, marked * when changed, and Reset restores it', async ({ page }) => {
    await openTickets(page);
    await groupBy(page, 'Status');
    await saveAs(page, 'By status');

    await openTickets(page);
    await expect(shown(page)).toHaveText('By status');
    await expect(groupLabels(page).first(), 'the grouping did not come back with the view').toContainText('Status:');

    await groupBy(page, 'Priority');
    await expect(shown(page), 'a changed grouping did not mark the view').toHaveText('*By status');
    await page.locator('[data-test="view-reset"] button').click();
    await expect(shown(page)).toHaveText('By status');
    await expect(groupLabels(page).first()).toContainText('Status:');
});

test('control — the default view has no grouping, and choosing it takes one away', async ({ page }) => {
    await openTickets(page);
    await expect(groupLabels(page)).toHaveCount(0);
    await groupBy(page, 'Status');
    await saveAs(page, 'By status');
    await chooseView(page, 'All tickets');
    await expect(groupLabels(page), 'the default view kept the saved view\'s grouping').toHaveCount(0);
});

test('moving a column marks the view changed, and Reset puts the column back', async ({ page }) => {
    // A grid that rearranges its columns and tells nobody leaves a view that saves and restores the
    // order unable to notice it has moved. `pdx-column-reorder` is what makes this row writable.
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await expect(shown(page)).toHaveText('Mine');

    const order = () => page.locator('[data-test="grid"] .pdx-dg-th[data-field]')
        .evaluateAll((els) => els.map((e) => e.getAttribute('data-field')));
    const before = await order();

    await page.locator('[data-test="grid"]').evaluate((el: any) => {
        el.grid.reorder('customer', 'reference');
    });

    await expect(shown(page), 'a column moved and the view did not notice').toHaveText('*Mine');
    // `expect.poll`, not a bare `expect` on an already-read array: the repaint is scheduled, and a
    // one-shot read is a race lost about half the time.
    await expect.poll(order, { message: 'the column did not actually move' }).not.toEqual(before);

    await page.locator('[data-test="view-reset"] button').click();
    await expect(shown(page)).toHaveText('Mine');
    await expect.poll(order, { message: 'Reset put the filter back and left the columns where they were' })
        .toEqual(before);
});

test('Save takes the change into the view it is on', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await page.locator('[data-test="grid"] .pdx-dg-th[data-field="subject"] .pdx-dg-sort-btn').click();
    await expect(shown(page)).toHaveText('*Mine');

    await fromSaveMenu(page, 'Save');
    await expect(shown(page)).toHaveText('Mine');

    await page.reload();
    await expect(dataRows(page).first()).toBeVisible();
    await expect(page.locator('[data-test="grid"] .pdx-dg-th[data-field="subject"]'), 'the saved sort did not survive')
        .toHaveAttribute('aria-sort', 'ascending');
});

test('Rename asks for the name in the page, and the picker shows the new one', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');
    await fromSaveMenu(page, 'Rename');
    const dialog = page.locator('[data-test="view-name-dialog"] .pdx-dialog-panel');
    const name = dialog.getByRole('textbox', { name: 'Name', exact: true });
    await expect(name, 'Rename does not start from the current name').toHaveValue('Mine');

    // An empty name is refused on the field, and the dialog stays.
    await name.fill('');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.pdx-field-error')).toBeVisible();

    await name.fill('Closed ones');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(shown(page)).toHaveText('Closed ones');
});

test('deleting the view you are on asks first, then falls back to the default', async ({ page }) => {
    await filterToClosed(page);
    await saveAs(page, 'Mine');

    await fromSaveMenu(page, 'Delete');
    const ask = page.getByRole('alertdialog');
    await expect(ask, 'deleted without asking').toBeVisible();
    await ask.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(header(page)).toHaveAttribute('data-active-view', 'default');
    await expect(page.locator('[data-test="total"]'), 'the default is not the unarranged list').toHaveText('36 matching');
    // And it is gone for good, not just deselected.
    expect(await offered(page), 'the deleted view is still in the list').toEqual(['All tickets']);
});

test('a view holds the arrangement and NOT the selection', async ({ page }) => {
    await filterToClosed(page);
    await dataRows(page).first().locator('input[type="checkbox"]').check();
    await expect(page.locator('[data-test="bulk"]')).toBeVisible();

    await saveAs(page, 'Mine');
    await page.goto('/tickets');
    await expect(dataRows(page).first()).toBeVisible();

    // THE CONTROL. A view built by writing down "everything the screen holds" would restore a
    // selection nobody made, and the bulk bar would be open over rows the reader never picked.
    await expect(page.locator('[data-test="total"]'), 'the arrangement did not come back').toHaveText('12 matching');
    await expect(page.locator('[data-test="bulk"]'), 'the view restored a selection').toBeHidden();
    await expect(dataRows(page).first().locator('input[type="checkbox"]')).not.toBeChecked();
});

test('on the default view, Save and Delete are not offered; Save as and Rename… are what they can be', async ({ page }) => {
    await openTickets(page);
    await expect(header(page)).toHaveAttribute('data-active-view', 'default');
    await page.locator('[data-test="view-menu"] button').first().click();
    await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Delete', exact: true }), 'the default view can be deleted').toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Rename', exact: true })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Save as…', exact: true })).toBeEnabled();
});

// ─── One header, on every list ───────────────────────────────────────────────

for (const [path, title, all] of [
    ['/customers', 'Customers', 'All customers'],
    ['/employees', 'Employees', 'All employees'],
] as const) {
    test(`${path} has the list header with views of its own`, async ({ page }) => {
        await openList(page, path);
        await expect(header(page).getByRole('heading', { level: 1 })).toHaveText(title);
        await expect(shown(page)).toHaveText(all);

        await page.locator('[data-test="grid"] .pdx-dg-th .pdx-dg-sort-btn').first().click();
        await expect(shown(page)).toHaveText(`*${all}`);
        await saveAs(page, `Mine on ${title}`);
        await expect(shown(page)).toHaveText(`Mine on ${title}`);

        // Its own: the tickets list does not offer it.
        await openTickets(page);
        expect(await offered(page)).not.toContain(`Mine on ${title}`);
    });
}

test('at 1440 the title, the picker and the two controls sit on one row', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTickets(page);
    const middle = async (sel: string) => {
        const b = (await page.locator(sel).first().boundingBox())!;
        return b.y + b.height / 2;
    };
    const title = await middle('[data-test="list-header"] h1');
    for (const sel of ['[data-test="view-picker"]', '[data-test="view-reset"]', '[data-test="view-menu"]']) {
        expect(Math.abs((await middle(sel)) - title), `${sel} is not on the title's row`).toBeLessThanOrEqual(4);
    }
    // And the page's own action at the right edge, where the reference has New.
    const edge = (await header(page).boundingBox())!;
    const action = (await page.locator('[data-test="new"]').boundingBox())!;
    expect(Math.round(edge.x + edge.width - (action.x + action.width)), 'New is not at the right edge').toBeLessThanOrEqual(2);
});

// ─── Rows per page ────────────────────────────────────────────────────────────
//
// The grid asks its pager to draw a selector for the number of rows per page. The size is part of
// the arrangement, so a view keeps it.

const pager = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-footer pdx-pagination');
const sizeSelect = (page: Page) => pager(page).locator('pdx-select.pdx-pagination-size');
/** The last page the pager offers, read from its numbered buttons. */
async function lastPage(page: Page): Promise<number> {
    const labels = await pager(page).locator('[data-page-key^="page:"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-page-key')!));
    return Math.max(...labels.map((l) => Number(l.slice('page:'.length))));
}
async function chooseSize(page: Page, size: string): Promise<void> {
    await sizeSelect(page).getByRole('combobox', { name: 'Rows per page' }).click();
    await page.getByRole('option', { name: size, exact: true }).click();
}

test('the tickets list offers 10, 20 and 50 rows per page; 20 shows 20 rows and fewer pages', async ({ page }) => {
    await openTickets(page);
    await expect(dataRows(page)).toHaveCount(10);
    const pagesAt10 = await lastPage(page);

    await sizeSelect(page).getByRole('combobox', { name: 'Rows per page' }).click();
    expect((await page.getByRole('option').allTextContents()).map((t) => t.trim())).toEqual(['10', '20', '50']);
    await page.getByRole('option', { name: '20', exact: true }).click();

    await expect(dataRows(page)).toHaveCount(20);
    await expect.poll(() => lastPage(page), 'the pager still counts pages of 10').toBe(Math.ceil(pagesAt10 / 2));
});

test('the size is part of a view: saved with it, and back when the view is opened', async ({ page }) => {
    await openTickets(page);
    await chooseSize(page, '20');
    await expect(dataRows(page)).toHaveCount(20);
    await saveAs(page, 'Twenty');

    await openTickets(page);
    await chooseView(page, 'All tickets');
    await expect(dataRows(page)).toHaveCount(10);
    await chooseView(page, 'Twenty');
    await expect(dataRows(page)).toHaveCount(20);
    await expect(sizeSelect(page).locator('.pdx-select-value')).toHaveText('20');
});

for (const path of ['/tickets', '/customers', '/employees']) {
    test(`${path}: the rows-per-page control is a PDX select — no native <select> in the rendered page`, async ({ page }) => {
        await openList(page, path);
        await expect(pager(page).locator('.pdx-pagination-size'), 'the pager has no rows-per-page control').toHaveCount(1);
        await expect(page.locator('select'), 'a native <select> rendered in the list').toHaveCount(0);
        await expect(sizeSelect(page)).toHaveCount(1);
    });
}

// ─── No browser dialog, no native control ────────────────────────────────────
//
// No JS alerts, and no dropdowns that are not PDX. A page that calls `window.prompt` gets the
// browser's box, unstyled, untranslated and outside the app's focus handling; a native `<select>` is
// the one control on the screen that looks like the operating system. Read from the source, the way
// `i18n-routes.spec.ts` reads it: a guard that needs a page to render would miss the screens nobody
// opened.

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return sources(full);
        return /\.(pdx|ts)$/.test(name) ? [full] : [];
    });
}

test('no page calls a browser dialog or renders a native <select>', () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
        const text = readFileSync(file, 'utf8');
        const where = relative(SRC, file);
        // The script's calls. Comments are prose about the rule, not calls.
        const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        for (const m of code.matchAll(/\b(?:window|globalThis)\.(prompt|confirm|alert)\s*\(/g)) found.push(`${where}: ${m[0]}`);
        // The markup's controls, with its comments taken out for the same reason.
        const template = text.match(/<template>([\s\S]*)<\/template>/)?.[1]?.replace(/<!--[\s\S]*?-->/g, '') ?? '';
        if (/<select[\s>]/.test(template)) found.push(`${where}: <select>`);
    }
    expect(found, 'a browser dialog or a native select in the app').toEqual([]);
});
