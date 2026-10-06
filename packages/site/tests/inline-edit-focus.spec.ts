/**
 * pdx-inline-edit on the site, measured in Chromium.
 *
 * Enter (save) and Escape (cancel) return focus to the display button, not <body>. Tab out of the
 * editor moves on to the next field and closes the first one. Each editor is named after its value
 * or its label, not "Edit value".
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * The gallery, WAITED FOR rather than assumed.
 *
 * A `goto` followed straight by `getByRole(…)` charges the page's whole mount to one assertion's
 * five-second default — and under the load of the full suite on four workers that budget runs
 * out. It fails about once a run, green on either side, and a suite with one test that fails now
 * and then stops being read.
 *
 * With CPU throttling through CDP, the button appears **282 ms** after `domcontentloaded` at full
 * speed, **5 007 ms** at 10× — the default timeout, exactly — and **27 494 ms** at 20×. A single
 * wait on the role fails every run at 10×, with *element(s) not found*.
 *
 * So the wait is split rather than lengthened. The component having RENDERED is a different
 * question from what its button is called: this waits for the first, generously and with a
 * message that names it, and each test then asserts the second on its own default. A regression
 * in the accessible name still fails fast and says so.
 */
async function openGallery(page: Page): Promise<void> {
    await page.goto('/components/pdx-inline-edit', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.cmp-gallery pdx-inline-edit .pdx-inline-edit-display').first(),
        'the gallery never mounted: the route chunk or the component registration did not arrive')
        .toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
    await openGallery(page);
});

test('the display button is named by its value alone, and the editor after the value', async ({ page }) => {
    const name = page.getByRole('button', { name: 'John Doe', exact: true });
    await expect(name).toBeVisible();
    await name.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Edit John Doe', exact: true })).toBeFocused();
});

test('with a label, the editor is named after the field', async ({ page }) => {
    await page.getByRole('button', { name: 'Alice Johnson', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
});

test('Enter saves and Escape cancels, and both return focus to the display button', async ({ page }) => {
    const host = page.locator('pdx-inline-edit').first();
    await host.getByRole('button', { name: 'John Doe', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Jane Roe');
    await page.keyboard.press('Enter');
    const saved = host.getByRole('button', { name: 'Jane Roe', exact: true });
    await expect(saved).toBeFocused();
    expect(await host.evaluate(el => (el as HTMLElement & { value: unknown }).value)).toBe('Jane Roe');

    await page.keyboard.press('Enter');
    await page.keyboard.type('discarded');
    await page.keyboard.press('Escape');
    await expect(saved).toBeFocused();
});

test('Tab out of the editor saves it and closes it: one editor open at a time', async ({ page }) => {
    const first = page.locator('pdx-inline-edit').first();
    await first.getByRole('button', { name: 'John Doe', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Tabbed away');
    await page.keyboard.press('Tab');

    await expect(page.locator('pdx-inline-edit .pdx-inline-edit.editing')).toHaveCount(0);
    await expect(first.getByRole('button', { name: 'Tabbed away', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'john@example.com', exact: true })).toBeFocused();
});

test('and it holds on a machine ten times slower', async ({ page }) => {
    // At 10× the mount takes about as long as the default assertion timeout allows, which is
    // why a single wait fails roughly once per full-suite run and passes on either side of it.
    // The split above is what this measures: the mount is waited for
    // where it can be, and the name is asserted where it belongs.
    //
    // Deliberately slow, so its own budget is generous — the point is that the wait is in the
    // right place, not that a throttled machine is fast.
    test.setTimeout(90_000);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 10 });

    await openGallery(page);
    await expect(page.getByRole('button', { name: 'John Doe', exact: true })).toBeVisible();
});
