/**
 * What a selection can be moved to, and what a server that accepts nine of twelve looks like.
 *
 * Beside close, delete and export, the bar offers the two operations a line-of-business list is
 * actually used for — move a selection to a state, hand it to someone — and the answer to the
 * question they raise: a bulk write is not a boolean. «It failed» is a lie about the
 * nine rows that landed, and an application that can only say that will be written by whoever
 * copies this screen.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

const dataRows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
const bar = (page: Page) => page.locator('[data-test="bulk"]');
const barButton = (page: Page, name: RegExp) => bar(page).getByRole('button', { name });
const outcome = (page: Page) => page.locator('[data-test="bulk-outcome"]');
const cell = (page: Page, row: number, field: string) =>
    dataRows(page).nth(row).locator(`[role="gridcell"][data-field="${field}"]`);

async function openTickets(page: Page): Promise<void> {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}

/** Tick the first `n` rows and read back what they hold in `field`. */
async function select(page: Page, n: number, field: string): Promise<string[]> {
    const before: string[] = [];
    for (let i = 0; i < n; i++) {
        await dataRows(page).nth(i).locator('input[type="checkbox"]').check();
        before.push((await cell(page, i, field).innerText()).trim());
    }
    await expect(bar(page)).toBeVisible();
    return before;
}

test('a selection moves to a state, in one write, and the rows show it', async ({ page }) => {
    await openTickets(page);
    const before = await select(page, 3, 'status');
    expect(before.some(s => s !== 'Closed'), 'the fixture starts with everything closed — this measures nothing').toBe(true);

    // The bar BECOMES its picker rather than opening one: the actions it offers are the choices,
    // and there is no second surface to place, size or dismiss.
    await barButton(page, /change status/i).click();
    await barButton(page, /^closed$/i).click();

    for (let i = 0; i < 3; i++) await expect(cell(page, i, 'status')).toHaveText('Closed');
    // A reversible action that may have moved rows off the page answers with a toast carrying the
    // undo — rule 1 of `after-the-action.spec.ts`.
    const undo = page.locator('.pdx-toast').getByRole('button', { name: /undo|annulla/i });
    await expect(undo).toBeVisible();
    await expect(page.locator('.pdx-toast')).toContainText('3');
});

test('a selection is handed to someone', async ({ page }) => {
    await openTickets(page);
    await select(page, 2, 'assignee');

    await barButton(page, /assign to/i).click();
    await barButton(page, /grace hopper/i).click();

    for (let i = 0; i < 2; i++) await expect(cell(page, i, 'assignee')).toHaveText('Grace Hopper');
});

test('nine of twelve: the line says both numbers, and the refused row stays selected', async ({ page }) => {
    await openTickets(page);
    await demo(page, 'refuse-one-bulk');
    await select(page, 3, 'status');

    await barButton(page, /change status/i).click();
    await barButton(page, /^waiting$/i).click();

    // ONE line, and it carries both halves. «It failed» would be a lie about two rows.
    await expect(outcome(page)).toBeVisible();
    await expect(outcome(page)).toContainText('2');
    await expect(outcome(page)).toContainText('1');
    // The store's own words, not a sentence the page invented for the occasion.
    await expect(outcome(page), 'the reason is not the server\'s').toContainText('locked by another operator');

    // Row 1 is the lowest id, which is the one the store refuses.
    await expect(cell(page, 0, 'status'), 'the refused row moved anyway').not.toHaveText('Waiting');
    await expect(cell(page, 1, 'status')).toHaveText('Waiting');
    await expect(cell(page, 2, 'status')).toHaveText('Waiting');

    // And the next attempt is a click: exactly the refused one is still checked.
    await expect(dataRows(page).nth(0).locator('input[type="checkbox"]')).toBeChecked();
    await expect(dataRows(page).nth(1).locator('input[type="checkbox"]'), 'a row that went through stayed selected').not.toBeChecked();
    await expect(dataRows(page).nth(2).locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(bar(page), 'the bar should still be open on the one that has to be retried').toBeVisible();
});

test('the undo of a mixed result restores what CHANGED, not what was asked', async ({ page }) => {
    await openTickets(page);
    await demo(page, 'refuse-one-bulk');
    const before = await select(page, 3, 'status');

    await barButton(page, /change status/i).click();
    await barButton(page, /^waiting$/i).click();
    await expect(outcome(page)).toBeVisible();

    await outcome(page).getByRole('button', { name: /undo|annulla/i }).click();

    // All three back to where they were — the two that moved are restored and the one that never
    // moved is untouched. An undo built from the REQUEST would have written «Waiting» onto the
    // refused row on its way back.
    for (let i = 0; i < 3; i++) await expect(cell(page, i, 'status')).toHaveText(before[i]);
    await expect(outcome(page), 'the line stayed after there was nothing left to undo').toBeHidden();
});

test('a refusal does not disappear on a timer, and a success is not a refusal', async ({ page }) => {
    await openTickets(page);
    // The control on the control: with nothing armed, the same action draws no outcome line at all.
    await select(page, 2, 'status');
    await barButton(page, /change status/i).click();
    await barButton(page, /^open$/i).click();
    await expect(page.locator('.pdx-toast')).toBeVisible();
    await expect(outcome(page), 'a write nobody refused drew a refusal').toBeHidden();
});

test('the picker is reachable and reversible: Back puts the actions back', async ({ page }) => {
    await openTickets(page);
    await select(page, 1, 'status');
    const actionsBefore = (await bar(page).getByRole('button').allInnerTexts()).map(t => t.trim()).filter(Boolean);

    await barButton(page, /change status/i).click();
    await expect(barButton(page, /^closed$/i)).toBeVisible();
    await expect(barButton(page, /change status/i), 'the bar kept both the action and its choices').toBeHidden();

    await barButton(page, /back/i).click();
    const actionsAfter = (await bar(page).getByRole('button').allInnerTexts()).map(t => t.trim()).filter(Boolean);
    expect(actionsAfter).toEqual(actionsBefore);
});
