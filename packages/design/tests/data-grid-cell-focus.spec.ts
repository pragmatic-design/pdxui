import { test, expect, type Page } from '@playwright/test';

// A grid cell draws its focus outline for the keyboard, not for the mouse.
//
// On `:focus`, a mouse click on a cell would leave a primary outline around that one cell, which
// reads as a spreadsheet selecting it, and the grid has no cell selection. The outline is for
// a reader moving with the arrows, who must see where they are: that is `:focus-visible`.
//
// Static markup measures the CSS itself: a click focuses the cell without `:focus-visible`, a Tab
// focuses it with it. The control is the second row: without it, removing the outline everywhere
// would pass the first.

const HARNESS = '/demo/test-harness.html';

/** A body row as grid-body.ts builds it; the first cell holds the roving tab stop. */
async function mount(page: Page): Promise<void> {
    await page.goto(HARNESS);
    await page.evaluate(() => {
        const host = document.createElement('div');
        host.id = 'dg-host';
        host.innerHTML = `
            <button id="before" type="button">before</button>
            <div class="pdx-dg-body" role="rowgroup" style="width: 300px">
                <div class="pdx-dg-row" role="row" data-row-id="1">
                    <div class="pdx-dg-td" role="gridcell" data-field="name" tabindex="0" style="width: 150px">Ada</div>
                    <div class="pdx-dg-td" role="gridcell" data-field="city" tabindex="-1" style="width: 150px">London</div>
                </div>
            </div>`;
        document.body.prepend(host);
    });
}

const cell = (page: Page) => page.locator('#dg-host [data-field="name"]');
const outlineStyle = (page: Page) => cell(page).evaluate((el) => getComputedStyle(el).outlineStyle);

test('a mouse click on a cell focuses it and draws no outline', async ({ page }) => {
    await mount(page);
    await cell(page).click();

    await expect(cell(page), 'the click did not focus the cell').toBeFocused();
    expect(await outlineStyle(page), 'a clicked cell is outlined like a selected spreadsheet cell').toBe('none');
});

test('control — reaching the same cell with the keyboard draws the outline', async ({ page }) => {
    await mount(page);
    await page.locator('#before').focus();
    await page.keyboard.press('Tab');

    await expect(cell(page), 'Tab did not reach the cell').toBeFocused();
    expect(await outlineStyle(page), 'a keyboard reader cannot see which cell they are on').toBe('solid');
});
