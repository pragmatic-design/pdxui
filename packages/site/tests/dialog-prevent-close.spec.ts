/**
 * The dialog page's prevent-close demo asks before closing with an in-app confirm, not the browser's.
 *
 * This is the one "ask before closing" example the library ships, and a reader copies the demo. The
 * browser's modal (`window.confirm`) blocks every automated browser, and `warnUnsaved` does not use
 * it either.
 *
 * The native modal is observed, not assumed: Playwright reports it as a `dialog` event on the page.
 * Stay and Leave are both exercised, because a handler that always closes and one that never does
 * would each pass half of this.
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Whether the demo's own dialog is open: pdx-dialog marks its backdrop with data-open. Found by its
 * `title` prop: the host keeps no title attribute.
 */
function editorOpen(page: Page) {
    return page.evaluate(() => {
        const el = [...document.querySelectorAll<HTMLElement>('pdx-dialog')].find(d => d.title === 'Edit Document');
        return el?.querySelector('.pdx-dialog-backdrop')?.hasAttribute('data-open') ?? null;
    });
}

test('the prevent-close demo asks in the page, and Stay and Leave both do what they say', async ({ page }) => {
    const nativeDialogs: string[] = [];
    page.on('dialog', d => {
        nativeDialogs.push(`${d.type()}: ${d.message()}`);
        void d.dismiss();
    });

    await page.goto('/components/dialog', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Edit with Unsaved Warning' }).click();
    await expect.poll(() => editorOpen(page), 'the demo dialog never opened').toBe(true);

    await page.keyboard.press('Escape');
    const ask = page.getByRole('alertdialog');
    // Soft, so a red run reports both halves: no in-app question, and the browser's modal instead.
    await expect.soft(ask, 'Escape did not open an in-app confirm').toBeVisible();
    expect(nativeDialogs, 'the demo asked with the browser\'s modal').toEqual([]);
    await ask.getByRole('button', { name: 'Stay' }).click();
    await expect(ask).toHaveCount(0);
    expect(await editorOpen(page), 'Stay closed the dialog').toBe(true);

    await page.keyboard.press('Escape');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();
    await expect.poll(() => editorOpen(page), 'Leave did not close the dialog').toBe(false);
    expect(nativeDialogs).toEqual([]);
});
