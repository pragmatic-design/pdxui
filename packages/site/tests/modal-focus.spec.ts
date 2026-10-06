/**
 * A modal keeps focus while it is open — a click on its backdrop or on its text does not move focus to
 * the page behind.
 *
 * With pdx-alert-dialog open (aria-modal="true"), a click on the backdrop must not move
 * document.activeElement to the page host: the Tab trap only works while focus is inside, and the
 * next Tab would go to the page behind. The same holds for pdx-dialog whenever its backdrop does not
 * close it (close-on-backdrop="false"), and for the dialogs pdx-overlay-outlet draws: same backdrop,
 * same panel. Focus is layout and user input, so it is measured in Chromium, on the galleries.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

async function gallery(page: Page, tag: string): Promise<void> {
    await page.goto(`/components/${tag}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.cmp-gallery section').first().waitFor();
}

const focusInside = (panel: Locator) => panel.evaluate((p) => p.contains(document.activeElement));

/** A real click on the backdrop, away from the panel: 8px inside the backdrop's top-left corner. */
async function clickBackdrop(page: Page, panel: Locator): Promise<void> {
    const backdrop = panel.locator('xpath=..');
    const box = await backdrop.boundingBox();
    if (!box) throw new Error('no backdrop box');
    await page.mouse.click(box.x + 8, box.y + 8);
}

/** The backdrop click, a click on the panel's own text, and a Tab: focus stays inside each time. */
async function focusHolds(page: Page, panel: Locator, text: Locator): Promise<void> {
    await expect.poll(() => focusInside(panel), 'focus did not start inside').toBe(true);
    await clickBackdrop(page, panel);
    await expect(panel).toBeVisible();
    expect(await focusInside(panel), 'a click on the backdrop moved focus out of the modal').toBe(true);
    await page.keyboard.press('Tab');
    expect(await focusInside(panel), 'Tab after the backdrop click left the modal').toBe(true);
    await text.click();
    expect(await focusInside(panel), 'a click on the modal\'s own text moved focus out of it').toBe(true);
    await page.keyboard.press('Tab');
    expect(await focusInside(panel), 'Tab after a click on the text left the modal').toBe(true);
}

test('pdx-alert-dialog: the backdrop and the message keep focus in the dialog', async ({ page }) => {
    await gallery(page, 'pdx-alert-dialog');
    await page.locator('.cmp-gallery').getByRole('button', { name: 'Delete Item' }).click();
    const panel = page.getByRole('alertdialog', { name: 'Delete this item?' });
    await expect(panel).toBeVisible();
    await focusHolds(page, panel, panel.getByText('This action cannot be undone', { exact: false }));
});

test('pdx-dialog with close-on-backdrop="false": the backdrop and the text keep focus in the dialog', async ({ page }) => {
    await gallery(page, 'pdx-dialog');
    await page.locator('.cmp-gallery').getByRole('button', { name: 'Open Required Action' }).click();
    const panel = page.getByRole('dialog', { name: 'Session Expired' });
    await expect(panel).toBeVisible();
    await focusHolds(page, panel, panel.getByText('Your session has expired', { exact: false }));
});

test('a dialog drawn by pdx-overlay-outlet: the backdrop and the message keep focus in it', async ({ page }) => {
    await gallery(page, 'pdx-overlay-outlet');
    await page.locator('.cmp-gallery').getByRole('button', { name: 'Delete project…' }).click();
    const panel = page.getByRole('alertdialog', { name: 'Delete project?' });
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAccessibleDescription(/12 files will be removed/);
    await focusHolds(page, panel, panel.getByText('cannot be undone', { exact: false }));
});

test('pdx-alert-dialog type-to-confirm: reopened, the field is empty and confirm is disabled', async ({ page }) => {
    await gallery(page, 'pdx-alert-dialog');
    const open = page.locator('.cmp-gallery').getByRole('button', { name: 'Delete Account' });
    const panel = page.getByRole('alertdialog', { name: 'Delete your account?' });
    await open.click();
    await panel.getByRole('textbox').fill('DELETE');
    await expect(panel.getByRole('button', { name: 'Delete Account' })).toBeEnabled();
    await panel.getByRole('button', { name: 'Delete Account' }).click();
    await expect(panel).toBeHidden();

    await open.click();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('textbox'), 'the field kept the text of the last time').toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Delete Account' })).toBeDisabled();
});

test('pdx-alert-dialog: the message is the dialog\'s description', async ({ page }) => {
    await gallery(page, 'pdx-alert-dialog');
    await page.locator('.cmp-gallery').getByRole('button', { name: 'Delete Item' }).click();
    const panel = page.getByRole('alertdialog', { name: 'Delete this item?' });
    await expect(panel).toHaveAccessibleDescription('This action cannot be undone. The item will be permanently removed.');
});
