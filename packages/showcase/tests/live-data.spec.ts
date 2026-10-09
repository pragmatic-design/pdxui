/**
 * Live data, on the production build.
 *
 * The bridge into the reactive world is `fromCallback(setup)`. What this measures is
 * everything after it, which is the part that decides whether a live list is usable or maddening:
 *
 *   - a push lands on a row that is on screen **while a row is selected and the list is scrolled**,
 *     and neither moves. That is the whole difference between `applyServerChange()` and `refresh()`;
 *   - a push lands on the row whose subject is being edited, and the half-typed text survives;
 *   - the connection drops, the world moves on without us, and on reconnect the list agrees with
 *     the server instead of quietly showing yesterday.
 *
 * The feed is commanded, not timed (`src/data/live.ts`): a colleague acts when a button says so.
 * A setInterval feed would make every assertion below a race, and a race dressed as a test is worse
 * than no test.
 */
import { test, expect, type Page } from './fixture';
import { demo } from './demo';

const dataRows = (page: Page) =>
    page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });

async function openTickets(page: Page): Promise<void> {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}

/**
 * The status cell of a row, by its reference.
 *
 * `data-field`, not an index: written as `.nth(4)` first, which read "Low" — the selection column
 * is a gridcell too, so every index was one out. The grid puts the field name on the cell precisely
 * so a test does not have to count columns.
 */
function statusOf(page: Page, reference: string) {
    return dataRows(page).filter({ hasText: reference }).locator('[data-field="status"]');
}

/** The reference of a row, which is what every assertion here identifies a ticket by. */
async function referenceOf(row: ReturnType<typeof dataRows>): Promise<string> {
    return (await row.locator('[data-field="reference"]').innerText()).trim();
}

test('the page says whether it is live, before anything else happens', async ({ page }) => {
    // The fifth question of the story, and the cheapest: a list that claims to be live and silently
    // stopped receiving is worse than one that never claimed.
    await openTickets(page);
    await expect(page.locator('[data-test="live-state"]')).toHaveText(/Live/);
});

test('a colleague closes a ticket and the row changes under the reader', async ({ page }) => {
    await openTickets(page);
    const row = dataRows(page).nth(1);
    const reference = await referenceOf(row);

    await expect(statusOf(page, reference)).not.toHaveText(/Closed/);
    await demo(page, 'push-close');

    await expect(statusOf(page, reference)).toHaveText(/Closed/);
    await expect(page.locator('[data-test="live-notice"]')).toContainText(reference);
});

test('the selection and the scroll offset survive the push', async ({ page }) => {
    // This is the assertion the story is really about. `refresh()` would satisfy the test above and
    // fail this one: the grid rebuilds, the selection is dropped and the list jumps to the top.
    await openTickets(page);

    const row = dataRows(page).nth(1);
    const reference = await referenceOf(row);
    await row.locator('input[type="checkbox"], [role="checkbox"]').first().click();
    await expect(page.locator('[data-test="bulk"]')).toBeVisible();

    // Scroll something that can actually scroll: the window, with the grid below the fold.
    await page.evaluate(() => window.scrollTo(0, 400));
    const offsetBefore = await page.evaluate(() => window.scrollY);
    expect(offsetBefore, 'the page has to be scrolled for the assertion to mean anything').toBeGreaterThan(0);

    // A programmatic click, and the reason is worth keeping: `locator.click()` scrolls its target
    // into view first, and the colleague's buttons are at the top of the page — so the driver, not
    // the push, was resetting the offset. Measured: the document height was 1368 before and after,
    // and `scrollY` went 400 → 0 at the click. The button is still the real one and the handler is
    // the real one; only the driver's scrolling is out of the way.
    await page.evaluate(() => (document.querySelector('[data-test="push-close"]') as HTMLElement).click());
    await expect(statusOf(page, reference)).toHaveText(/Closed/);

    await expect(page.locator('[data-test="bulk"]'), 'the selection must survive a server push').toBeVisible();
    expect(await page.evaluate(() => window.scrollY), 'the scroll offset must survive a server push').toBe(offsetBefore);
});

test('a push for the row being edited leaves the half-typed text alone, and says so', async ({ page }) => {
    await openTickets(page);

    // Select row 2 — the same row the colleague retitles — so the inline editor is on it.
    const row = dataRows(page).nth(1);
    const reference = await referenceOf(row);
    await row.locator('input[type="checkbox"], [role="checkbox"]').first().click();

    // Focus then Enter, which is how `pdx-inline-edit` opens — the same way
    // `site/tests/inline-edit-focus.spec.ts` drives it. A click on the display button does not.
    const editor = page.locator('[data-test="inline-subject"]');
    await expect(editor).toBeVisible();
    await editor.getByRole('button').first().focus();
    await page.keyboard.press('Enter');
    const field = editor.getByRole('textbox');
    await expect(field).toBeFocused();
    await field.fill('Half-typed by the reader');

    // Programmatic again, and for a second reason: `locator.click()` also moves focus to the
    // button, and `pdx-inline-edit` closes on blur — so the driver would have closed the editor
    // before the push ever arrived, and the test would have measured itself.
    await page.evaluate(() => (document.querySelector('[data-test="push-retitle"]') as HTMLElement).click());

    // Both halves matter: the text is not yanked from under the reader, AND the reader is told.
    await expect(field).toHaveValue('Half-typed by the reader');
    await expect(page.locator('[data-test="live-notice"]')).toContainText(reference);
});

test('a ticket withdrawn elsewhere leaves the list, and takes its selection with it', async ({ page }) => {
    await openTickets(page);

    const row = dataRows(page).nth(2);
    const reference = await referenceOf(row);
    await row.locator('input[type="checkbox"], [role="checkbox"]').first().click();
    await expect(page.locator('[data-test="bulk"]')).toBeVisible();

    await page.evaluate(() => (document.querySelector('[data-test="push-withdraw"]') as HTMLElement).click());

    await expect(dataRows(page).filter({ hasText: reference })).toHaveCount(0);
    // A selected id whose row no longer exists is a selection nobody can act on: every bulk action
    // over it would fail against a record the server does not have.
    await expect(page.locator('[data-test="bulk"]')).toBeHidden();
});

test('a ticket raised elsewhere appears without a reload', async ({ page }) => {
    await openTickets(page);
    const before = await dataRows(page).count();

    await demo(page, 'push-raise');

    await expect(dataRows(page)).toHaveCount(before + 1);
});

test('while the connection is down the page says so, and stops changing', async ({ page }) => {
    await openTickets(page);

    await demo(page, 'go-offline');
    await expect(page.locator('[data-test="live-state"]')).toHaveText(/Disconnected/);

    const row = dataRows(page).nth(1);
    const reference = await referenceOf(row);
    await demo(page, 'push-close');

    // The server changed. This client did not hear it, and must not pretend otherwise — the row
    // stays as it was, which is why the banner above has to be on screen.
    await expect(statusOf(page, reference)).not.toHaveText(/Closed/);
});

test('reconnecting re-reads the list, because what was missed is unknown', async ({ page }) => {
    await openTickets(page);

    await demo(page, 'go-offline');
    const row = dataRows(page).nth(1);
    const reference = await referenceOf(row);
    await demo(page, 'push-close');
    await expect(statusOf(page, reference)).not.toHaveText(/Closed/);

    await demo(page, 'go-online');

    await expect(page.locator('[data-test="live-state"]')).toHaveText(/Live/);
    // The list now agrees with the server about the change it never heard.
    await expect(statusOf(page, reference)).toHaveText(/Closed/);
    await expect(page.locator('[data-test="live-notice"]')).toContainText('offline');
});
