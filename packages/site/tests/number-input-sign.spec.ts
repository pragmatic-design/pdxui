/**
 * pdx-number-input's sign on the site, measured in Chromium.
 *
 * "Colored by sign" (−75.50) reads as negative to a screen reader: aria-valuenow is the signed
 * number, not the unsigned display string; the sign button is named "Negative", not "−"; and the
 * number is drawn in the danger ink, not the text colour.
 */
import { test, expect } from '@playwright/test';

test('a negative value is negative to assistive technology, and drawn in the danger ink', async ({ page }) => {
    await page.goto('/components/pdx-number-input', { waitUntil: 'networkidle' });
    const field = page.getByRole('spinbutton', { name: 'Colored by sign' });
    await expect(field).toHaveAttribute('aria-valuenow', '-75.5');
    await expect(field).toHaveAttribute('aria-valuetext', /^[-−]75\.50$/);

    const host = page.locator('pdx-number-input').filter({ has: field });
    const toggle = host.getByRole('button', { name: 'Negative', exact: true });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const colours = await field.evaluate((input) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--pdx-color-danger-ink)';
        input.parentElement!.appendChild(probe);
        const danger = getComputedStyle(probe).color;
        probe.remove();
        return { text: getComputedStyle(input).color, danger };
    });
    expect(colours.text).toBe(colours.danger);

    await toggle.click();
    await expect(field).toHaveAttribute('aria-valuenow', '75.5');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
