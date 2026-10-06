/**
 * A row's own actions.
 *
 * With the bulk bar as the only action surface, acting on ONE record means selecting it first —
 * the long way round for the commonest case — and the actions a single record has and a selection
 * does not (duplicate, print, open in a new tab) have nowhere to live.
 *
 * The two surfaces stay DIFFERENT, and the last test here is what holds them apart: a row's menu
 * is not a copy of the bulk bar with one row selected.
 */
import { test, expect, type Page } from '@playwright/test';

const dataRows = (page: Page) => page.locator('[data-test="grid"] [role="row"]').filter({ has: page.locator('[role="gridcell"]') });
// The ROW's menu: signed in, the bar's profile menu is a `[role="menu"]` on the page too.
const menu = (page: Page) => page.locator('.pdx-dg-row-menu[role="menu"]');
const item = (page: Page, name: RegExp | string) => menu(page).getByRole('menuitem', { name });

async function openTickets(page: Page): Promise<void> {
    await page.goto('/tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();
    await expect(dataRows(page).first()).toBeVisible();
}

/** The one control the row offers, on the row at `i`. */
const trigger = (page: Page, i = 0) => dataRows(page).nth(i).getByRole('button', { name: /actions for/i });

test('the row offers ONE control, and it opens a menu', async ({ page }) => {
    await openTickets(page);
    const row = dataRows(page).first();
    // One, not four: at 390px a row of four icon buttons is the whole width of the phone. The eye
    // that opens the record is the row's PRIMARY action and stays a button of its own — a menu
    // that hides the commonest action is the long way round again.
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(row.getByRole('button'), 'the row grew a row of buttons').toHaveCount(2);

    await trigger(page).click();
    await expect(menu(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    // Opening a menu is not voting on the row: the checkbox belongs to the bulk bar.
    await expect(page.locator('[data-test="bulk"]')).toBeHidden();
});

test('the keyboard opens it, walks it, and Escape comes back to the trigger', async ({ page }) => {
    await openTickets(page);
    await trigger(page).focus();
    await page.keyboard.press('Enter');
    await expect(menu(page)).toBeVisible();
    // Focus is IN the menu — a menu that opens under the hand and leaves the focus behind is a
    // menu a keyboard reader cannot use.
    await expect(item(page, /duplicate/i).first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(item(page, /duplicate/i).first()).not.toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
});

test('duplicate makes a NEW record from this one, and lands on it', async ({ page }) => {
    await openTickets(page);
    const first = dataRows(page).first();
    const cells = first.locator('[role="gridcell"]');
    // Cell 0 is the selection checkbox, so the data starts at 1 — measured, not assumed.
    const reference = (await cells.nth(1).innerText()).trim();
    const subject = (await cells.nth(2).innerText()).trim();
    const before = await page.locator('[data-test="total"]').innerText();

    await trigger(page).click();
    await item(page, /duplicate/i).click();

    // The copy opens where an edit opens: the screen IS the confirmation.
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const copied = await drawer.locator('input[name="subject"]').inputValue();
    expect(copied, 'the copy does not say it is one').toContain('(copy)');
    expect(copied).toContain(subject);

    // A new record, not the same one twice: the store counted one more, and the copy is not
    // the row it was made from.
    await expect(page.locator('[data-test="total"]')).not.toHaveText(before);
    await expect(drawer.locator('input[name="subject"]')).not.toHaveValue(subject);
    expect(await drawer.innerText()).not.toContain(reference);
});

test('"open in a new tab" is a LINK, with the record\'s own address', async ({ page }) => {
    await openTickets(page);
    const id = await dataRows(page).first().getAttribute('data-row-id');
    await trigger(page).click();

    // An <a href>, not a button that calls window.open: middle-clickable, copyable, and announced
    // as a link. This is the whole reason the menu item carries an href.
    const open = item(page, /new tab/i);
    await expect(open).toHaveJSProperty('tagName', 'A');
    await expect(open).toHaveAttribute('href', `/tickets/${id}`);
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', 'noopener');
});

test('an action this role may not take stays on screen, marked, and says why', async ({ page }) => {
    await openTickets(page);
    // Row 3 is a CLOSED ticket, whose record is archived: exporting it is refused. Rows 1 and 2
    // are not, and that difference is the control — a rule that refuses everything is satisfied by
    // refusing everything.
    await trigger(page, 2).click();
    const denied = item(page, /export/i);
    await expect(denied, 'the action was withheld instead of refused').toBeVisible();
    await expect(denied).toHaveAttribute('aria-disabled', 'true');

    const why = await denied.getAttribute('aria-describedby');
    expect(why, 'marked disabled with no reason given').toBeTruthy();
    await expect(page.locator(`#${why}`)).toHaveText(/archived/i);

    // And the mark is true rather than decorative: the menu stays open on a refused pick.
    // `force`, because Playwright refuses to click what it reads as not enabled — which is the
    // point: the mark is real. What is being measured is that the click, when it arrives, does
    // nothing and leaves the menu open so the reason stays readable.
    await denied.click({ force: true });
    await expect(menu(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await trigger(page, 0).click();
    await expect(item(page, /export/i), 'the refusal was not per-row').not.toHaveAttribute('aria-disabled', 'true');
});

test('the two surfaces stay different: a row menu is not the bulk bar', async ({ page }) => {
    await openTickets(page);
    await trigger(page).click();
    const rowActions = (await menu(page).getByRole('menuitem').allInnerTexts()).map(t => t.trim().toLowerCase());
    await page.keyboard.press('Escape');

    await dataRows(page).first().locator('input[type="checkbox"]').check();
    const bar = page.locator('[data-test="bulk"]');
    await expect(bar).toBeVisible();
    const bulk = (await bar.getByRole('button').allInnerTexts()).map(t => t.trim().toLowerCase()).filter(Boolean);

    // What one record affords and what a selection affords are not the same list. Archive and
    // Close act on a selection; duplicate, print and «open in a new tab» have no meaning for one.
    expect(rowActions.some(a => a.includes('duplicate'))).toBe(true);
    expect(bulk.some(a => a.includes('duplicate')), 'a single-record action leaked into the bulk bar').toBe(false);
    expect(bulk.some(a => a.includes('archive'))).toBe(true);
    expect(rowActions.some(a => a.includes('archive')), 'a selection action leaked into the row menu').toBe(false);
});
