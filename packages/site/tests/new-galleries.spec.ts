/**
 * Five component pages are exercised through their galleries.
 *
 * pdx-field-group, pdx-field-list, pdx-overlay-outlet, pdx-time-picker and pdx-toggle-group each
 * have a showcase page for port-demos to port, rather than the "demos are being finalized"
 * placeholder or a bare element. Each is driven here the way a reader would: a key, a click, a typed
 * value — and the page's own readout is what is measured.
 */
import { test, expect, type Page } from '@playwright/test';

async function gallery(page: Page, tag: string): Promise<void> {
    await page.goto(`/components/${tag}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.cmp-gallery section').first().waitFor();
    // The site loads Inter, Manrope and JetBrains Mono from Google Fonts with `display=swap`: the
    // page lays out once with the fallback metrics and again when they arrive, and a row 2100px
    // down moves 3.6px between the two. Measuring before that is measuring a layout the reader
    // never sees, and makes this file's geometry intermittently red.
    await page.evaluate(() => document.fonts.ready);
}

/** The gallery section a heading heads — its parent. */
function section(page: Page, heading: string) {
    return page.locator('.cmp-gallery').getByRole('heading', { name: heading, exact: true }).locator('xpath=..');
}

test.describe('pdx-time-picker', () => {
    test('↑ on the minutes of a step-15 picker moves a quarter hour', async ({ page }) => {
        await gallery(page, 'pdx-time-picker');
        const s = section(page, 'Seconds and step');
        const minute = s.getByRole('group', { name: 'Quarter hours' }).getByRole('spinbutton', { name: 'Minute' });
        await minute.focus();
        await minute.press('ArrowUp');
        await expect(s.getByText('value: 10:15')).toBeVisible();
    });

    test('min and max hold: an empty office-hours picker starts from 09:00 and stays inside the range', async ({ page }) => {
        await gallery(page, 'pdx-time-picker');
        const s = section(page, 'Min and max');
        const hour = s.getByRole('group', { name: 'Office hours' }).getByRole('spinbutton', { name: 'Hour' });
        await hour.focus();
        await hour.press('ArrowUp'); // from empty: min 09:00, then one hour up
        await expect(s.getByText(/value: 10:00/)).toBeVisible();
        await hour.press('ArrowDown');
        await hour.press('ArrowDown'); // 08:00 is below min: pulled back
        await expect(s.getByText(/value: 09:00/)).toBeVisible();
    });
});

test.describe('pdx-toggle-group', () => {
    test('single: a press changes the value and the paragraph it aligns', async ({ page }) => {
        await gallery(page, 'pdx-toggle-group');
        const s = section(page, 'Single');
        await s.getByRole('button', { name: 'Center' }).click();
        await expect(s.getByText('value: center')).toBeVisible();
        await expect(s.getByRole('button', { name: 'Center' })).toHaveAttribute('aria-pressed', 'true');
        await expect(s.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'false');
        await expect(s.locator('p.aligned')).toHaveCSS('text-align', 'center');
    });

    test('multiple: a second press adds to the value', async ({ page }) => {
        await gallery(page, 'pdx-toggle-group');
        const s = section(page, 'Multiple');
        // By name: each letter toggle is named by its aria-label, not announced by its glyph,
        // "I" for Italic.
        for (const name of ['Bold', 'Italic', 'Underline', 'Strikethrough']) {
            await expect(s.getByRole('button', { name, exact: true }), `no button named ${name}`).toHaveCount(1);
        }
        await s.getByRole('button', { name: 'Italic', exact: true }).click();
        await expect(s.getByText('value: bold,italic')).toBeVisible();
    });

    test('the arrow keys step over a disabled item', async ({ page }) => {
        await gallery(page, 'pdx-toggle-group');
        const s = section(page, 'Disabled item');
        await expect(s.getByRole('button', { name: 'Week' })).toBeDisabled();
        await s.getByRole('button', { name: 'Day' }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(s.getByRole('button', { name: 'Month' })).toBeFocused();
    });
});

test.describe('pdx-field-group', () => {
    test('a nested field shows its error while typing, and the values follow its path', async ({ page }) => {
        await gallery(page, 'pdx-field-group');
        const s = section(page, 'A nested object');
        const field = s.locator('pdx-form-field[name="customer.email"]');
        await field.locator('input').fill('not-an-email');
        await expect(field.getByRole('alert')).toBeVisible();
        await expect(field.locator('input')).toHaveAttribute('aria-invalid', 'true');
        await expect(s.locator('.values-json')).toContainText('"email": "not-an-email"');
    });

    test('a group inside a group writes to the joined path', async ({ page }) => {
        await gallery(page, 'pdx-field-group');
        const s = section(page, 'Groups inside groups');
        await s.locator('pdx-input[name="customer.address.city"] input').fill('Boston');
        await expect(s.locator('.values-json')).toContainText('"city": "Boston"');
    });

    test('a collapsed panel opens on its legend, and a dialog group opens its dialog', async ({ page }) => {
        await gallery(page, 'pdx-field-group');
        const s = section(page, 'Display modes');
        const iban = s.locator('pdx-input[name="billing.iban"] input');
        await expect(iban).toBeHidden();
        await s.getByRole('button', { name: 'Billing (panel, collapsed)' }).click();
        await expect(iban).toBeVisible();
        await s.getByRole('button', { name: 'Emergency contact' }).click();
        await expect(page.getByRole('dialog', { name: 'Emergency contact' })).toBeVisible();
    });
});

test.describe('pdx-field-list', () => {
    test('add and remove rows, and submit the array', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'Rows from itemFields');
        const rows = s.locator('.pdx-field-list-row');
        await expect(rows).toHaveCount(2);
        await s.getByRole('button', { name: '+ Add line' }).first().click();
        await expect(rows).toHaveCount(3);
        await rows.nth(0).getByRole('button', { name: 'Remove' }).click();
        await expect(rows).toHaveCount(2);
        await s.getByRole('button', { name: 'Submit order' }).click();
        await expect(s.locator('.values-json')).toContainText('"product": "Pen"');
        await expect(s.locator('.values-json')).not.toContainText('Notebook');
    });

    test('minItems and maxItems hide remove and add at the bounds', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'Minimum and maximum');
        await expect(s.getByRole('button', { name: 'Remove' })).toHaveCount(0);
        await s.getByRole('button', { name: '+ Add contact' }).first().click();
        await s.getByRole('button', { name: '+ Add contact' }).first().click();
        await expect(s.locator('.pdx-field-list-row')).toHaveCount(3);
        await expect(s.getByRole('button', { name: '+ Add contact' })).toHaveCount(0);
        await expect(s.getByRole('button', { name: 'Remove' })).toHaveCount(3);
    });

    test('a row slot with a picker writes back to its row', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'A row of your own — the row slot');
        const second = s.locator('.pdx-field-list-row').nth(1);
        // A select's trigger is a combobox, not a role="button".
        await second.getByRole('combobox', { name: 'Assignee' }).click();
        await page.getByRole('option', { name: 'Alan Turing' }).click();
        await s.getByRole('button', { name: 'Save tasks' }).click();
        await expect(s.locator('.values-json')).toContainText('"assignee": "alan"');
    });

    // A slot row has a remove button, so the gallery needs no :removable="false" to avoid promising
    // one.
    test('a row slot row can be removed, like any other', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'A row of your own — the row slot');
        const rows = s.locator('.pdx-field-list-row');
        const before = await rows.count();
        await expect(s.getByRole('button', { name: 'Remove' })).toHaveCount(before);
        await rows.nth(0).getByRole('button', { name: 'Remove' }).click();
        await expect(rows).toHaveCount(before - 1);
    });

    // The actions cell is not a block: as one, ✎ and × stack and the row grows to twice a summary row.
    test('display="dialog": each row\'s edit and remove buttons share one line', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'Dialog display');
        const rows = s.locator('.pdx-field-list-row');
        await expect(rows.first()).toBeVisible();
        for (let i = 0; i < await rows.count(); i++) {
            // Both rects in one evaluate: two boundingBox() round-trips can straddle a layout
            // change and subtract two different layouts.
            const { edit, remove } = await rows.nth(i).evaluate((row) => {
                const box = (label: string) => {
                    const r = row.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.getBoundingClientRect();
                    return { x: r.x, y: r.y, height: r.height };
                };
                return { edit: box('Edit'), remove: box('Remove') };
            });
            expect(Math.abs(edit.y - remove.y), `row ${i}: ✎ at ${edit.y} (h ${edit.height}), × at ${remove.y} (h ${remove.height})`).toBeLessThanOrEqual(1);
            expect(remove.x, `row ${i}: × is beside ✎`).toBeGreaterThan(edit.x);
        }
        // The header's actions column is as wide as the cells below it: the columns stay aligned.
        const { header, cell } = await s.evaluate((sec) => {
            const width = (selector: string) => sec.querySelector(selector)!.getBoundingClientRect().width;
            return { header: width('.pdx-field-list-col-actions'), cell: width('.pdx-field-list-cell-actions') };
        });
        expect(Math.abs(header - cell), `header ${header}, cell ${cell}`).toBeLessThanOrEqual(1);
    });

    test('display="dialog" edits a row in a dialog, and Escape closes it', async ({ page }) => {
        await gallery(page, 'pdx-field-list');
        const s = section(page, 'Dialog display');
        await s.getByText('Cambridge', { exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit Item' });
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });
});

test.describe('pdx-overlay-outlet', () => {
    test('a confirm drawn by the outlet starts on the safe answer and resolves the call', async ({ page }) => {
        await gallery(page, 'pdx-overlay-outlet');
        const s = section(page, 'Confirm');
        await s.getByRole('button', { name: 'Delete project…' }).click();
        const confirm = page.getByRole('alertdialog', { name: 'Delete project?' });
        await expect(confirm).toBeVisible();
        await expect(confirm.getByRole('button', { name: 'Keep it' })).toBeFocused();
        await confirm.getByRole('button', { name: 'Keep it' }).click();
        await expect(s.getByText('Last answer: kept')).toBeVisible();
    });

    test('type-to-confirm keeps the button disabled until the name is typed', async ({ page }) => {
        await gallery(page, 'pdx-overlay-outlet');
        const s = section(page, 'Confirm');
        await s.getByRole('button', { name: 'Delete with type-to-confirm…' }).click();
        const confirm = page.getByRole('alertdialog', { name: 'Delete "atlas"?' });
        const del = confirm.getByRole('button', { name: 'Delete' });
        await expect(del).toBeDisabled();
        await confirm.getByRole('textbox').fill('atlas');
        await expect(del).toBeEnabled();
        await del.click();
        await expect(s.getByText('Last answer: atlas deleted')).toBeVisible();
    });

    test('Escape closes only the top of two stacked dialogs', async ({ page }) => {
        await gallery(page, 'pdx-overlay-outlet');
        await section(page, 'Stacking').getByRole('button', { name: 'Open two, one over the other' }).click();
        const top = page.getByRole('alertdialog', { name: 'Reset all settings?' });
        await expect(top).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(top).toHaveCount(0);
        const settings = page.getByRole('dialog', { name: 'Settings' });
        await expect(settings).toBeVisible();
        // Named, not just "inactive" on a failure: where focus is, and in which dialog.
        await expect.poll(() => page.evaluate(() => {
            const a = document.activeElement;
            if (!a || a === document.body) return 'nothing';
            const where = a.closest('[role="dialog"], [role="alertdialog"]')?.getAttribute('aria-label') ?? 'the page';
            return `${a.getAttribute('aria-label') ?? a.textContent?.trim()} in ${where}`;
        })).toBe('Close in Settings');
        // The page is out of the accessibility tree while a modal is open: close the second one too.
        await page.keyboard.press('Escape');
        await expect(settings).toHaveCount(0);
        await expect(section(page, 'Confirm').getByText('Last answer: settings kept')).toBeVisible();
    });
});
