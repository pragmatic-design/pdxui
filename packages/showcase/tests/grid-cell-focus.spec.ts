/**
 * The real grid outlines a cell for the keyboard, not for the mouse.
 *
 * The CSS is measured on static markup in packages/design/tests/data-grid-cell-focus.spec.ts. This
 * is the case the markup cannot show: a reader who clicked a cell and THEN moves with the arrows.
 * The grid moves the focus from a keydown, and that focus must be visible, or a keyboard reader
 * who started with the mouse loses their place.
 *
 * On the import's preview grid, because it is the one whose rows open nothing: a click on a tickets
 * or a customers row opens the record's drawer, and the drawer takes the
 * focus.
 */
import { test, expect, type Page } from './fixture';

const firstRow = (page: Page) => page.locator('[data-test="preview"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') }).first();
const focused = (page: Page) => page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    // The field of the cell or header holding the focus, the focus itself possibly on a control in it
    // (a header's sort button).
    return { field: el.closest('[data-field]')?.getAttribute('data-field') ?? null, outline: getComputedStyle(el).outlineStyle };
});

test('a clicked cell has no outline, and the arrows bring it back', async ({ page }) => {
    await page.goto('/customers/import');
    await page.locator('[data-test="dropzone"] input[type="file"]').setInputFiles({
        name: 'customers.csv', mimeType: 'text/csv',
        buffer: Buffer.from('name,sector,tier\r\nGlobex Industrial,Manufacturing,enterprise', 'utf-8'),
    });
    await expect(firstRow(page)).toBeVisible();

    await firstRow(page).locator('[role="gridcell"][data-field="name"]').click();
    const clicked = await focused(page);
    expect(clicked.field, 'the click did not focus the cell').toBe('name');
    expect(clicked.outline, 'a clicked cell is outlined like a spreadsheet selection').toBe('none');

    await page.keyboard.press('ArrowRight');
    const moved = await focused(page);
    expect(moved.field, 'ArrowRight did not move to the next cell').toBe('sector');
    expect(moved.outline, 'the keyboard moved the focus and nothing shows where it is').toBe('solid');
});

test('holding Shift for a multi-sort does not outline the header just clicked', async ({ page }) => {
    // Chromium counts a lone modifier as keyboard interaction: pressing Shift makes the focused
    // header `:focus-visible`, and it would draw its ring while multi-sorting.
    await page.goto('/tickets');
    const priority = page.locator('[role="columnheader"][data-field="priority"]');
    await expect(priority).toBeVisible();
    // A click by coordinates does not wait for what covers them: the start-up splash.
    await expect(page.locator('#pdx-splash')).toHaveCount(0);
    const box = (await priority.boundingBox())!;
    // On the label, as a person clicks it — not on the sort button's centre.
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
    expect((await focused(page)).field, 'the click did not focus the header').toBe('priority');

    await page.keyboard.down('Shift');
    const held = await focused(page);
    await page.keyboard.up('Shift');
    expect(held.outline, 'pressing Shift outlined the header like a selection').toBe('none');

    // Control: a real key still brings the ring back — the keyboard reader keeps their place.
    await page.keyboard.press('ArrowRight');
    const moved = await focused(page);
    expect(moved.field, 'ArrowRight did not move to the next header').not.toBe('priority');
    expect(moved.outline, 'the arrow moved the focus and nothing shows where it is').toBe('solid');
});

test('control — Tab back into a grid last used with the mouse shows where the focus is', async ({ page }) => {
    // A control, not the proof: here the Tab reaches a cell through the grid's own toolbar, and a key
    // heard there already clears the pointer mark. The case a listener on the grid alone would miss —
    // every key pressed outside it — is measured in ui/tests/unit/grid-input-modality.test.ts.
    await page.goto('/tickets');
    const priority = page.locator('[role="columnheader"][data-field="priority"]');
    await expect(priority).toBeVisible();
    await expect(page.locator('#pdx-splash')).toHaveCount(0);
    const box = (await priority.boundingBox())!;
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
    // Out of the grid by the POINTER, then back in by Tab: every key is pressed outside the grid.
    await page.locator('main h1').first().click();
    const inGrid = () => page.evaluate(() => !!document.activeElement?.closest('pdx-data-grid [data-field]'));
    for (let i = 0; i < 40 && !(await inGrid()); i++) await page.keyboard.press('Tab');
    const back = await focused(page);
    expect(back.field, 'Tab did not come back to a grid cell').not.toBeNull();
    expect(back.outline, 'back in by the keyboard, and nothing shows where the focus is').toBe('solid');
});
