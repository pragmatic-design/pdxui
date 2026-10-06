/**
 * The editable date picker from the keyboard, in Chromium: a date typed in the locale's
 * pattern is committed on Enter and on Tab, one that is not a date is marked invalid with the danger
 * border and keeps the value, and Alt+ArrowDown opens the calendar.
 */
import { test, expect } from '@playwright/test';

test('typed dates: en-US on Enter, it-IT on Tab, an impossible date marked invalid, Alt+ArrowDown opens', async ({ page }) => {
    await page.goto('/components/pdx-date-picker', { waitUntil: 'networkidle' });
    const us = page.getByRole('combobox', { name: 'Delivery date' });
    const usHost = page.locator('pdx-date-picker').filter({ has: us });
    await expect(us).toHaveValue('06/23/2024');
    await expect(us).toHaveJSProperty('tagName', 'INPUT');

    await us.fill('07/04/2024');
    await us.press('Enter');
    await expect(usHost).toHaveJSProperty('value', '2024-07-04');
    await expect(us).not.toHaveAttribute('aria-invalid', 'true');

    // Not a date: marked, the value kept, the text left for the user to fix — and the border says so.
    await us.fill('13/45/2024');
    await us.press('Enter');
    await expect(us).toHaveAttribute('aria-invalid', 'true');
    await expect(usHost).toHaveJSProperty('value', '2024-07-04');
    await expect(us).toHaveValue('13/45/2024');
    const border = await usHost.locator('.pdx-date-picker-trigger').evaluate((t) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--pdx-color-danger)';
        t.appendChild(probe);
        const danger = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(t).borderTopColor, danger };
    });
    expect(border.border).toBe(border.danger);

    // Past max (2024 only): invalid too.
    await us.fill('01/02/2025');
    await us.press('Enter');
    await expect(us).toHaveAttribute('aria-invalid', 'true');

    const it = page.getByRole('combobox', { name: 'Data di consegna' });
    const itHost = page.locator('pdx-date-picker').filter({ has: it });
    await it.fill('23/06/2024');
    await it.press('Tab');
    await expect(itHost).toHaveJSProperty('value', '2024-06-23');
    await expect(it).toHaveValue('23/06/2024');

    await it.focus();
    await page.keyboard.press('Alt+ArrowDown');
    const dialog = itHost.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(it).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
});

// The datetime picker reads the typed time too, not only the date.
test('datetime: a typed 12-hour time sets the field, the panel\'s time and the event; 25:99 is invalid', async ({ page }) => {
    await page.goto('/components/pdx-date-picker', { waitUntil: 'networkidle' });
    const appt = page.getByRole('combobox', { name: 'Appointment' });
    const host = page.locator('pdx-date-picker').filter({ has: appt });
    await host.evaluate((el) => {
        (window as unknown as { __dp: unknown[] }).__dp = [];
        el.addEventListener('pdx-change', (e) => (window as unknown as { __dp: unknown[] }).__dp.push((e as CustomEvent).detail));
    });
    await appt.fill('06/23/2024 2:30 PM');
    await appt.press('Enter');
    await expect(host).toHaveJSProperty('value', '2024-06-23');
    await expect(appt).toHaveValue('06/23/2024 14:30');
    expect(await page.evaluate(() => (window as unknown as { __dp: unknown[] }).__dp)).toEqual([{ value: '2024-06-23', time: '14:30' }]);
    await expect(host.locator('pdx-time-picker')).toHaveJSProperty('value', '14:30');

    await appt.fill('06/23/2024 25:99');
    await appt.press('Enter');
    await expect(appt).toHaveAttribute('aria-invalid', 'true');
    await expect(appt).toHaveValue('06/23/2024 25:99');
});

test('the calendar button is named and opens the calendar', async ({ page }) => {
    await page.goto('/components/pdx-date-picker', { waitUntil: 'networkidle' });
    const us = page.getByRole('combobox', { name: 'Delivery date' });
    const usHost = page.locator('pdx-date-picker').filter({ has: us });
    await usHost.getByRole('button', { name: 'Choose date' }).click();
    await expect(usHost.getByRole('dialog')).toBeVisible();
    await expect(usHost.getByRole('dialog').getByRole('grid')).toHaveAccessibleName('June 2024');
});
