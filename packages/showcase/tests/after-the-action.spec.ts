/**
 * What a screen says after an action, and the rule that decides which.
 *
 * Without a rule, every screen answers an action its own way — an undo bar drawn by the page,
 * nothing at all, a paragraph in one screen and a different one in another — and the next screen
 * invents one more.
 *
 * The rule, written in `packages/showcase/README.md` and asserted here:
 *
 *   1. REVERSIBLE and out of sight (archive, bulk close) → a toast carrying the undo, for as long
 *      as the undo lasts. The row left the list; the way back has to travel with the message.
 *   2. VISIBLE where it happened (create, inline edit, a saved form) → the record appears and
 *      nothing is announced visually. The screen IS the confirmation.
 *   3. REFUSED (the server said no, a permission is missing) → stays on the screen that asked,
 *      next to the control that asked, and does NOT disappear on a timer.
 *
 * And all three reach a screen reader exactly once, which is the part no visual rule covers.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

const rows = (page: Page) => page.locator('[data-test="grid"] .pdx-dg-row');

async function openTickets(page: Page): Promise<void> {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
}

test('rule 1 — a reversible action that removes a row answers with a toast that undoes it', async ({ page }) => {
    await openTickets(page);
    const before = await page.locator('[data-test="total"]').textContent();

    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();

    // The answer is a toast, not a bar this page drew: one shape for every screen.
    const toast = page.locator('.pdx-toast').filter({ hasText: /T-1000/ });
    await expect(toast, 'the archive answered with something other than a toast').toBeVisible();

    // And the way back travels with it.
    await toast.getByRole('button', { name: /undo/i }).click();
    await expect(page.locator('[data-test="total"]'), 'undo did not bring the row back').toHaveText(before!);
});

test('rule 2 — a create answers with the record, and draws no toast', async ({ page }) => {
    await openTickets(page);
    await page.locator('[data-test="new"] button').click();
    const dialog = page.locator('[data-test="create-dialog"] .pdx-dialog-panel');
    await expect(dialog).toBeVisible();
    await dialog.locator('input[name="subject"]').fill('The lift is stuck');
    await dialog.locator('input[name="customer"]').fill('Northwind');
    await dialog.getByRole('button', { name: /create/i }).click();

    // The screen IS the confirmation: the server counted it. Not the row's text — the default sort
    // is id ascending, so a new record lands on the LAST page, and asserting its text here would be
    // asserting on the sort order (the same reading `tickets-crud.spec.ts` records).
    await expect(page.locator('[data-test="total"]')).toHaveText('37 matching');
    // …and nothing was thrown on top of it.
    await expect(page.locator('.pdx-toast'), 'a create announced itself in a toast as well').toHaveCount(0);
});

test('rule 3 — a refusal is a toast in view, and it stays until it is dismissed', async ({ page }) => {
    // Not a paragraph under the grid: that is where nobody looks, below the pager, out of sight,
    // while the reader is at the bulk bar. A refusal does not vanish on a timer, and it appears in
    // view.
    await openTickets(page);
    await demo(page, 'refuse-next');
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();

    const refusal = page.locator('.pdx-toast').filter({ hasText: /referenced by an open intervention/i });
    await expect(refusal, 'the refusal is not a toast').toBeVisible();
    await expect(refusal, 'the refusal is out of sight').toBeInViewport();

    // Six seconds later it is still there. A refusal on a timer is a refusal a reader can miss, and
    // a toast's default life is shorter than this wait.
    await page.waitForTimeout(6000);
    await expect(refusal, 'the refusal disappeared on a timer').toBeVisible();

    // Control: it can be closed. A toast nobody could dismiss would pass everything above.
    await refusal.getByRole('button', { name: /close|dismiss|chiudi/i }).click();
    await expect(refusal, 'the refusal could not be dismissed').toHaveCount(0);
});

test('rule 3 — the next action takes the old refusal away', async ({ page }) => {
    // Two actions must not leave two stale refusals stacked: the page used to empty the paragraph
    // on the next write, and the toast has to follow the same rule.
    await openTickets(page);
    await demo(page, 'refuse-next');
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();
    const refusal = page.locator('.pdx-toast').filter({ hasText: /referenced by an open intervention/i });
    await expect(refusal).toBeVisible();

    // The next write is refused-free: the old refusal goes when it starts.
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();
    await expect(refusal, 'a stale refusal stayed on screen after the next action').toHaveCount(0);
});

test('and each answer reaches a screen reader once', async ({ page }) => {
    // The half no visual rule covers. A live region that says nothing is a screen that talks only
    // to people who can see it — and one that says it twice is worse than silence.
    await openTickets(page);
    await rows(page).first().locator('input[type="checkbox"]').check();
    await page.locator('[data-test="bulk"]').getByRole('button', { name: /archive|delete/i }).first().click();

    const live = page.locator('[role="status"], [aria-live="polite"]').filter({ hasText: /T-1000/ });
    await expect(live, 'the archive was never announced').toHaveCount(1);
});
